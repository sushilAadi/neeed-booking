import { createHmac, timingSafeEqual } from "node:crypto";
import type { Dose, Med, Rx } from "./parse";

const TTL = 6 * 3600_000;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sig = (body: string, secret: string) =>
  createHmac("sha256", `rx-link:${secret}`).update(body).digest("base64url");

/** A link token for one appointment's prescription page, valid for 6 hours. */
export function signRxToken(
  appointmentId: string,
  now: Date,
  secret: string,
): string {
  const body = b64(`${appointmentId}.${+now + TTL}`);
  return `${body}.${sig(body, secret)}`;
}

/** The appointment id, or null when the token is forged, malformed or expired. */
export function verifyRxToken(
  token: string,
  now: Date,
  secret: string,
): string | null {
  if (!secret) return null;
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const want = Buffer.from(sig(body, secret));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [id, exp] = Buffer.from(body, "base64url").toString().split(".");
  if (!id || !(Number(exp) > +now)) return null;
  return id;
}

const DOSES = new Set([0, 0.5, 1, 2, 3]);
const FOODS = new Set(["before", "after", "any", null]);
const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/** Validates the page's JSON (untrusted). Null when anything is off. */
export function cleanRxPayload(body: unknown): Rx | null {
  // biome-ignore lint/suspicious/noExplicitAny: untrusted JSON, checked field by field
  const b = body as any;
  if (!b || !Array.isArray(b.meds) || b.meds.length > 20) return null;
  const meds: Med[] = [];
  for (const m of b.meds) {
    const name = str(m?.name, 80);
    if (!name) continue;
    let dose: Dose | null = null;
    if (m.dose !== null && m.dose !== undefined) {
      if (
        !Array.isArray(m.dose) ||
        m.dose.length !== 3 ||
        !m.dose.every((v: unknown) => DOSES.has(v as number))
      )
        return null;
      dose = [m.dose[0], m.dose[1], m.dose[2]];
    }
    const food = m.food ?? null;
    if (!FOODS.has(food)) return null;
    const duration = str(m.duration, 20) || null;
    meds.push({
      name,
      dose,
      ...(m.sos === true ? { sos: true as const } : {}),
      food,
      duration,
    });
  }
  if (!meds.length) return null;
  const advice = str(b.advice, 500);
  return { meds, advice: advice ? [advice] : [] };
}
