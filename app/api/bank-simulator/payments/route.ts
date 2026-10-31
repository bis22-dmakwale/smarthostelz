import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingApplications, bookingSettings, hostelBookingPayments, roomAssignments, users } from "@/lib/db/schema";

function hasValidToken(request: Request, expected: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  const provided = Buffer.from(authorization.slice(prefix.length));
  const secret = Buffer.from(expected);
  return provided.length === secret.length && timingSafeEqual(provided, secret);
}

export async function POST(request: Request) {
  const token = process.env.BANK_SIMULATOR_TOKEN;
  if (!token) {
    console.error("Bank simulator request rejected: BANK_SIMULATOR_TOKEN is not configured.");
    return Response.json({ error: "The bank simulator is not configured." }, { status: 503 });
  }
  if (!hasValidToken(request, token)) {
    return Response.json({ error: "A valid bank simulator bearer token is required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid payment event." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const bankAccountNo = typeof input.bankAccountNo === "string" ? input.bankAccountNo.trim() : "";
  const amount = input.amount;
  const paymentMonth = typeof input.month === "string" ? input.month.trim() : "";
  const reference = typeof input.reference === "string" ? input.reference.trim() : "";
  if (!/^MUB\d{10}$/.test(bankAccountNo)
    || typeof amount !== "number" || !Number.isInteger(amount) || amount < 1
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(paymentMonth)
    || !reference || reference.length > 150) {
    return Response.json({ error: "Provide the student bank account number, rent amount, payment month as YYYY-MM, and bank reference." }, { status: 400 });
  }

  try {
    const payment = await getDb().transaction(async (tx) => {
      const [student] = await tx.select({
        id: users.id,
        bankAccountNo: users.bankAccountNo,
      }).from(users).where(and(
        eq(users.bankAccountNo, bankAccountNo),
        eq(users.role, "student"),
      )).limit(1);
      if (!student?.bankAccountNo) throw new Response("No student matches that bank account number.", { status: 404 });

      const [settings] = await tx.select().from(bookingSettings)
        .where(eq(bookingSettings.id, "current")).limit(1);
      if (!settings) throw new Response("The hostel office has not configured a booking year and rent amount.", { status: 409 });
      if (amount !== settings.monthlyRent) {
        throw new Response(`Payment amount must match the configured hostel rent of ${settings.monthlyRent}.`, { status: 409 });
      }

      const [application] = await tx.select({ id: bookingApplications.id }).from(bookingApplications).where(and(
        eq(bookingApplications.studentId, student.id),
        eq(bookingApplications.academicYear, settings.academicYear),
        eq(bookingApplications.status, "approved"),
      )).limit(1);
      if (!application) {
        throw new Response("Rent can only be recorded after a student has been assigned and approved for this academic year.", { status: 409 });
      }
      const [assignment] = await tx.select({ id: roomAssignments.id }).from(roomAssignments).where(and(
        eq(roomAssignments.studentId, student.id),
        eq(roomAssignments.applicationId, application.id),
        eq(roomAssignments.active, true),
      )).limit(1);
      if (!assignment) {
        throw new Response("This booking has no active room assignment. Contact the hostel office before recording rent.", { status: 409 });
      }

      const [existing] = await tx.select().from(hostelBookingPayments).where(and(
        eq(hostelBookingPayments.studentId, student.id),
        eq(hostelBookingPayments.academicYear, settings.academicYear),
        eq(hostelBookingPayments.paymentMonth, paymentMonth),
      )).limit(1);
      if (existing) {
        if (existing.reference === reference && existing.amount === amount && existing.bankAccountNo === bankAccountNo) {
          return { payment: existing, alreadyRecorded: true };
        }
        throw new Response(`Rent for ${paymentMonth} is already recorded for academic year ${settings.academicYear}.`, { status: 409 });
      }

      const [created] = await tx.insert(hostelBookingPayments).values({
        studentId: student.id,
        academicYear: settings.academicYear,
        paymentMonth,
        bankAccountNo: student.bankAccountNo,
        amount,
        reference,
      }).returning();
      return { payment: created, alreadyRecorded: false };
    });
    return Response.json(payment, { status: payment.alreadyRecorded ? 200 : 201 });
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return Response.json({ error: "This bank reference or student rent payment for that month has already been recorded." }, { status: 409 });
    }
    console.error("Bank simulator payment failed:", error);
    return Response.json({ error: "Unable to record the simulated bank payment." }, { status: 500 });
  }
}
