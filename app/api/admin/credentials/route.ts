import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { generateBankAccountNumber } from "@/lib/bank-account";
import { hashPassword } from "@/lib/password";
import { requireUser } from "@/lib/server-auth";
import { sendStudentCredentials } from "@/lib/email";

export async function POST(request: Request) {
  try {
    await requireUser("admin");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
    const input = body as Record<string, unknown>;
    if (![input.name, input.email, input.regNo].every((value) =>
      typeof value === "string" && value.trim().length > 0)) {
      return Response.json({ error: "Name, email, and registration number are required." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((input.email as string).trim())) return Response.json({ error: "Enter a valid student email address." }, { status: 400 });
    if (!["male", "female"].includes(String(input.gender))) return Response.json({ error: "Choose the student's verified hostel eligibility." }, { status: 400 });

    const password = `MUB-${randomBytes(6).toString("base64url")}`;
    const db = getDb();
    const values = {
      name: (input.name as string).trim(),
      email: (input.email as string).trim().toLowerCase(),
      regNo: (input.regNo as string).trim(),
      gender: input.gender as "male" | "female",
    };
    // The temporary password exists only in server memory: it is emailed to the student and
    // never returned to (or shown to) the admin. If the email cannot be sent, the account is
    // rolled back so no student is ever created that nobody can sign in as.
    const student = await db.transaction(async (tx) => {
      const [created] = await tx.insert(users).values({
        name: values.name,
        email: values.email,
        regNo: values.regNo,
        gender: values.gender,
        bankAccountNo: generateBankAccountNumber(),
        role: "student",
        passwordHash: hashPassword(password),
      }).returning({
        id: users.id, name: users.name, email: users.email, regNo: users.regNo,
        gender: users.gender, bankAccountNo: users.bankAccountNo,
      });
      await sendStudentCredentials({
        to: created.email, name: created.name, regNo: created.regNo ?? values.regNo,
        bankAccountNo: created.bankAccountNo ?? "", password,
      });
      return created;
    });
    return Response.json({ ...student, credentialsEmailed: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Credential issue failed:", error);
    if (error instanceof Error && /SMTP|smtp|EAUTH|ECONNECTION|ETIMEDOUT|Invalid login|Greeting never received|ESOCKET/.test(`${error.message} ${(error as { code?: string }).code ?? ""}`)) {
      return Response.json({ error: "The login email could not be sent, so the account was not created. Check the SMTP settings and try again." }, { status: 502 });
    }
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "23505") return Response.json({ error: "That email or registration number is already in use." }, { status: 409 });
    return Response.json({ error: "Unable to issue student credentials." }, { status: 500 });
  }
}

export async function GET() {
  try {
    await requireUser("admin");
    const students = await getDb().select({
      id: users.id, name: users.name, email: users.email, regNo: users.regNo,
      gender: users.gender, bankAccountNo: users.bankAccountNo,
    }).from(users).where(eq(users.role, "student")).orderBy(users.name);
    return Response.json(students);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Credential list failed:", error);
    return Response.json({ error: "Unable to load student accounts." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireUser("admin");
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== "string" || !["male", "female"].includes(String(body.gender))) {
      return Response.json({ error: "Select a student and their verified hostel eligibility." }, { status: 400 });
    }
    const [student] = await getDb().update(users).set({ gender: body.gender as "male" | "female" })
      .where(and(eq(users.id, body.id), eq(users.role, "student")))
      .returning({ id: users.id, name: users.name, gender: users.gender });
    if (!student) return Response.json({ error: "Student account was not found." }, { status: 404 });
    return Response.json(student);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Eligibility update failed:", error);
    return Response.json({ error: "Unable to update student eligibility." }, { status: 500 });
  }
}
