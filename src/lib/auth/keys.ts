import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import type { Role } from "../db/types";

/** No 0/O, 1/I/L: easy to read aloud and type. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PREFIX: Record<Role, string> = { doctor: "DR", reception: "RC" };

/** A new secret login key, e.g. "DR-K7QP-92XM-4TWH". Shown once, stored only as a hash. */
export function generateKey(
  role: Role,
  rand: (n: number) => Uint8Array = randomBytes,
): string {
  let body = "";
  while (body.length < 12)
    for (const b of rand(16)) {
      // rejection sampling keeps every character equally likely
      if (b < 248 && body.length < 12) body += ALPHABET[b % ALPHABET.length];
    }
  return `${PREFIX[role]}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8)}`;
}

/** "DR" + 12 characters, uppercase, or null when it can't be a key. */
export function normalizeKey(input: string): string | null {
  const k = input.replace(/[\s-]/g, "").toUpperCase();
  if (!/^(DR|RC)/.test(k) || k.length !== 14) return null;
  for (const ch of k.slice(2)) if (!ALPHABET.includes(ch)) return null;
  return k;
}

export const hashKey = (normalized: string, pepper: string) =>
  createHmac("sha256", `staff-key:${pepper}`).update(normalized).digest("hex");

// The doctor can view staff keys later (Settings → Staff), so a sealed copy is kept
// next to the hash: AES-256-GCM with a key derived from the pepper. Login still uses the hash.
const encKey = (pepper: string) =>
  createHash("sha256").update(`staff-key-enc:${pepper}`).digest();

export function sealKey(key: string, pepper: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(pepper), iv);
  const body = Buffer.concat([c.update(key, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** The key, or null when the blob is missing, tampered or sealed with another pepper. */
export function openKey(blob: string, pepper: string): string | null {
  try {
    const b = Buffer.from(blob, "base64url");
    if (b.length < 29) return null;
    const d = createDecipheriv(
      "aes-256-gcm",
      encKey(pepper),
      b.subarray(0, 12),
    );
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
}
