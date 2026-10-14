import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  type PDFFont,
  type PDFImage,
  type PDFPage,
  rgb,
} from "pdf-lib";
import { fmtPhone } from "../time";
import { type Dose, type Med, parseRx } from "./parse";

export const rxNo = (appointmentId: string) =>
  `RX-${appointmentId.slice(0, 8).toUpperCase()}`;

type Img = { bytes: Uint8Array; mime: string };
export type RxInput = {
  clinic: string;
  doctorName: string;
  regNo: string;
  rxNo: string;
  patientName: string;
  patientPhone: string;
  /** e.g. "Wed, 14 Oct 2026" */
  date: string;
  /** e.g. "2:30 PM–3:00 PM" */
  time: string;
  /** Typed prescription (one medicine per line, "Advice: …" lines). */
  text?: string;
  /** Photo of a handwritten prescription. */
  photo?: Img;
  signature: Img;
};

// Palette: warm paper, deep clinical green, sand for food timing.
const C = {
  paper: rgb(0.969, 0.961, 0.941),
  card: rgb(1, 1, 1),
  ink: rgb(0.12, 0.14, 0.13),
  muted: rgb(0.42, 0.44, 0.41),
  line: rgb(0.89, 0.88, 0.85),
  green: rgb(0.118, 0.42, 0.27),
  greenTint: rgb(0.898, 0.949, 0.918),
  sand: rgb(0.965, 0.914, 0.843),
  sandInk: rgb(0.54, 0.35, 0.12),
  off: rgb(0.93, 0.92, 0.9),
  offInk: rgb(0.72, 0.71, 0.68),
};

const W = 595.28;
const H = 841.89;
const M = 44; // page margin
const CARD_PAD = 22;
const COLS = [W - M - 190, W - M - 120, W - M - 50]; // morning, afternoon, night centres
const FOOT = 120; // reserved for footer + signature on the last page

const fontDir = () => path.join(process.cwd(), "src/lib/rx/fonts");
const loadFont = (w: number) =>
  readFileSync(path.join(fontDir(), `inter-${w}.woff`));

