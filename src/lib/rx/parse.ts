/** Reads a typed prescription: one medicine per line in common Indian shorthand. */

export type Dose = [number, number, number]; // morning, afternoon, night
export type Med = {
  name: string;
  dose: Dose | null;
  food: "before" | "after" | null;
  duration: string | null;
};
export type Rx = { meds: Med[]; advice: string[] };

const ADVICE = /^\s*(?:advice|adv)\s*[:\-–]\s*(.*)$/i;
const DOSE =
  /(?<![\w.])(\d+(?:\.\d+)?|½)\s*-\s*(\d+(?:\.\d+)?|½)\s*-\s*(\d+(?:\.\d+)?|½)(?![\w.])/;
const ABBR: Record<string, Dose> = {
  od: [1, 0, 0],
  bd: [1, 0, 1],
  bid: [1, 0, 1],
  tds: [1, 1, 1],
  tid: [1, 1, 1],
  hs: [0, 0, 1],
};
const ABBR_RE = /\b(od|bd|bid|tds|tid|hs)\b/i;
const AFTER = /\b(?:after\s+(?:food|meals?|breakfast|lunch|dinner)|af|a\/f)\b/i;
const BEFORE =
  /\b(?:before\s+(?:food|meals?|breakfast|lunch|dinner)|empty\s+stomach|bf|b\/f)\b/i;
const DURATION = /\b(\d+)\s*(d|days?|w|wks?|weeks?|months?|mo)\b/i;

const num = (s: string) => (s === "½" ? 0.5 : Number(s));
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

function durationText(n: number, unit: string): string {
  const u = unit.toLowerCase();
  if (u.startsWith("w")) return plural(n, "week");
  if (u.startsWith("mo")) return plural(n, "month");
  return plural(n, "day");
}

function parseLine(line: string): Med {
  let rest = line;
  let dose: Dose | null = null;
  const d = DOSE.exec(rest);
  if (d) {
    dose = [num(d[1]), num(d[2]), num(d[3])];
    rest = rest.replace(d[0], " ");
  } else {
    const a = ABBR_RE.exec(rest);
    if (a) {
      dose = ABBR[a[1].toLowerCase()];
      rest = rest.replace(a[0], " ");
    }
  }
  let food: Med["food"] = null;
  const after = AFTER.exec(rest);
  const before = BEFORE.exec(rest);
  if (after) {
    food = "after";
    rest = rest.replace(after[0], " ");
  } else if (before) {
    food = "before";
    rest = rest.replace(before[0], " ");
  }
  let duration: string | null = null;
  const t = DURATION.exec(rest);
  if (t) {
    duration = durationText(Number(t[1]), t[2]);
    rest = rest.replace(t[0], " ");
  }
  const name = rest
    .replace(/\s+[|,–-]+(?=\s|$)/g, " ") // separators left between removed parts
    .replace(/^[\s|,–-]+|[\s|,–-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { name: name || line.trim(), dose, food, duration };
}

export function parseRx(text: string): Rx {
  const meds: Med[] = [];
  const advice: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const a = ADVICE.exec(line);
    if (a) {
      if (a[1].trim()) advice.push(a[1].trim());
      continue;
    }
    meds.push(parseLine(line));
  }
  return { meds, advice };
}
