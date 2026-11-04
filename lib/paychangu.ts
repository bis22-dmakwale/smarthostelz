import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const API = (process.env.PAYCHANGU_API_URL ?? "https://api.paychangu.com").replace(/\/$/, ""); // override only for local mock tests

export function isPaychanguConfigured() {
  return Boolean(process.env.PAYCHANGU_SECRET_KEY);
}

function headers() {
  return { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}` };
}

export async function createCheckout(input: {
  amount: number; email: string; firstName: string; lastName: string; txRef: string;
  callbackUrl: string; returnUrl: string; title: string; description: string; meta?: Record<string, string>;
}) {
  const response = await fetch(`${API}/payment`, {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      amount: input.amount,
      currency: "MWK",
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      callback_url: input.callbackUrl,
      return_url: input.returnUrl,
      tx_ref: input.txRef,
      customization: { title: input.title, description: input.description },
      meta: input.meta ?? {},
    }),
  });
  const payload = await response.json().catch(() => null) as {
    status?: string; message?: unknown; data?: { checkout_url?: string; data?: { tx_ref?: string } };
  } | null;
  const checkoutUrl = payload?.data?.checkout_url;
  if (!response.ok || payload?.status !== "success" || !checkoutUrl) {
    console.error("PayChangu checkout failed:", response.status, JSON.stringify(payload));
    const message = typeof payload?.message === "string" ? payload.message : "PayChangu could not start the payment.";
    throw new PaychanguError(message);
  }
  return { checkoutUrl };
}

export class PaychanguError extends Error {}

export type Verification =
  | { state: "success"; amount: number; currency: string; providerReference: string | null; channel: string | null }
  | { state: "failed" }
  | { state: "pending" };

/** Server-side check with PayChangu. This — never the browser redirect — decides whether a payment counts. */
export async function verifyTransaction(txRef: string, expected: { amount: number; currency: string }): Promise<Verification> {
  const response = await fetch(`${API}/verify-payment/${encodeURIComponent(txRef)}`, {
    method: "GET", headers: headers(), signal: AbortSignal.timeout(20_000),
  });
  // Unknown reference (checkout abandoned before a charge was attempted) or provider hiccup: not paid yet.
  if (response.status === 404) return { state: "pending" };
  const payload = await response.json().catch(() => null) as {
    status?: string;
    data?: {
      status?: string; tx_ref?: string; amount?: number | string; currency?: string; reference?: string | null;
      authorization?: { channel?: string | null } | null;
    } | null;
  } | null;
  if (!response.ok || !payload?.data) {
    if (response.status >= 500 || response.status === 401 || response.status === 403) {
      throw new PaychanguError(`PayChangu verification failed (HTTP ${response.status}).`);
    }
    return { state: "pending" };
  }
  const data = payload.data;
  const status = String(data.status ?? "").toLowerCase();
  if (status === "success" || status === "successful") {
    const amount = Number(data.amount);
    if (data.tx_ref !== txRef || data.currency !== expected.currency || !(amount >= expected.amount)) {
      console.error("PayChangu verification mismatch:", txRef, JSON.stringify({ tx_ref: data.tx_ref, amount: data.amount, currency: data.currency }));
      return { state: "failed" };
    }
    return { state: "success", amount, currency: data.currency, providerReference: data.reference ?? null, channel: data.authorization?.channel ?? null };
  }
  if (["failed", "cancelled", "canceled", "expired"].includes(status)) return { state: "failed" };
  return { state: "pending" };
}

/** Webhook `Signature` header = HMAC-SHA256 (hex) of the raw request body using the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.PAYCHANGU_WEBHOOK_SECRET;
  if (!secret) return true; // optional: every webhook is still re-verified against the PayChangu API
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim().toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}
