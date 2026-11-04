import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { passwordResetTokens, users } from "@/lib/db/schema";
import { sendPasswordResetEmail } from "@/lib/email";

const TOKEN_MINUTES = 30;
const GENERIC = { ok: true, message: "If an account exists for that email, a reset link has been sent." };

export async function POST(request: Request) {
  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    if (typeof body.email === "string") email = body.email.trim().toLowerCase();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!email || email.length > 254 || !email.includes("@")) return Response.json({ error: "Enter a valid email address." }, { status: 400 });

  try {
    const db = getDb();
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      // Invalidate any earlier unused links, then issue a fresh single-use one.
      await db.update(passwordResetTokens).set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
      const token = randomBytes(32).toString("hex");
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000),
      });
      const base = (process.env.APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");
      await sendPasswordResetEmail(user.email, user.name, `${base}/reset-password?token=${token}`)
        .catch((error) => console.error("Password reset email failed:", error));
    }
  } catch (error) {
    console.error("Forgot password failed:", error);
    return Response.json({ error: "Unable to process the request right now. Please try again." }, { status: 500 });
  }
  // Same response whether or not the account exists, so emails can't be enumerated.
  return Response.json(GENERIC);
}
