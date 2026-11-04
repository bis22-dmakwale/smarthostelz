import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, passwordPolicyError, verifyPassword } from "@/lib/password";
import { requireUser } from "@/lib/server-auth";
import { sendPasswordChangedEmail } from "@/lib/email";

export async function POST(request: Request) {
  try {
    const current = await requireUser();
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

    const { currentPassword, newPassword, confirmPassword } = body;
    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || typeof confirmPassword !== "string"
      || !currentPassword || !newPassword || !confirmPassword) {
      return Response.json({ error: "Enter your current password, the new password, and the confirmation." }, { status: 400 });
    }
    if (newPassword !== confirmPassword) return Response.json({ error: "The new password and confirmation do not match." }, { status: 400 });
    const policy = passwordPolicyError(newPassword);
    if (policy) return Response.json({ error: policy }, { status: 400 });
    if (newPassword === currentPassword) return Response.json({ error: "The new password must be different from your current password." }, { status: 400 });

    const db = getDb();
    const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, current.id)).limit(1);
    if (!row || !verifyPassword(currentPassword, row.passwordHash)) {
      return Response.json({ error: "Your current password is incorrect." }, { status: 400 });
    }
    await db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, current.id));
    await sendPasswordChangedEmail(current.email, current.name);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Password change failed:", error);
    return Response.json({ error: "Unable to update your password right now. Please try again." }, { status: 500 });
  }
}
