import type { Gender, Store } from "../db/types";

/** Indian mobile → "91" + 10 digits (the WhatsApp id), or null. */
export function normalizePhone(input: string): string | null {
  if (/[^\d\s()+-]/.test(input)) return null;
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `91${d}` : null;
}

/** Details from the patient's newest visit, to prefill the Add patient form. */
export async function lastPatientDetails(
  store: Store,
  doctorId: string,
  phone: string,
): Promise<{
  name: string;
  age: number | null;
  gender: Gender | null;
  area: string | null;
} | null> {
  const [last] = await store.patientAppointments(doctorId, phone);
  if (!last) return null;
  return {
    name: last.patientName,
    age: last.patientAge,
    gender: last.patientGender,
    area: last.patientArea,
  };
}

/** "Ramesh Kumar, 45" or "45 Ramesh Kumar" → name + age (0–120); no age → null. */
export function parseNameAge(text: string): {
  name: string;
  age: number | null;
} {
  const t = text.trim().replace(/\s+/g, " ");
  const after = /^(.*?)[\s,.\-–]*(\d{1,3})$/.exec(t); // "Ramesh Kumar, 45"
  const before = /^(\d{1,3})[\s,.\-–]+(\D.*)$/.exec(t); // "45 Ramesh Kumar"
  const [name, num] = after
    ? [after[1], after[2]]
    : before
      ? [before[2], before[1]]
      : [t, ""];
  const age = num ? Number(num) : Number.NaN;
  if (!(age >= 0 && age <= 120)) return { name: t, age: null };
  return { name: name.replace(/[\s,.\-–]+$/, "").trim(), age };
}
