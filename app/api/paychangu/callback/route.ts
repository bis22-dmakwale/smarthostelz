import { settlePaychanguPayment } from "@/lib/rent-payments";
import { verifyWebhookSignature } from "@/lib/paychangu";
import { appUrl } from "@/lib/email";

/**
 * PayChangu `callback_url`.
 *  - GET : the customer's browser is redirected here after paying → verify, then send them to the Payments tab.
 *  - POST: server-to-server webhook (works once the app has a public URL) → verify and settle.
 * Neither trusts what the request says: the payment is always re-verified with PayChangu's API.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const txRef = params.get("tx_ref") ?? params.get("txRef") ?? "";
  const target = new URL(`${appUrl()}/student/payments`);
  if (txRef) {
    target.searchParams.set("tx_ref", txRef);
    try {
      const result = await settlePaychanguPayment(txRef);
      target.searchParams.set("result", result.status);
    } catch (error) {
      console.error("PayChangu callback verification failed:", error);
    }
  }
  return Response.redirect(target, 303);
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("signature") ?? request.headers.get("Signature"))) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }

  const meta = (payload.meta && typeof payload.meta === "object" ? payload.meta : {}) as Record<string, unknown>;
  const candidates = [payload.tx_ref, payload.reference, payload.charge_id, meta.tx_ref]
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  try {
    for (const candidate of candidates) {
      const result = await settlePaychanguPayment(candidate);
      if (result.status !== "not-found") break;
    }
  } catch (error) {
    console.error("PayChangu webhook processing failed:", error);
    return Response.json({ error: "Processing failed." }, { status: 500 }); // PayChangu will retry
  }
  return Response.json({ ok: true });
}
