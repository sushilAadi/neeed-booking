import type { Appointment } from "../db/types";
import { addDays, istDate } from "../time";

const month = (d: Date) => istDate(d).slice(0, 7);

/** The last n IST months, oldest first, e.g. ["2025-11", …, "2026-10"]. */
function lastMonths(now: Date, n: number): string[] {
  let [y, m] = istDate(now).slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) [y, m] = [y - 1, 12];
  }
  return out;
}

const byMonth = <T>(months: string[], make: (m: string) => T) =>
  months.map((m) => ({ month: m, ...make(m) }));

/** Everything the Reports page shows, from the clinic's appointments. */
export function buildReports(appts: Appointment[], now: Date) {
  const today = istDate(now);
  const thisMonth = today.slice(0, 7);
  const months = lastMonths(now, 12);
  const done = appts.filter((a) => a.status === "COMPLETED");
  const sum = (list: Appointment[]) =>
    list.reduce((n, a) => n + (a.fee ?? 0), 0);
  const doneOn = (pred: (a: Appointment) => boolean) => done.filter(pred);

  // a visit is "new" when it is that phone number's first-ever booking at this clinic
  const first = new Map<string, number>();
  for (const a of appts) {
    const t = +a.startsAt;
    if (!first.has(a.patientPhone) || t < (first.get(a.patientPhone) as number))
      first.set(a.patientPhone, t);
  }
  const kept = appts.filter((a) => a.status !== "CANCELLED");

  const todayDone = doneOn((a) => istDate(a.startsAt) === today);
  const monthDone = doneOn((a) => month(a.startsAt) === thisMonth);
  return {
    today: { collection: sum(todayDone), seen: todayDone.length },
    month: { collection: sum(monthDone), seen: monthDone.length },
    collectionByMonth: months.map((m) => ({
      month: m,
      amount: sum(doneOn((a) => month(a.startsAt) === m)),
    })),
    patientsByDay: Array.from({ length: 30 }, (_, k) =>
      addDays(today, k - 29),
    ).map((date) => ({
      date,
      count: doneOn((a) => istDate(a.startsAt) === date).length,
    })),
    patientsByMonth: months.map((m) => ({
      month: m,
      count: doneOn((a) => month(a.startsAt) === m).length,
    })),
    newVsReturning: byMonth(months, (m) => {
      const list = kept.filter((a) => month(a.startsAt) === m);
      const fresh = list.filter(
        (a) => first.get(a.patientPhone) === +a.startsAt,
      ).length;
      return { new: fresh, returning: list.length - fresh };
    }),
    bySource: byMonth(months, (m) => {
      const list = appts.filter((a) => month(a.startsAt) === m);
      return {
        whatsapp: list.filter((a) => a.source === "whatsapp").length,
        reception: list.filter((a) => a.source === "reception").length,
      };
    }),
    cancellations: byMonth(months, (m) => {
      const list = appts.filter(
        (a) => a.status === "CANCELLED" && month(a.startsAt) === m,
      );
      return {
        patient: list.filter((a) => a.cancelledBy === "patient").length,
        doctor: list.filter((a) => a.cancelledBy === "doctor").length,
      };
    }),
  };
}

export type Reports = ReturnType<typeof buildReports>;
