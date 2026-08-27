import { createHash, randomBytes, randomInt } from "node:crypto";

const PUBLIC_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPublicCode(prefix: "ORG" | "STORE", length = 8) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += PUBLIC_CODE_ALPHABET[randomInt(PUBLIC_CODE_ALPHABET.length)];
  }
  return `${prefix}-${value}`;
}
