import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { requireUser } from "@/lib/server-auth";
import { sendStudentCredentials } from "@/lib/email";

/**
 * Issues a fresh temporary password and emails it to the student. The password is never
 * returned in the response, so the admin cannot see it. The old password stays valid
 * unless the email was sent successfully.
 */
export async function POST(request: Request) {
  try {
    await requireUser("admin");
    const body = await request.json().catch(() => null) as { id?: unknown } | null;
    if (!body || typeof body.id !== "string") return Response.json({ error: "Select a student." }, { status: 400 });

    const db = getDb();
    const [student] = await db.select().from(users).where(and(eq(users.id, body.id), eq(users.role, "student"))).limit(1);
    if (!student) return Response.json({ error: "Student account was not found." }, { status: 404 });

    const password = `MUB-${randomBytes(6).toString("base64url")}`;
    await sendStudentCredentials({
      to: student.email, name: student.name, regNo: student.regNo ?? "—",
      bankAccountNo: student.bankAccountNo ?? "—", password,
    });
    await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, student.id));
    return Response.json({ ok: true, email: student.email });
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
    console.error("Credential resend failed:", error);
    return Response.json({ error: "The login email could not be sent. Check the SMTP settings and try again." }, { status: 502 });
  }
}
