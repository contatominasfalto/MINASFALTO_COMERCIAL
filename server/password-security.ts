import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;
  const [algorithm, saltValue, hashValue] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  try {
    const expected = Buffer.from(hashValue, "base64");
    const derived = (await scrypt(password, Buffer.from(saltValue, "base64"), expected.length)) as Buffer;
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}
