import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bookingApplications, payments, receipts, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/server-auth";

export async function GET() {
  try {
    const user = await requireUser();
    const db = getDb();
    if (user.role === "admin") {
      return Response.json(await db.select({
        payment: payments, studentName: users.name, regNo: users.regNo,
        semester: bookingApplications.semester, confirmationNo: bookingApplications.confirmationNo,
        receiptId: receipts.id,
      }).from(payments).innerJoin(users, eq(users.id, payments.studentId))
        .innerJoin(bookingApplications, eq(bookingApplications.id, payments.applicationId))
        .leftJoin(receipts, eq(receipts.paymentId, payments.id))
        .orderBy(desc(payments.submittedAt)));
    }
    return Response.json(await db.select({
      payment: payments, semester: bookingApplications.semester,
      confirmationNo: bookingApplications.confirmationNo,
    }).from(payments).innerJoin(bookingApplications, eq(bookingApplications.id, payments.applicationId))
      .where(eq(payments.studentId, user.id)).orderBy(desc(payments.submittedAt)));
  } catch (error) {
    return Response.json({ error: error instanceof Response ? await error.text() : "Unable to load payment records." }, {
      status: error instanceof Response ? error.status : 500,
    });
  }
}

export async function POST() {
  try {
    await requireUser("student");
    return Response.json({
      error: "Student payment submissions are disabled. Hostel payment status is recorded through the bank simulator and shown on the booking page.",
    }, { status: 410 });
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
    if (error instanceof Error && error.message.toLowerCase().includes("unique")) {
      return Response.json({ error: "That payment method and reference have already been submitted." }, { status: 409 });
    }
    console.error("Payment proof submission failed:", error);
    return Response.json({ error: "Unable to submit payment proof." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireUser("admin");
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.id !== "string" || !["verified", "rejected"].includes(String(body.status))) {
      return Response.json({ error: "Choose a payment and a valid verification status." }, { status: 400 });
    }
    const db = getDb();
    const updated = await db.transaction(async (tx) => {
      const [payment] = await tx.update(payments).set({
        status: body.status as string, verifiedAt: new Date(),
      }).where(and(eq(payments.id, body.id as string), eq(payments.status, "pending"))).returning();
      if (!payment) throw new Response("Payment not found or already reviewed.", { status: 409 });
      if (payment.status === "verified") {
        const [application] = await tx.select().from(bookingApplications)
          .where(and(eq(bookingApplications.id, payment.applicationId), eq(bookingApplications.status, "approved"))).limit(1);
        if (!application) throw new Response("The linked booking is no longer approved.", { status: 409 });
      }
      return payment;
    });
    return Response.json(updated);
  } catch (error) {
    return Response.json({ error: error instanceof Response ? await error.text() : "Unable to verify payment proof." }, {
      status: error instanceof Response ? error.status : 500,
    });
  }
}