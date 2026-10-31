import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { users } from "../lib/db/schema";
import { generateBankAccountNumber } from "../lib/bank-account";
import { hashPassword } from "../lib/password";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to seed the database.");

const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema: { users } });

async function seedUser(input: {
  name: string;
  email: string;
  password: string;
  role: "admin" | "student";
  regNo?: string;
  gender?: "male" | "female";
}) {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    if ((input.gender && !existing.gender) || (input.role === "student" && !existing.bankAccountNo)) {
      await db.update(users).set({
        ...(input.gender && !existing.gender ? { gender: input.gender } : {}),
        ...(input.role === "student" && !existing.bankAccountNo
          ? { bankAccountNo: generateBankAccountNumber() }
          : {}),
      }).where(eq(users.id, existing.id));
    }
    return existing;
  }
  const [created] = await db.insert(users).values({
    name: input.name,
    email,
    passwordHash: hashPassword(input.password),
    role: input.role,
    regNo: input.regNo,
    gender: input.gender,
    bankAccountNo: input.role === "student" ? generateBankAccountNumber() : undefined,
  }).returning();
  return created;
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("Set SEED_ADMIN_PASSWORD before running the seed command.");

  await seedUser({
    name: process.env.SEED_ADMIN_NAME ?? "Hostel Administrator",
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@mubas.ac.mw",
    password: adminPassword,
    role: "admin",
  });

  const studentPassword = process.env.SEED_STUDENT_PASSWORD;
  if (studentPassword) {
    await seedUser({
      name: process.env.SEED_STUDENT_NAME ?? "Demo Student",
      email: process.env.SEED_STUDENT_EMAIL ?? "student@mubas.ac.mw",
      password: studentPassword,
      role: "student",
      regNo: process.env.SEED_STUDENT_REG_NO ?? "BIS/22/EP/015",
      gender: process.env.SEED_STUDENT_GENDER === "female" ? "female" : "male",
    });
  }

  console.info("Database seed complete.");
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
