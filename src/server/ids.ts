import "server-only";
import { randomBytes, randomInt } from "node:crypto";

// ตัดตัวที่อ่านสับสนออก (0/O, 1/I)
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function examCode(): string {
  return Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export function roomCode(): string {
  return String(randomInt(100000, 1000000));
}

export function secretToken(): string {
  return randomBytes(24).toString("base64url");
}
