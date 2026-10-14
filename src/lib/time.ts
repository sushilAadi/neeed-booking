// ponytail: fixed +05:30, India has no DST
const TZ = "Asia/Kolkata";

const part = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...opts }).format(d);

export function istDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // YYYY-MM-DD
}

export function atIst(date: string, hm: string): Date {
  return new Date(`${date}T${hm}:00+05:30`);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function fmtDay(d: Date): string {
  return part(d, { weekday: "short", month: "short", day: "numeric" });
}

export function fmtTime(d: Date): string {
  // some ICU builds put U+202F before AM/PM
  return part(d, { hour: "numeric", minute: "2-digit", hour12: true }).replace(
    /\u202f/g,
    " ",
  );
}

export function fmtRange(start: Date, end: Date): string {
  return `${fmtTime(start)}–${fmtTime(end)}`;
}
