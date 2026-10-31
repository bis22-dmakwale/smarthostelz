import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";
import { setSessionCookie } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (!body || typeof body !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });
    const { email, password } = body as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return Response.json({ error: "Email and password are required." }, { status: 400 });
    }

    const [user] = await getDb().select({
      id: users.id, name: users.name, email: users.email, passwordHash: users.passwordHash,
      role: users.role, regNo: users.regNo, gender: users.gender,
    }).from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await setSessionCookie(user.id);
    return Response.json({
      id: user.id, name: user.name, email: user.email, role: user.role, regNo: user.regNo,
    });
  } catch (error) {
    console.error("Login failed:", error);
    return Response.json({ error: "Unable to sign in. Check the database configuration and try again." }, { status: 500 });
  }
}
