import { randomInt } from "node:crypto";

export function generateBankAccountNumber() {
  return `MUB${randomInt(0, 10_000_000_000).toString().padStart(10, "0")}`;
}