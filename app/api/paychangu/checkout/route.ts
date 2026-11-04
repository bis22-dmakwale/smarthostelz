import { randomBytes } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingApplications, bookingSettings, hostelBookingPayments, paychanguPayments, roomAssignments } from "@/lib/db/schema";
import { requireUser } from "@/lib/server-auth";
import { appUrl } from "@/lib/email";
import { PaychanguError, createCheckout, isPaychanguConfigured } from "@/lib/paychangu";

const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

/** Starts a PayChangu hosted checkout for one month of the signed-in student's hostel rent. */
export async function POST(request: Request) {
  try {
    const user = await requireUser("student");
    if (!isPaychanguConfigured()) return Response.json({ error: "Online payments are not configured yet. Contact the hostel office." }, { status: 503 });

    const body = await request.json().catch(() => null) as { month?: unknown } | null;
    const month = typeof body?.month === "string" ? body.month.trim() : "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "Choose the month you are paying for." }, { status: 400 });
    const now = new Date();
    const nowIndex = now.getFullYear() * 12 + now.getMonth();
    if (Math.abs(monthIndex(month) - nowIndex) > 12) return Response.json({ error: "That month is outside the payable range." }, { status: 400 });

    const db = getDb();
    const [settings] = await db.select().from(bookingSettings).where(eq(bookingSettings.id, "current")).limit(1);
    if (!settings) return Response.json({ error: "The hostel office has not configured the academic year and rent yet." }, { status: 409 });

    const [application] = await db.select({ id: bookingApplications.id }).from(bookingApplications).where(and(
      eq(bookingApplications.studentId, user.id), eq(bookingApplications.academicYear, settings.academicYear), eq(bookingApplications.status, "approved"),
    )).limit(1);
    if (!application) return Response.json({ error: "Book a hostel room first — rent can only be paid after you have been assigned a room." }, { status: 409 });
    const [assignment] = await db.select({ id: roomAssignments.id }).from(roomAssignments).where(and(
      eq(roomAssignments.studentId, user.id), eq(roomAssignments.applicationId, application.id), eq(roomAssignments.active, true),
    )).limit(1);
    if (!assignment) return Response.json({ error: "Your booking has no active room assignment. Contact the hostel office." }, { status: 409 });

    const [paid] = await db.select({ id: hostelBookingPayments.id }).from(hostelBookingPayments).where(and(
      eq(hostelBookingPayments.studentId, user.id), eq(hostelBookingPayments.academicYear, settings.academicYear), eq(hostelBookingPayments.paymentMonth, month),
    )).limit(1);
    if (paid) return Response.json({ error: `Rent for ${month} is already paid.` }, { status: 409 });

    // Re-use a checkout opened in the last 30 minutes instead of stacking up abandoned ones.
    const [open] = await db.select().from(paychanguPayments).where(and(
      eq(paychanguPayments.studentId, user.id), eq(paychanguPayments.academicYear, settings.academicYear),
      eq(paychanguPayments.paymentMonth, month), eq(paychanguPayments.status, "pending"),
      eq(paychanguPayments.amount, settings.monthlyRent), gt(paychanguPayments.createdAt, new Date(Date.now() - 30 * 60_000)),
    )).orderBy(desc(paychanguPayments.createdAt)).limit(1);
    if (open?.checkoutUrl) return Response.json({ checkoutUrl: open.checkoutUrl, txRef: open.txRef, reused: true });

    const txRef = `MUB-RENT-${randomBytes(6).toString("hex").toUpperCase()}`;
    const [firstName, ...rest] = user.name.trim().split(/\s+/);
    const base = appUrl();
    const { checkoutUrl } = await createCheckout({
      amount: settings.monthlyRent, email: user.email, firstName: firstName || "Student", lastName: rest.join(" ") || "Student", txRef,
      callbackUrl: `${base}/api/paychangu/callback`,
      returnUrl: `${base}/student/dashboard`,
      title: "MUBAS hostel rent",
      description: `Hostel rent ${month} (${settings.academicYear})`,
      meta: { studentId: user.id, month, academicYear: settings.academicYear },
    });
    await db.insert(paychanguPayments).values({
      studentId: user.id, academicYear: settings.academicYear, paymentMonth: month,
      amount: settings.monthlyRent, txRef, checkoutUrl,
    });
    return Response.json({ checkoutUrl, txRef }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
    if (error instanceof PaychanguError) return Response.json({ error: error.message }, { status: 502 });
    console.error("PayChangu checkout failed:", error);
    return Response.json({ error: "Unable to start the payment right now. Please try again." }, { status: 500 });
  }
}
