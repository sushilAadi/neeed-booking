import type { Appointment, Store } from "../db/types";

/**
 * Visits for the History page, newest first. 4+ digits search the phone
 * (spaces, dashes, +91 or a leading 0 ignored); anything else searches the name.
 */
export async function searchVisits(
  store: Store,
  doctorId: string,
  q: string,
  range: { from: Date; to: Date },
  page: { limit: number; before?: Date },
): Promise<{ visits: Appointment[]; more: boolean }> {
  const text = q.trim().slice(0, 80);
  let digits = text.replace(/[\s()+-]/g, "");
  const isPhone = /^\d{4,}$/.test(digits);
  if (isPhone && digits.length === 11 && digits.startsWith("0"))
    digits = digits.slice(1);
  const rows = await store.searchAppointments(doctorId, {
    ...range,
    ...(isPhone ? { phone: digits } : text ? { name: text } : {}),
    limit: page.limit + 1,
    before: page.before,
  });
  return { visits: rows.slice(0, page.limit), more: rows.length > page.limit };
}
