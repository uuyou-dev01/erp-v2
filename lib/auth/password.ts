import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const HASH_PREFIX = "scrypt";
const LEGACY_DEMO_PASSWORDS = new Set([
  "hashed_password_placeholder",
]);

export async function hashPassword(password: string) {
  if (password.length < 8) {
    throw new Error("密码至少需要 8 位");
  }
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${HASH_PREFIX}$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [prefix, salt, expectedHex] = storedHash.split("$");
  if (prefix === HASH_PREFIX && salt && expectedHex) {
    const expected = Buffer.from(expectedHex, "hex");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    return timingSafeEqual(actual, expected);
  }

  if (
    process.env.NODE_ENV !== "production" &&
    LEGACY_DEMO_PASSWORDS.has(storedHash)
  ) {
    return password === (process.env.ERP_DEMO_PASSWORD ?? "admin123");
  }

  return false;
}
