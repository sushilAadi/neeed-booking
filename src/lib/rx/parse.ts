/** Reads a typed prescription: one medicine per line in common Indian shorthand. */

export type Dose = [number, number, number]; // morning, afternoon, night
export type Med = {
  name: string;
  dose: Dose | null;
  /** Take only when needed (SOS). */
  sos?: true;
  /** "any" = no food instruction (doctor chose "Any time"). */
  food: "before" | "after" | "any" | null;
  duration: string | null;
};
export type Rx = { meds: Med[]; advice: string[] };

const HEADER = /^medicine\s+time\b/i;
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
const SOS = /\b(?:sos|prn|when\s+needed)\b/i;
const ANY_TIME = /\bany\s*time\b/i;
const ONGOING = /\b(?:ongoing|continue|continuous)\b/i;
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
  // Doctors skip spaces on a phone keyboard: "1-0-0BF", "BF8D", "AF5d".
  let rest = line
    .replace(/(\d\s*-\s*\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?)(?=[a-z])/gi, "$1 ")
    .replace(/\b(af|bf|a\/f|b\/f)(?=\d)/gi, "$1 ");
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
  let sos = false;
  const so = SOS.exec(rest);
  if (so) {
    sos = true;
    rest = rest.replace(so[0], " ");
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
  } else {
    const any = ANY_TIME.exec(rest);
    if (any) {
      food = "any";
      rest = rest.replace(any[0], " ");
    }
  }
  let duration: string | null = null;
  const t = DURATION.exec(rest);
  const og = ONGOING.exec(rest);
  if (t) {
    duration = durationText(Number(t[1]), t[2]);
    rest = rest.replace(t[0], " ");
  } else if (og) {
    duration = "Ongoing";
    rest = rest.replace(og[0], " ");
  }
  const name = rest
    .replace(/\s+[|,–-]+(?=\s|$)/g, " ") // separators left between removed parts
    .replace(/^[\s|,–-]+|[\s|,–-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return {
    name: name || line.trim(),
    dose,
    ...(sos ? { sos: true as const } : {}),
    food,
    duration,
  };
}

export function parseRx(text: string): Rx {
  const meds: Med[] = [];
  const advice: string[] = [];
  // A copied example brings WhatsApp's ``` markers, the header row and the ─── line.
  for (const raw of text.replaceAll("`", "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[─━—_\-=\s]+$/.test(line) || HEADER.test(line)) continue;
    const a = ADVICE.exec(line);
    if (a) {
      if (a[1].trim()) advice.push(a[1].trim());
      continue;
    }
    meds.push(parseLine(line));
  }
  return { meds, advice };
}

const fmtN = (n: number) => (n === 0.5 ? "½" : String(n));

/** The shorthand line for a medicine; parseRx reads it back to the same Med. */
export function formatMed(m: Med): string {
  const parts = [m.name];
  if (m.dose) parts.push(m.dose.map(fmtN).join("-"));
  if (m.sos) parts.push("SOS");
  if (m.food === "after") parts.push("AF");
  if (m.food === "before") parts.push("BF");
  if (m.food === "any") parts.push("any time");
  if (m.duration) parts.push(m.duration === "Ongoing" ? "ongoing" : m.duration);
  return parts.join(" ");
}

const SLOT = ["Morning", "Afternoon", "Night"];

/** "Augmentin 625 — Morning, Night · After food · 3 days" */
export function medSummary(m: Med): string {
  const when = m.dose
    ? m.dose
        .map((v, k) => (v ? `${v === 1 ? "" : `${fmtN(v)} `}${SLOT[k]}` : ""))
        .filter(Boolean)
        .join(", ")
    : m.sos
      ? "When needed"
      : "";
  const food =
    m.food === "after"
      ? "After food"
      : m.food === "before"
        ? "Before food"
        : m.food === "any"
          ? "Any time"
          : "";
  const bits = [when, food, m.duration ?? ""].filter(Boolean);
  return bits.length ? `${m.name} — ${bits.join(" · ")}` : m.name;
}
