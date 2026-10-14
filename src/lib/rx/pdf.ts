import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";

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
  visit: string;
  lines: string[];
  photo?: Img;
  signature: Img;
};

const W = 595.28;
const H = 841.89;
const M = 50;
const SIZE = 11;
const LEAD = 14;
const SIG_ROOM = 180; // space the signature block needs at the bottom of the last page
const grey = rgb(0.4, 0.4, 0.4);

export async function renderPrescription(i: RxInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // ponytail: Helvetica is WinAnsi only, so Hindi/emoji become "?"; embed a Noto font via @pdf-lib/fontkit if doctors type in Hindi
  const charset = new Set(font.getCharacterSet());
  const safe = (s: string) =>
    Array.from(s, (ch) =>
      charset.has(ch.codePointAt(0) ?? 0) ? ch : "?",
    ).join("");
  const embed = (img: Img) =>
    img.mime === "image/png"
      ? pdf.embedPng(img.bytes)
      : pdf.embedJpg(img.bytes);

  const pages: PDFPage[] = [];
  const newPage = () => {
    const p = pdf.addPage([W, H]);
    pages.push(p);
    return p;
  };
  let page = newPage();
  const text = (
    s: string,
    x: number,
    y: number,
    f: PDFFont = font,
    size = SIZE,
    color = rgb(0, 0, 0),
  ) => page.drawText(safe(s), { x, y, size, font: f, color });
  const right = (s: string, y: number, f: PDFFont = font, size = SIZE) =>
    text(s, W - M - f.widthOfTextAtSize(safe(s), size), y, f, size);

  // Header
  let y = H - M - 10;
  text(i.clinic, M, y, bold, 18);
  y -= 18;
  text("Prescription", M, y, font, 12, grey);
  y -= 30;
  text(`Dr. ${i.doctorName.replace(/^Dr\.?\s*/i, "")}`, M, y, bold);
  right(`Rx No: ${i.rxNo}`, y, bold);
  y -= LEAD;
  text(`Reg. No: ${i.regNo}`, M, y);
  y -= 26;
  for (const l of [
    `Patient: ${i.patientName}`,
    `Phone: +${i.patientPhone}`,
    `Visit: ${i.visit}`,
  ]) {
    text(l, M, y);
    y -= LEAD;
  }
  y -= 6;
  page.drawLine({
    start: { x: M, y },
    end: { x: W - M, y },
    thickness: 1,
    color: grey,
  });
  y -= 24;
  text("Rx", M, y, bold, 16);
  y -= 22;

  // Body: wrapped lines, flowing onto new pages
  const maxW = W - 2 * M;
  const wrap = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    for (const word of safe(line).split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, SIZE) <= maxW || !cur) cur = next;
      else {
        out.push(cur);
        cur = word;
      }
    }
    out.push(cur);
    return out;
  };
  for (const row of i.lines.flatMap(wrap)) {
    if (y < M + 10) {
      page = newPage();
      y = H - M;
    }
    text(row, M, y);
    y -= LEAD;
  }
  if (i.photo) {
    const img = await embed(i.photo);
    let { width, height } = img.scale(Math.min(1, maxW / img.width));
    if (y - height < SIG_ROOM) {
      page = newPage();
      y = H - M;
      const fit = Math.min(1, (y - SIG_ROOM) / height);
      width *= fit;
      height *= fit;
    }
    page.drawImage(img, { x: M, y: y - height, width, height });
    y -= height + 10;
  }

  // Signature block on the last page
  if (y < SIG_ROOM) {
    page = newPage();
    y = H - M;
  }
  const sig = await embed(i.signature);
  const s = sig.scale(Math.min(1, 50 / sig.height, 160 / sig.width));
  page.drawImage(sig, {
    x: W - M - s.width,
    y: 120,
    width: s.width,
    height: s.height,
  });
  right(`Dr. ${i.doctorName.replace(/^Dr\.?\s*/i, "")}`, 104, bold);
  right(`Reg. No: ${i.regNo}`, 90);

  const footer = safe(
    `System-generated prescription — Rx No: ${i.rxNo}, issued by ${i.clinic}`,
  );
  for (const p of pages)
    p.drawText(footer, {
      x: (W - font.widthOfTextAtSize(footer, 8)) / 2,
      y: 30,
      size: 8,
      font,
      color: grey,
    });

  return pdf.save();
}
