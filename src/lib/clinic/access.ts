import type { Store } from "../db/types";
import { normalizePhone } from "./patient";

export type AccessInput = {
  doctorName: string;
  clinicName: string;
  city: string;
  phone: string;
  email: string;
  ip: string;
};
type Field = "doctorName" | "clinicName" | "city" | "phone" | "email" | "form";
export type AccessResult =
  | { ok: true }
  | { ok: false; errors: Partial<Record<Field, string>> };

const HOUR = 3600_000;
const MAX_PER_HOUR = 5;

/** Saves a doctor's request to join; the WhatsApp alert is best effort. */
export async function requestAccess(
  store: Store,
  input: AccessInput,
  now: Date,
  alert: (text: string) => Promise<void>,
): Promise<AccessResult> {
  const doctorName = input.doctorName.trim().slice(0, 80);
  const clinicName = input.clinicName.trim().slice(0, 80);
  const city = input.city.trim().slice(0, 80);
  const email = input.email.trim().slice(0, 120);
  const phone = normalizePhone(input.phone);
  const errors: Partial<Record<Field, string>> = {};
  if (!doctorName) errors.doctorName = "Type your name.";
  if (!clinicName) errors.clinicName = "Type your clinic's name.";
  if (!city) errors.city = "Type your city.";
  if (!phone) errors.phone = "Type a 10-digit Indian mobile number.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = "Check the email, or leave it empty.";
  if (Object.keys(errors).length) return { ok: false, errors };
  if (
    (await store.accessRequestsSince(input.ip, new Date(+now - HOUR))) >=
    MAX_PER_HOUR
  )
    return {
      ok: false,
      errors: { form: "Too many requests. Try again in an hour." },
    };
  await store.addAccessRequest(
    {
      doctorName,
      clinicName,
      city,
      phone: phone as string,
      email: email || null,
      ip: input.ip,
    },
    now,
  );
  await alert(
    `*New access request*\n${doctorName} · ${clinicName}, ${city}\n+${phone}${email ? `\n${email}` : ""}`,
  ).catch(() => {});
  return { ok: true };
}
