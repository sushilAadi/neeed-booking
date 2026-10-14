import { expect, test } from "vitest";
import { DOC, NOW, PNG_1PX } from "../bot/test-kit";
import { createMemoryStore } from "../db/memory-store";
import { atIst } from "../time";
import type { Send } from "../wa/types";
import { signRxToken } from "./link";
import { loadRxPage, submitRx, submitRxFor } from "./web";

const SECRET = "s";
const setup = async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await s.putFile(
    "signatures",
    DOC.signaturePath as string,
    PNG_1PX,
    "image/png",
  );
  const a = (await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: "919111",
    patientName: "Raj",
    startsAt: atIst("2026-07-30", "14:30"),
    endsAt: atIst("2026-07-30", "15:00"),
    notes: null,
  })) as { id: string };
  return { s, a, token: signRxToken(a.id, NOW, SECRET) };
};
const body = {
  meds: [
    {
      name: "Augmentin 625",
      dose: [1, 0, 1],
      food: "after",
      duration: "3 days",
    },
  ],
  advice: "Drink water",
};

test("loadRxPage shows the visit and past medicine names", async () => {
  const { s, token } = await setup();
  const old = (await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: "919222",
    patientName: "Old",
    startsAt: atIst("2026-07-20", "10:00"),
    endsAt: atIst("2026-07-20", "10:30"),
    notes: null,
  })) as { id: string };
  await s.updateAppointment(old.id, {
    status: "COMPLETED",
    prescriptionText: "Pan D 40mg 1-0-1 BF 5 days\nAdvice: x",
  });
  expect(await loadRxPage(s, token, NOW, SECRET)).toEqual({
    state: "ok",
    patient: "Raj",
    visit: "Thu, Jul 30, 2:30 PM–3:00 PM",
    clinic: DOC.clinicName,
    doctor: DOC.name,
    suggestions: ["Pan D 40mg"],
  });
});

test("submitRx completes the visit, sends the PDF and tells the doctor", async () => {
  const { s, a, token } = await setup();
  await s.touchInbound("DOCPN", "919111", NOW);
  await s.touchInbound("PLATFORM", DOC.personalPhone, NOW);
  const sent: Send[] = [];
  const r = await submitRx(s, token, body, NOW, SECRET, async (x) => {
    sent.push(x);
  });
  expect(r).toMatchObject({ status: 200 });
  expect(s.appointments[0]).toMatchObject({
    status: "COMPLETED",
    prescriptionText: "Augmentin 625 1-0-1 AF 3 days\nAdvice: Drink water",
  });
  expect(sent.map((x) => [x.to, x.msg.kind])).toEqual([
    ["919111", "document"],
    [DOC.personalPhone, "text"],
  ]);
  expect(sent[1].msg).toMatchObject({
    body: "Prescription for Raj saved and sent to the patient.",
  });
  expect(await loadRxPage(s, token, NOW, SECRET)).toEqual({ state: "done" });
  expect(
    (await submitRx(s, token, body, NOW, SECRET, async () => {})).status,
  ).toBe(409);
  expect(a.id).toBeTruthy();
});

test("submitRx rejects expired links and bad bodies", async () => {
  const { s, token } = await setup();
  const later = new Date(+NOW + 7 * 3600_000);
  expect(
    (await submitRx(s, token, body, later, SECRET, async () => {})).status,
  ).toBe(410);
  expect(await loadRxPage(s, token, later, SECRET)).toEqual({
    state: "expired",
  });
  expect(
    (await submitRx(s, token, { meds: [] }, NOW, SECRET, async () => {}))
      .status,
  ).toBe(400);
  expect(s.appointments[0].status).toBe("CONFIRMED");
});

// ---- the dashboard's Mark complete (logged-in staff, no token) ----
const RIYA = { label: "Riya (Reception)", staffId: "s-riya" };

test("submitRxFor (dashboard): completes with fee and actor; no WhatsApp note to the doctor", async () => {
  const { s } = await setup();
  await s.touchInbound("DOCPN", "919111", NOW);
  await s.touchInbound("PLATFORM", DOC.personalPhone, NOW);
  const sent: Send[] = [];
  const a = s.appointments[0];
  const r = await submitRxFor(
    s,
    DOC,
    a,
    { ...body, fee: 250 },
    NOW,
    { actor: RIYA, notifyDoctor: false },
    async (x) => {
      sent.push(x);
    },
  );
  expect(r).toEqual({ status: 200, message: "Sent to the patient." });
  expect(s.appointments[0]).toMatchObject({
    status: "COMPLETED",
    fee: 250,
    completedBy: "Riya (Reception)",
  });
  expect(sent.map((x) => x.to)).toEqual(["919111"]);
});

test("submitRxFor refuses a visit that is already completed", async () => {
  const { s } = await setup();
  const a = s.appointments[0];
  await submitRxFor(
    s,
    DOC,
    a,
    body,
    NOW,
    { actor: RIYA, notifyDoctor: false },
    async () => {},
  );
  expect(
    await submitRxFor(
      s,
      DOC,
      { ...a, status: "COMPLETED" },
      body,
      NOW,
      { actor: RIYA, notifyDoctor: false },
      async () => {},
    ),
  ).toEqual({ status: 409, message: "This visit is already completed." });
});

test("the WhatsApp link page records the doctor (WhatsApp) as who completed it", async () => {
  const { s, token } = await setup();
  await submitRx(s, token, body, NOW, SECRET, async () => {});
  expect(s.appointments[0].completedBy).toBe("Dr. Mehta (WhatsApp)");
});
