import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingApplications, bookingSettings, hostelBookingPayments } from "@/lib/db/schema";
import { requireUser } from "@/lib/server-auth";

export async function GET() {
  try {
    const user = await requireUser();
    const db = getDb();
    const [settings] = await db.select().from(bookingSettings).where(eq(bookingSettings.id, "current")).limit(1);
    if (user.role === "admin") return Response.json({ settings: settings ?? null });
    const [yearBooking] = settings ? await db.select({ id: bookingApplications.id }).from(bookingApplications).where(and(
      eq(bookingApplications.studentId, user.id),
      eq(bookingApplications.academicYear, settings.academicYear),
      eq(bookingApplications.status, "approved"),
    )).limit(1) : [];
    const rentPayments = settings && user.bankAccountNo ? await db.select({
      paymentMonth: hostelBookingPayments.paymentMonth,
      amount: hostelBookingPayments.amount,
      reference: hostelBookingPayments.reference,
      paidAt: hostelBookingPayments.paidAt,
    }).from(hostelBookingPayments).where(and(
      eq(hostelBookingPayments.studentId, user.id),
      eq(hostelBookingPayments.academicYear, settings.academicYear),
      eq(hostelBookingPayments.bankAccountNo, user.bankAccountNo),
    )).orderBy(hostelBookingPayments.paymentMonth) : [];
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentMonthPayment = rentPayments.find((payment) => payment.paymentMonth === currentMonth);
    return Response.json({
      settings: settings ?? null,
      isOpen: Boolean(settings && now >= settings.opensAt && now <= settings.closesAt),
      student: { bankAccountNo: user.bankAccountNo ?? null, regNo: user.regNo ?? null, gender: user.gender ?? null },
      alreadyBooked: Boolean(yearBooking),
      currentMonth,
      currentMonthPayment: currentMonthPayment ?? null,
      rentPayments,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Response ? await error.text() : "Unable to load booking window." }, {
      status: error instanceof Response ? error.status : 500,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireUser("admin");
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const academicYear = typeof body.academicYear === "string" ? body.academicYear.trim() : "";
    const yearMatch = /^(\d{4})\/(\d{4})$/.exec(academicYear);
    const opensAt = typeof body.opensAt === "string" ? new Date(body.opensAt) : new Date(NaN);
    const closesAt = typeof body.closesAt === "string" ? new Date(body.closesAt) : new Date(NaN);
    if (!yearMatch || Number(yearMatch[2]) !== Number(yearMatch[1]) + 1
      || !Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) || closesAt <= opensAt
      || !Number.isInteger(body.monthlyRent) || Number(body.monthlyRent) < 1) {
      return Response.json({ error: "Provide a consecutive academic year, valid opening and closing dates, and a positive monthly rent." }, { status: 400 });
    }
    const [settings] = await getDb().insert(bookingSettings).values({
      id: "current", academicYear, opensAt, closesAt, monthlyRent: Number(body.monthlyRent), updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: bookingSettings.id,
      set: { academicYear, opensAt, closesAt, monthlyRent: Number(body.monthlyRent), updatedAt: new Date() },
    }).returning();
    return Response.json(settings);
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
    console.error("Booking window update failed:", error);
    return Response.json({ error: "Unable to save the booking window." }, { status: 500 });
  }
}