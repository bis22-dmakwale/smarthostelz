import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { paychanguPayments } from "@/lib/db/schema";
import { requireUser } from "@/lib/server-auth";
import { PaychanguError } from "@/lib/paychangu";
import { settlePaychanguPayment } from "@/lib/rent-payments";

/** Lets a student re-check one of their own payments (used on return from PayChangu and by "Check status"). */
export async function POST(request: Request) {
  try {
    const user = await requireUser("student");
    const body = await request.json().catch(() => null) as { txRef?: unknown } | null;
    if (typeof body?.txRef !== "string" || !body.txRef) return Response.json({ error: "Missing payment reference." }, { status: 400 });
    const [own] = await getDb().select({ id: paychanguPayments.id }).from(paychanguPayments)
      .where(and(eq(paychanguPayments.txRef, body.txRef), eq(paychanguPayments.studentId, user.id))).limit(1);
    if (!own) return Response.json({ error: "Payment not found." }, { status: 404 });
    return Response.json(await settlePaychanguPayment(body.txRef));
  } catch (error) {
    if (error instanceof Response) return Response.json({ error: await error.text() }, { status: error.status });
    if (error instanceof PaychanguError) return Response.json({ error: error.message }, { status: 502 });
    console.error("PayChangu verify failed:", error);
    return Response.json({ error: "Unable to check the payment right now." }, { status: 500 });
  }
}
