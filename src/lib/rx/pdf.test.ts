import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { renderPrescription, rxNo } from "./pdf";

// 1x1 PNG
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  ),
  (ch) => ch.charCodeAt(0),
);
const base = {
  clinic: "Sunrise Family Clinic",
  doctorName: "Dr. Mehta",
  regNo: "MMC-1",
  rxNo: "RX-5B039563",
  patientName: "Raj",
  patientPhone: "919111",
  visit: "Thu, Jul 30, 2:30 PM–3:00 PM",
  lines: ["Paracetamol 500mg"],
  signature: { bytes: PNG, mime: "image/png" },
};

test("rxNo", () =>
  expect(rxNo("5b039563-b504-41de-95a4-3508c01ba783")).toBe("RX-5B039563"));
test("renders a one-page PDF with an en dash in the visit line", async () => {
  const bytes = await renderPrescription(base);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
});
test("80 lines spill onto a second page", async () => {
  const bytes = await renderPrescription({
    ...base,
    lines: Array.from({ length: 80 }, (_, i) => `Med ${i}`),
  });
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
});
test("embeds a photo and survives non-Latin text", async () => {
  const bytes = await renderPrescription({
    ...base,
    lines: ["टैबलेट 1 😀 twice daily"],
    photo: { bytes: PNG, mime: "image/png" },
  });
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(
    1,
  );
});