const roundedRect = (w: number, h: number, r: number) =>
  `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;

type Row =
  | { kind: "med"; med: Med; lines: string[]; h: number }
  | { kind: "photo"; img: PDFImage; w: number; h: number };

export async function renderPrescription(i: RxInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(loadFont(400), { subset: true });
  const semi = await pdf.embedFont(loadFont(600), { subset: true });
  const bold = await pdf.embedFont(loadFont(700), { subset: true });
  // ponytail: Inter Latin only, so Hindi/emoji print as "?"; add Noto Sans Devanagari if doctors type in Hindi
  const charset = new Set(regular.getCharacterSet());
  const safe = (s: string) =>
    Array.from(s, (ch) =>
      charset.has(ch.codePointAt(0) ?? 0) ? ch : "?",
    ).join("");
  const width = (s: string, f: PDFFont, size: number) =>
    f.widthOfTextAtSize(safe(s), size);
  const embed = (img: Img) =>
    img.mime === "image/png"
      ? pdf.embedPng(img.bytes)
      : pdf.embedJpg(img.bytes);

  const fit = (s: string, f: PDFFont, size: number, max: number) => {
    let t = safe(s);
    if (f.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && f.widthOfTextAtSize(`${t}…`, size) > max)
      t = t.slice(0, -1);
    return `${t}…`;
  };
  const wrap = (
    s: string,
    f: PDFFont,
    size: number,
    max: number,
    maxLines = 99,
  ) => {
    const out: string[] = [];
    let cur = "";
    for (const word of safe(s).split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) <= max || !cur) cur = next;
      else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
    if (out.length > maxLines) {
      const kept = out.slice(0, maxLines);
      kept[maxLines - 1] = fit(
        `${kept[maxLines - 1]} ${out.slice(maxLines).join(" ")}`,
        f,
        size,
        max,
      );
      return kept;
    }
    return out;
  };

  const rx = parseRx(i.text ?? "");
  const nameMax = COLS[0] - 40 - (M + CARD_PAD);
  const rows: Row[] = rx.meds.map((med) => {
    const lines = wrap(med.name, semi, 12.5, nameMax, 2);
    const chips = med.food || med.duration;
    return {
      kind: "med",
      med,
      lines,
      h: 26 + lines.length * 16 + (chips ? 24 : 0),
    };
  });
  if (i.photo) {
    const img = await embed(i.photo);
    const s = img.scale(
      Math.min(1, (W - 2 * M - 2 * CARD_PAD) / img.width, 380 / img.height),
    );
    rows.push({ kind: "photo", img, w: s.width, h: s.height + 2 * CARD_PAD });
  }
  const advice = rx.advice.flatMap((a) => wrap(a, regular, 10.5, W - 2 * M));

  // ---- pages ----
  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.paper });
    pages.push(p);
    return p;
  };
  const text = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    f: PDFFont,
    size: number,
    color = C.ink,
  ) => p.drawText(safe(s), { x, y, size, font: f, color });
  const right = (
    p: PDFPage,
    s: string,
    xr: number,
    y: number,
    f: PDFFont,
    size: number,
    color = C.ink,
  ) => text(p, s, xr - width(s, f, size), y, f, size, color);
  const label = (p: PDFPage, s: string, x: number, y: number) =>
    text(p, s.toUpperCase(), x, y, semi, 7.5, C.muted);

  const header = (p: PDFPage): number => {
    let y = H - M - 14;
    text(p, fit(i.clinic, bold, 22, W - 2 * M - 150), M, y, bold, 22);
    right(p, i.rxNo, W - M, y + 4, bold, 11.5);
    right(p, i.date, W - M, y - 12, regular, 9.5, C.muted);
    y -= 20;
    text(
      p,
      `Dr. ${i.doctorName.replace(/^Dr\.?\s*/i, "")}  ·  Reg. No: ${i.regNo}`,
      M,
      y,
      regular,
      10.5,
      C.muted,
    );
    y -= 22;
    p.drawLine({
      start: { x: M, y },
      end: { x: W - M, y },
      thickness: 0.8,
      color: C.line,
    });
    y -= 26;
    const cols = [
      { x: M, l: "Patient", v: i.patientName, w: 150 },
      { x: M + 170, l: "Phone", v: fmtPhone(i.patientPhone), w: 130 },
      { x: M + 320, l: "Visit", v: i.time, w: W - 2 * M - 320 },
    ];
    for (const c of cols) {
      label(p, c.l, c.x, y);
      text(p, fit(c.v, bold, 11, c.w), c.x, y - 15, bold, 11);
    }
    return y - 40;
  };
  const contHeader = (p: PDFPage): number => {
    const y = H - M - 10;
    text(p, fit(i.clinic, bold, 12, 300), M, y, bold, 12);
    right(p, `${i.rxNo} · continued`, W - M, y, regular, 9.5, C.muted);
    return y - 26;
  };

  const sunrise = (p: PDFPage, x: number, y: number) => {
    p.drawSvgPath(
      "M -7 2 A 7 7 0 0 1 7 2 M -10 4.5 H 10 M 0 -9 V -6 M -7 -6 L -5 -4 M 7 -6 L 5 -4 M -4 7.5 H 4",
      {
        x,
        y,
        borderColor: C.muted,
        borderWidth: 1.1,
      },
    );
  };
  const sun = (p: PDFPage, x: number, y: number) => {
    p.drawCircle({ x, y, size: 3.6, borderColor: C.muted, borderWidth: 1.1 });
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      p.drawLine({
        start: { x: x + Math.cos(a) * 5.8, y: y + Math.sin(a) * 5.8 },
        end: { x: x + Math.cos(a) * 8.3, y: y + Math.sin(a) * 8.3 },
        thickness: 1.1,
        color: C.muted,
      });
    }
  };
  const moon = (p: PDFPage, x: number, y: number) => {
    p.drawSvgPath("M 2 -7.5 A 7.5 7.5 0 1 0 7.5 3 A 6 6 0 1 1 2 -7.5 Z", {
      x: x - 1,
      y,
      color: C.muted,
    });
  };

  const cardTop = (p: PDFPage, top: number, h: number) => {
    p.drawSvgPath(roundedRect(W - 2 * M, h, 16), {
      x: M,
      y: top,
      color: C.card,
      borderColor: C.line,
      borderWidth: 0.6,
    });
  };
  const cardHead = (p: PDFPage, top: number, showCols: boolean): number => {
    const x = M + CARD_PAD;
    const y = top - CARD_PAD;
    p.drawSvgPath(roundedRect(34, 34, 9), { x, y, color: C.greenTint });
    text(p, "Rx", x + 8.5, y - 22, bold, 13, C.green);
    const n = rx.meds.length;
    const title = n
      ? `${n} ${n === 1 ? "medicine" : "medicines"} to start`
      : "Prescription";
    text(p, title, x + 46, y - 22, bold, 16);
    if (!showCols) return y - 50;
    const iy = y - 52;
    sunrise(p, COLS[0], iy);
    sun(p, COLS[1], iy);
    moon(p, COLS[2], iy);
    ["Morning", "Afternoon", "Night"].forEach((l, k) => {
      const s = l.toUpperCase();
      text(
        p,
        s,
        COLS[k] - width(s, regular, 7.5) / 2,
        iy - 20,
        regular,
        7.5,
        C.muted,
      );
    });
    const ly = iy - 32;
    p.drawLine({
      start: { x: M, y: ly },
      end: { x: W - M, y: ly },
      thickness: 0.6,
      color: C.line,
    });
    return ly;
  };
  const HEAD_H = (cols: boolean) => CARD_PAD + (cols ? 84 : 50);

  const chip = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    bg: typeof C.sand,
    ink: typeof C.sand,
  ) => {
    const w = width(s, regular, 9) + 16;
    p.drawSvgPath(roundedRect(w, 17, 8.5), { x, y, color: bg });
    text(p, s, x + 8, y - 12, regular, 9, ink);
    return w;
  };
  const doseMark = (p: PDFPage, x: number, y: number, v: number) => {
    if (!v) {
      p.drawCircle({ x, y, size: 10, color: C.off });
      p.drawLine({
        start: { x: x - 3, y },
        end: { x: x + 3, y },
        thickness: 1.2,
        color: C.offInk,
      });
      return;
    }
    p.drawCircle({ x, y, size: 10.5, color: C.green });
    if (v === 1)
      p.drawSvgPath("M -4.2 0 L -1.2 3 L 4.4 -3.2", {
        x,
        y,
        borderColor: C.card,
        borderWidth: 1.8,
      });
    else {
      const s = v === 0.5 ? "½" : String(v);
      text(p, s, x - width(s, bold, 9) / 2, y - 3.2, bold, 9, C.card);
    }
  };
  const drawRow = (p: PDFPage, r: Row, top: number, last: boolean) => {
    const x = M + CARD_PAD;
    if (r.kind === "photo") {
      p.drawImage(r.img, {
        x,
        y: top - CARD_PAD - (r.h - 2 * CARD_PAD),
        width: r.w,
        height: r.h - 2 * CARD_PAD,
      });
      return;
    }
    let y = top - 26;
    for (const l of r.lines) {
      text(p, l, x, y, semi, 12.5);
      y -= 16;
    }
    if (r.med.food || r.med.duration) {
      let cx = x;
      if (r.med.food)
        cx +=
          chip(
            p,
            r.med.food === "after" ? "After food" : "Before food",
            cx,
            y + 6,
            C.sand,
            C.sandInk,
          ) + 6;
      if (r.med.duration)
        chip(p, r.med.duration, cx, y + 6, C.greenTint, C.green);
    }
    if (r.med.dose) {
      const cy = top - r.h / 2;
      (r.med.dose as Dose).forEach((v, k) => {
        doseMark(p, COLS[k], cy, v);
      });
    }
    if (!last) {
      const ly = top - r.h;
      p.drawLine({
        start: { x: M + 1, y: ly },
        end: { x: W - M - 1, y: ly },
        thickness: 0.6,
        color: C.line,
        dashArray: [2.5, 2.5],
      });
    }
  };

  // Lay rows into cards, one card per page, continuing onto new pages as needed.
  const hasDoseCols = rx.meds.some((m) => m.dose);
  let page = newPage();
  let top = header(page);
  let idx = 0;
  const bottomLimit = M;
  if (!rows.length)
    rows.push({
      kind: "med",
      med: {
        name: "No prescription text.",
        dose: null,
        food: null,
        duration: null,
      },
      lines: ["No prescription text."],
      h: 50,
    });
  while (idx < rows.length) {
    const avail = top - bottomLimit - HEAD_H(hasDoseCols);
    const pageRows: Row[] = [];
    let used = 0;
    while (
      idx < rows.length &&
      (used + rows[idx].h <= avail || pageRows.length === 0)
    ) {
      pageRows.push(rows[idx]);
      used += rows[idx].h;
      idx++;
    }
    const cardH = HEAD_H(hasDoseCols) + used + 8;
    cardTop(page, top, cardH);
    let y = cardHead(page, top, hasDoseCols);
    pageRows.forEach((r, k) => {
      drawRow(page, r, y, k === pageRows.length - 1);
      y -= r.h;
    });
    top = top - cardH - 26;
    if (idx < rows.length) {
      page = newPage();
      top = contHeader(page);
    }
  }

  // Advice, then footer + signature (moving to a fresh page if they don't fit).
  const adviceH = advice.length ? 22 + advice.length * 15 : 0;
  if (top - adviceH < FOOT + bottomLimit - 30) {
    page = newPage();
    top = contHeader(page);
  }
  if (advice.length) {
    label(page, "Advice", M, top);
    let y = top - 18;
    for (const l of advice) {
      text(page, l, M, y, regular, 10.5);
      y -= 15;
    }
  }

  const sig = await embed(i.signature);
  const s = sig.scale(Math.min(1, 42 / sig.height, 150 / sig.width));
  const sx = W - M - 170;
  page.drawImage(sig, {
    x: sx + (170 - s.width) / 2,
    y: 92,
    width: s.width,
    height: s.height,
  });
  page.drawLine({
    start: { x: sx, y: 88 },
    end: { x: W - M, y: 88 },
    thickness: 0.8,
    color: C.ink,
  });
  const dn = `Dr. ${i.doctorName.replace(/^Dr\.?\s*/i, "")}`;
  text(page, dn, sx + (170 - width(dn, semi, 10)) / 2, 74, semi, 10);
  const rn = `Reg. No: ${i.regNo}`;
  text(
    page,
    rn,
    sx + (170 - width(rn, regular, 9)) / 2,
    61,
    regular,
    9,
    C.muted,
  );
  const foot = wrap(
    `System-generated prescription — verify Rx No: ${i.rxNo}, issued by ${i.clinic}.`,
    regular,
    7.5,
    260,
  );
  foot.forEach((l, k) => {
    text(page, l, M, 70 - k * 10, regular, 7.5, C.muted);
  });

  return pdf.save();
}
