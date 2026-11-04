import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hostelBookingPayments, hostelRooms, hostels, paychanguPayments, roomAssignments, users } from "@/lib/db/schema";
import { verifyTransaction } from "@/lib/paychangu";
import { sendPaymentAdminNotice, sendPaymentFailed, sendPaymentSuccess } from "@/lib/email";

export type SettleResult = { status: "success" | "failed" | "pending" | "not-found"; month?: string };

/**
 * Confirms a PayChangu checkout with PayChangu itself and, if it was really paid, records the
 * rent payment and sends the emails. Safe to call repeatedly and concurrently (webhook, browser
 * redirect, manual "check status"): the pending→success transition is atomic, so only one caller
 * records the payment and sends the emails.
 */
export async function settlePaychanguPayment(txRef: string): Promise<SettleResult> {
  const db = getDb();
  const [row] = await db.select().from(paychanguPayments).where(eq(paychanguPayments.txRef, txRef)).limit(1);
  if (!row) return { status: "not-found" };
  if (row.status === "success") return { status: "success", month: row.paymentMonth };

  const verification = await verifyTransaction(txRef, { amount: row.amount, currency: row.currency });
  const [student] = await db.select({
    name: users.name, email: users.email, regNo: users.regNo, bankAccountNo: users.bankAccountNo,
  }).from(users).where(eq(users.id, row.studentId)).limit(1);

  if (verification.state === "pending") return { status: "pending", month: row.paymentMonth };

  if (verification.state === "failed") {
    const [flipped] = await db.update(paychanguPayments).set({ status: "failed" })
      .where(and(eq(paychanguPayments.id, row.id), eq(paychanguPayments.status, "pending"))).returning({ id: paychanguPayments.id });
    if (flipped && student) {
      await sendPaymentFailed({ to: student.email, name: student.name, amount: row.amount, month: row.paymentMonth, reference: txRef });
    }
    return { status: "failed", month: row.paymentMonth };
  }

  // Paid. A "failed" row may still succeed (the customer retried inside the same checkout), so allow both.
  const paidAt = new Date();
  const outcome = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(paychanguPayments).set({
      status: "success", paidAt, providerReference: verification.providerReference, channel: verification.channel,
    }).where(and(eq(paychanguPayments.id, row.id), inArray(paychanguPayments.status, ["pending", "failed"]))).returning({ id: paychanguPayments.id });
    if (!claimed) return null; // another request already settled it
    const [recorded] = await tx.insert(hostelBookingPayments).values({
      studentId: row.studentId, academicYear: row.academicYear, paymentMonth: row.paymentMonth,
      bankAccountNo: student?.bankAccountNo ?? "PAYCHANGU", amount: row.amount, method: "PayChangu", reference: txRef, paidAt,
    }).onConflictDoNothing().returning({ id: hostelBookingPayments.id });
    return { duplicate: !recorded };
  });
  if (!outcome) return { status: "success", month: row.paymentMonth };

  if (student) {
    const [assignment] = await db.select({ hostel: hostels.name, room: hostelRooms.roomNo }).from(roomAssignments)
      .innerJoin(hostelRooms, eq(hostelRooms.id, roomAssignments.roomId))
      .innerJoin(hostels, eq(hostels.id, hostelRooms.hostelId))
      .where(and(eq(roomAssignments.studentId, row.studentId), eq(roomAssignments.active, true))).limit(1);
    await sendPaymentSuccess({
      to: student.email, name: student.name, amount: row.amount, month: row.paymentMonth, academicYear: row.academicYear,
      reference: txRef, paidAt, hostel: assignment?.hostel, room: assignment?.room,
    });
    await sendPaymentAdminNotice({
      studentName: student.name, regNo: student.regNo, amount: row.amount, month: row.paymentMonth,
      reference: txRef, duplicate: outcome.duplicate,
    });
  }
  return { status: "success", month: row.paymentMonth };
}
