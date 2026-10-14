import { createHmac, timingSafeEqual } from "node:crypto";

const TTL = 30 * 24 * 3600_000;
export const SESSION_COOKIE = "neeed_session";
export const SESSION_MAX_AGE = TTL / 1000;

type Session = { staffId: string; keyVersion: number };

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sig = (body: string, secret: string) =>
  createHmac("sha256", `session:${secret}`).update(body).digest("base64url");

/** Signed cookie value; the device stays logged in for 30 days. */
export function signSession(p: Session, now: Date, secret: string): string {
  const body = b64(
    JSON.stringify({ s: p.staffId, v: p.keyVersion, e: +now + TTL }),
  );
  return `${body}.${sig(body, secret)}`;
}

export function verifySession(
  token: string,
  now: Date,
  secret: string,
): Session | null {
  if (!secret) return null;
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const want = Buffer.from(sig(body, secret));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof p.s !== "string" || typeof p.v !== "number") return null;
    if (!(Number(p.e) > +now)) return null;
    return { staffId: p.s, keyVersion: p.v };
  } catch {
    return null;
  }
}
