import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { User } from "@/lib/types";

const COOKIE_NAME = "mubas_hostel_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is missing. Add it to smarthostel/.env.local.");
  return value;
}

export function createSessionToken(userId: string) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${userId}.${expires}`;
  const signature = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string) {
  const [userId, expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!userId || !signature || !Number.isFinite(expires) || expires <= Date.now() / 1000) return null;
  const payload = `${userId}.${expiresText}`;
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(signature, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return userId;
}

export async function setSessionCookie(userId: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE_NAME);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const userId = verifySessionToken(token);
  if (!userId) return null;
  const [user] = await getDb().select({
    id: users.id, name: users.name, email: users.email, role: users.role,
    regNo: users.regNo, gender: users.gender, bankAccountNo: users.bankAccountNo,
  }).from(users).where(eq(users.id, userId)).limit(1);
  return user ? { ...user, regNo: user.regNo ?? undefined } : null;
}

export async function requireUser(role?: User["role"]) {
  const user = await currentUser();
  if (!user) throw new Response("Authentication required.", { status: 401 });
  if (role && user.role !== role) throw new Response("You are not authorized to perform this action.", { status: 403 });
  return user;
}
