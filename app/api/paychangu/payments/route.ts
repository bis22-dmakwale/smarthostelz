import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paychanguPayments, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/server-auth";
import { isPaychanguConfigured } from "@/lib/paychangu";

export async function GET() {
  try {
    const user = await requireUser();
    const db = getDb();
    const columns = {
      id: paychanguPayments.id, paymentMonth: paychanguPayments.paymentMonth, academicYear: paychanguPayments.academicYear,
      amount: paychanguPayments.amount, currency: paychanguPayments.currency, txRef: paychanguPayments.txRef,
      status: paychanguPayments.status, channel: paychanguPayments.channel, createdAt: paychanguPayments.createdAt, paidAt: paychanguPayments.paidAt,
    };
    if (user.role === "admin") {
      return Response.json({ configured: isPaychanguConfigured(), payments: await db.select({ ...columns, studentName: users.name, regNo: users.regNo })
        .from(paychanguPayments).innerJoin(users, eq(users.id, paychanguPayments.studentId)).orderBy(desc(paychanguPayments.createdAt)).limit(200) });
    }
    return Response.json({ configured: isPaychanguConfigured(), payments: await db.select(columns).from(paychanguPayments)
      .where(eq(paychanguPayments.studentId, user.id)).orderBy(desc(paychanguPayments.createdAt)).limit(50) });
  } catch (error) {
    return Response.json({ error: error instanceof Response ? await error.text() : "Unable to load online payments." }, {
      status: error instanceof Response ? error.status : 500,
    });
  }
}
