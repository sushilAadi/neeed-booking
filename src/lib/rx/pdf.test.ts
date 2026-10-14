import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { JPG_1PX, PNG_1PX } from "../bot/test-kit";
import { renderPrescription, rxNo } from "./pdf";

const SAMPLE = `Tablet Augmentin 625 1-0-1 after food 3 days
Erinac P 100mg/500mg Tablet 1-0-1 AF 3d
Montair LC 5mg/10mg Tablet 0-0-1 after food 5 days
Pan D Tablet 1-0-1 BF 5 days
Advice: Drink plenty of water. Review after 5 days if symptoms persist.`;

const base = {
  clinic: "Sunrise Family Clinic",
  doctorName: "Dr. Sushil Sharma",
  regNo: "DR0000X00",
  rxNo: "RX-5B039563",
  patientName: "Raj",
  patientPhone: "919111111111",
  date: "Fri, 31 Jul 2026",
  time: "2:30 PM–3:00 PM",
  text: SAMPLE,
  signature: { bytes: PNG_1PX, mime: "image/png" },
};

const pages = async (b: Uint8Array) =>
  (await PDFDocument.load(b)).getPageCount();

test("rxNo", () =>
  expect(rxNo("5b039563-b504-41de-95a4-3508c01ba783")).toBe("RX-5B039563"));

test("the sample prescription fits on one page", async () => {
  const bytes = await renderPrescription(base);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  expect(await pages(bytes)).toBe(1);
  if (process.env.RX_PREVIEW) writeFileSync(process.env.RX_PREVIEW, bytes);
});

test("a long list continues on more pages", async () => {
  const text = Array.from(
    { length: 30 },
    (_, k) => `Medicine number ${k} 1-0-1 after food 5 days`,
  ).join("\n");
  expect(
    await pages(await renderPrescription({ ...base, text })),
  ).toBeGreaterThan(1);
});

test("a photo prescription with a caption, and non-Latin text, render", async () => {
  const bytes = await renderPrescription({
    ...base,
    text: "Advice: टैबलेट after food 😀",
    photo: { bytes: JPG_1PX, mime: "image/jpeg" },
  });
  expect(await pages(bytes)).toBe(1);
});

test("unparsed lines and an empty prescription still render", async () => {
  expect(
    await pages(
      await renderPrescription({
        ...base,
        text: "Steam inhalation twice daily",
      }),
    ),
  ).toBe(1);
  expect(await pages(await renderPrescription({ ...base, text: "" }))).toBe(1);
});

test("structured rx input and SOS render", async () => {
  const bytes = await renderPrescription({
    ...base,
    text: undefined,
    rx: {
      meds: [
        {
          name: "Dolo 650",
          dose: null,
          sos: true,
          food: "any",
          duration: "Ongoing",
        },
      ],
      advice: ["Rest"],
    },
  });
  expect(await pages(bytes)).toBe(1);
});
