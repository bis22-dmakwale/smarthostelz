import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { hashPassword, passwordPolicyError } from "@/lib/password";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

  const { token, newPassword, confirmPassword } = body;
  if (typeof token !== "string" || !token || typeof newPassword !== "string" || typeof confirmPassword !== "string") {
    return Response.json({ error: "Enter and confirm your new password." }, { status: 400 });
  }
  if (newPassword !== confirmPassword) return Response.json({ error: "The new password and confirmation do not match." }, { status: 400 });
  const policy = passwordPolicyError(newPassword);
  if (policy) return Response.json({ error: policy }, { status: 400 });

  try {
    const db = getDb();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    // Claim the token atomically so a link can only ever be used once.
    const [claimed] = await db.update(passwordResetTokens).set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
      .returning({ userId: passwordResetTokens.userId });
    if (!claimed) return Response.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });
    await db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, claimed.userId));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Password reset failed:", error);
    return Response.json({ error: "Unable to reset your password right now. Please try again." }, { status: 500 });
  }
}
