import { expect, test } from "vitest";
import { createMemoryStore, type MemoryStore } from "../db/memory-store";
import type { Doctor } from "../db/types";
import { atIst } from "../time";
import type { Incoming } from "../wa/types";
import { handleDoctor } from "./doctor";
import {
  bodies,
  DOC,
  ids,
  image,
  JPG_1PX,
  NOW,
  PNG_1PX,
  reply,
  text,
  titles,
} from "./test-kit";

const D = DOC.personalPhone;
const PL = "PLATFORM";
const at = (hm: string) => atIst("2026-07-30", hm);
const jpeg = async () => ({
  bytes: JPG_1PX,
  mime: "image/jpeg",
});
// Like production: the doctor row is read fresh for every message unless a test pins one.
const run = async (s: MemoryStore, msg: Incoming, doctor?: Doctor, now = NOW) =>
  handleDoctor({
    store: s,
    doctor: doctor ?? (await s.doctorByPersonalPhone(D)) ?? DOC,
    msg,
    now,
    media: jpeg,
  });
const t = (body: string) => text(D, body, undefined, PL);
const r = (id: string) => reply(D, id, undefined, PL);
const book = (
  s: MemoryStore,
  phone: string,
  hm: string,
  end: string,
  name = "Raj",
) =>
  s.createAppointment({
    doctorId: DOC.id,
    patientPhone: phone,
    patientName: name,
    startsAt: at(hm),
    endsAt: at(end),
    notes: null,
  }) as Promise<{ id: string }>;

test("setup is forced: hi → setup prompt; reg no; text instead of photo repeats; photo saves; then the menu", async () => {
  const fresh = { ...DOC, registrationNumber: null, signaturePath: null };
  const s = createMemoryStore({ doctors: [fresh] });
  const first = await run(s, t("hi"), fresh);
  expect(first[0]).toMatchObject({ from: PL, to: D });
  expect(bodies(first)).toEqual([
    "Your prescription setup isn't done yet — let's finish that first.",
    'One-time setup: what\'s your medical registration number? (printed on every prescription slip — reply "setup" any time to change it later)',
  ]);
  const sig =
    "Now send a photo of your signature — sign on plain paper and photograph it.";
  expect(bodies(await run(s, t("MMC-555"), fresh))).toEqual([sig]);
  expect(bodies(await run(s, t("here"), fresh))).toEqual([sig]);
  const done = await run(
    s,
    image(D, "MEDIA1", undefined, undefined, PL),
    fresh,
  );
  expect(bodies(done)[0]).toBe(
    'Setup saved. Reply "setup" any time to update your registration number or signature.',
  );
  expect(done[1].msg.kind).toBe("list");
  expect(s.files.has(`signatures/${DOC.id}.jpg`)).toBe(true);
  expect(await s.doctorByPersonalPhone(D)).toMatchObject({
    registrationNumber: "MMC-555",
    signaturePath: `${DOC.id}.jpg`,
  });
});

test("menu shows 'Close today' when open and 'Open today' when closed", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const [m] = await run(s, t("hi"));
  expect(bodies([m])).toEqual(["Hi Dr. Mehta. What would you like to do?"]);
  expect(ids(m)).toEqual([
    "today",
    "close",
    "block",
    "dcancel",
    "hours",
    "setup",
  ]);
  await s.setClosed(DOC.id, "2026-07-30", true);
  expect(ids((await run(s, t("menu")))[0])).toEqual([
    "today",
    "open",
    "block",
    "dcancel",
    "hours",
    "setup",
  ]);
});

test("Today lists appointments and offers Mark complete for CONFIRMED only", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const a = await book(s, "919111", "14:30", "15:00", "Raj");
  const b = await book(s, "919222", "15:00", "15:30", "Sita");
  await s.updateAppointment(b.id, { status: "CANCELLED" });
  const out = await run(s, r("today"));
  expect(bodies(out)[0]).toBe(
    "Today's appointments:\n1. 2:30 PM–3:00 PM — Raj (+919111) [CONFIRMED]\n2. 3:00 PM–3:30 PM — Sita (+919222) [CANCELLED]",
  );
  expect(out[1].msg).toMatchObject({
    kind: "list",
    button: "Mark complete",
    body: "Tap a patient once their visit is done to mark it complete and add a prescription.",
  });
  expect(ids(out[1])).toEqual([`done:${a.id}`]);
  expect(titles(out[1])).toEqual(["Raj"]);
});

test("Today with none", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  expect(bodies(await run(s, t("today")))).toEqual(["No appointments today."]);
});

test("close with no bookings closes immediately", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  expect(bodies(await run(s, r("close")))).toEqual([
    "Closed for today. Patients will be told you're not taking bookings.",
  ]);
  expect(await s.isClosed(DOC.id, "2026-07-30")).toBe(true);
  expect(bodies(await run(s, t("open")))).toEqual(["Open for bookings today."]);
  expect(await s.isClosed(DOC.id, "2026-07-30")).toBe(false);
});

test("close with 2 bookings → warning; cn cancels both and notifies the patients whose window is open", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await book(s, "919111", "14:30", "15:00", "Raj");
  await book(s, "919222", "16:00", "16:30", "Sita");
  await s.touchInbound("DOCPN", "919111", new Date(+NOW - 3600_000));
  await s.touchInbound("DOCPN", "919222", new Date(+NOW - 25 * 3600_000));
  const warn = await run(s, r("close"));
  expect(bodies(warn)).toEqual([
    "You have 2 confirmed appointment(s) today. What should happen to them?",
  ]);
  expect(ids(warn[0])).toEqual(["cn", "keep"]);
  expect(titles(warn[0])).toEqual(["Cancel & notify", "Keep bookings"]);
  const out = await run(s, r("cn"));
  const notices = out.filter((x) => x.to !== D);
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ from: "DOCPN", to: "919111" });
  expect(bodies(notices)[0]).toBe(
    "Sorry, Dr. Mehta has cancelled your appointment today (2:30 PM–3:00 PM). Reason: doctor unavailable. Reply /book to pick another time if available.",
  );
  expect(
    s.appointments.every(
      (a) => a.status === "CANCELLED" && a.cancelledBy === "doctor",
    ),
  ).toBe(true);
  expect(await s.isClosed(DOC.id, "2026-07-30")).toBe(true);
});

test("close with bookings → keep: closed, appointments stay CONFIRMED", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await book(s, "919111", "14:30", "15:00");
  await run(s, r("close"));
  await run(s, r("keep"));
  expect(await s.isClosed(DOC.id, "2026-07-30")).toBe(true);
  expect(s.appointments[0].status).toBe("CONFIRMED");
});

test("doctor cancel: dc:{id} → reason → cancelled + notice; dc: id of another doctor's appointment is ignored", async () => {
  const other = {
    ...DOC,
    id: "doc-2",
    businessPhoneNumberId: "OTHERPN",
    personalPhone: "919000000002",
  };
  const s = createMemoryStore({ doctors: [DOC, other] });
  const a = await book(s, "919111", "14:30", "15:00");
  const foreign = (await s.createAppointment({
    doctorId: "doc-2",
    patientPhone: "919555",
    patientName: "Q",
    startsAt: at("14:30"),
    endsAt: at("15:00"),
    notes: null,
  })) as { id: string };
  await s.touchInbound("DOCPN", "919111", NOW);
  const list = await run(s, t("cancel"));
  expect(ids(list[0])).toEqual([`dc:${a.id}`]);
  const ignored = await run(s, r(`dc:${foreign.id}`));
  expect(ids(ignored[0])).toEqual([`dc:${a.id}`]);
  expect(bodies(await run(s, r(`dc:${a.id}`)))).toEqual([
    "Any reason to give the patient? (optional — type it, or tap Skip)",
  ]);
  const out = await run(s, t("Emergency surgery"));
  expect(bodies(out)).toContain("Cancelled and the patient was notified.");
  expect(bodies(out)).toContain(
    "Sorry, Dr. Mehta has cancelled your appointment today (2:30 PM–3:00 PM). Reason: Emergency surgery. Reply /book to pick another time if available.",
  );
  expect(s.appointments.find((x) => x.id === foreign.id)?.status).toBe(
    "CONFIRMED",
  );
});

test("doctor cancel when the patient's window is closed", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const a = await book(s, "919111", "14:30", "15:00");
  await run(s, r("dcancel"));
  await run(s, r(`dc:${a.id}`));
  expect(bodies(await run(s, r("skip")))).toEqual([
    "Cancelled. The patient couldn't be messaged (24-hour window closed).",
  ]);
});

// ---- Task 8: Block my time ----
test("block custom 1pm-4:30pm on a future date → 'Blocked Fri, Jul 31 — 1:00 PM–4:30 PM.'", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const [dates] = await run(s, r("block"));
  expect(dates.msg).toMatchObject({ kind: "list", button: "Choose a date" });
  expect(ids(dates)).toHaveLength(7);
  expect(ids(dates)[0]).toBe("d:2026-07-30");
  expect(titles(dates)[1]).toBe("Fri, Jul 31");
  const [ranges] = await run(s, r("d:2026-07-31"));
  expect(ids(ranges)).toEqual([
    "r:whole",
    "r:morning",
    "r:afternoon",
    "r:custom",
  ]);
  expect(titles(ranges)).toEqual([
    "Whole day",
    "Morning",
    "Afternoon",
    "Particular time",
  ]);
  expect(bodies(await run(s, r("r:custom")))).toEqual([
    'What time range? Type it like "2pm-5pm" or "14:00-17:00".',
  ]);
  expect(bodies(await run(s, t("1pm-4:30pm")))).toEqual([
    "Blocked Fri, Jul 31 — 1:00 PM–4:30 PM.",
  ]);
  const blocks = await s.blocksBetween(
    DOC.id,
    atIst("2026-07-31", "00:00"),
    atIst("2026-08-01", "00:00"),
  );
  expect(blocks).toHaveLength(1);
  expect(blocks[0].startsAt).toEqual(atIst("2026-07-31", "13:00"));
});

test("invalid custom range re-prompts with the 'Couldn't read that' copy", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, r("block"));
  await run(s, r("d:2026-07-31"));
  await run(s, r("r:custom"));
  expect(bodies(await run(s, t("after lunch")))).toEqual([
    'Couldn\'t read that. Type it like "2pm-5pm" or "14:00-17:00".',
  ]);
});

test("whole day → closure for that date", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, r("block"));
  await run(s, r("d:2026-08-01"));
  expect(bodies(await run(s, r("r:whole")))).toEqual([
    "Blocked Sat, Aug 1 — whole day.",
  ]);
  expect(await s.isClosed(DOC.id, "2026-08-01")).toBe(true);
});

test("morning preset blocks the morning period", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, r("block"));
  await run(s, r("d:2026-07-31"));
  expect(bodies(await run(s, r("r:morning")))).toEqual([
    "Blocked Fri, Jul 31 — 10:00 AM–2:00 PM.",
  ]);
});

test("stale date tap outside the next 7 days re-shows the dates", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, r("block"));
  const out = await run(s, r("d:2026-08-20"));
  expect(ids(out[0])[0]).toBe("d:2026-07-30");
});

test("block clashing with today's booking → warning; cn cancels + notifies; keep leaves it", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await book(s, "919111", "14:30", "15:00");
  await s.touchInbound("DOCPN", "919111", NOW);
  await run(s, r("block"));
  await run(s, r("d:2026-07-30"));
  const warn = await run(s, r("r:afternoon"));
  expect(bodies(warn)).toEqual([
    "You have 1 confirmed appointment(s) today. What should happen to them?",
  ]);
  const out = await run(s, r("cn"));
  expect(bodies(out)[0]).toBe("Blocked Thu, Jul 30 — 2:00 PM–6:00 PM.");
  expect(out.filter((x) => x.to === "919111")).toHaveLength(1);
  expect(s.appointments[0]).toMatchObject({
    status: "CANCELLED",
    cancelledBy: "doctor",
  });

  const s2 = createMemoryStore({ doctors: [DOC] });
  await book(s2, "919111", "14:30", "15:00");
  await run(s2, r("block"));
  await run(s2, r("d:2026-07-30"));
  await run(s2, r("r:afternoon"));
  expect(bodies(await run(s2, r("keep")))).toEqual([
    "Blocked Thu, Jul 30 — 2:00 PM–6:00 PM.",
  ]);
  expect(s2.appointments[0].status).toBe("CONFIRMED");
  expect(
    await s2.blocksBetween(DOC.id, at("00:00"), atIst("2026-07-31", "00:00")),
  ).toHaveLength(1);
});

// ---- Task 9: mark complete ----
const complete = async (s: MemoryStore, patientWindowOpen: boolean) => {
  const a = await book(s, "919111", "14:30", "15:00");
  if (patientWindowOpen) await s.touchInbound("DOCPN", "919111", NOW);
  const prompt = await run(s, r(`done:${a.id}`));
  expect(bodies(prompt)).toEqual([
    "Marking that visit complete. Type the prescription/notes, send a photo of it (caption optional), or tap Skip to finish with no prescription attached.",
  ]);
  return a;
};
const sigStore = async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await s.putFile(
    "signatures",
    DOC.signaturePath as string,
    PNG_1PX,
    "image/png",
  );
  return s;
};

test("mark complete with text → COMPLETED, PDF stored, document sent, 'Saved and sent to the patient.'", async () => {
  const s = await sigStore();
  const a = await complete(s, true);
  const out = await run(s, t("Paracetamol 500mg\nRest 2 days"));
  const doc = out.find((x) => x.msg.kind === "document");
  expect(doc).toMatchObject({ from: "DOCPN", to: "919111" });
  expect(doc?.msg).toMatchObject({
    link: `mem://prescriptions/${a.id}.pdf`,
    filename: `Prescription-RX-${a.id.slice(0, 8).toUpperCase()}.pdf`,
    caption:
      "Prescription from your visit on Thu, Jul 30, 2:30 PM–3:00 PM with Dr. Mehta.",
  });
  expect(bodies(out.filter((x) => x.to === D))).toEqual([
    "Saved and sent to the patient.",
  ]);
  expect(s.appointments[0]).toMatchObject({
    status: "COMPLETED",
    prescriptionText: "Paracetamol 500mg\nRest 2 days",
    prescriptionPdfPath: `${a.id}.pdf`,
  });
  expect(
    new TextDecoder().decode(
      s.files.get(`prescriptions/${a.id}.pdf`)?.slice(0, 5),
    ),
  ).toBe("%PDF-");
});

test("mark complete with a photo stores the image and the PDF", async () => {
  const s = await sigStore();
  const a = await complete(s, true);
  await run(s, image(D, "RXPHOTO", "after food", undefined, PL));
  expect(s.appointments[0]).toMatchObject({
    status: "COMPLETED",
    prescriptionText: "after food",
    prescriptionImagePath: `${a.id}.jpg`,
  });
  expect(s.files.has(`prescriptions/${a.id}.jpg`)).toBe(true);
});

test("mark complete when the patient's window is closed → stored, no document, the window-closed copy", async () => {
  const s = await sigStore();
  await complete(s, false);
  const out = await run(s, t("Paracetamol"));
  expect(out.some((x) => x.msg.kind === "document")).toBe(false);
  expect(bodies(out)).toEqual([
    "Saved. The patient's 24-hour window has closed, so they'll get it from \"My Prescriptions\" next time they message.",
  ]);
  expect(s.appointments[0].status).toBe("COMPLETED");
});

test("mark complete with skip → COMPLETED, no PDF, 'Marked complete.'", async () => {
  const s = await sigStore();
  await complete(s, true);
  expect(bodies(await run(s, r("skip")))).toEqual(["Marked complete."]);
  expect(s.appointments[0]).toMatchObject({
    status: "COMPLETED",
    prescriptionPdfPath: null,
  });
});

test("done: id of a cancelled or foreign appointment is ignored", async () => {
  const s = await sigStore();
  const a = await book(s, "919111", "14:30", "15:00");
  await s.updateAppointment(a.id, { status: "CANCELLED" });
  const out = await run(s, r(`done:${a.id}`));
  expect(out[0].msg.kind).not.toBe("buttons");
  expect(s.appointments[0].status).toBe("CANCELLED");
});

// ---- review fixes ----
test("a failed photo download keeps the visit open so the doctor can resend", async () => {
  const s = await sigStore();
  const a = await book(s, "919111", "14:30", "15:00");
  await run(s, r(`done:${a.id}`));
  const broken = async () => {
    throw new Error("media 500");
  };
  await expect(
    handleDoctor({
      store: s,
      doctor: DOC,
      msg: image(D, "X", undefined, undefined, PL),
      now: NOW,
      media: broken,
    }),
  ).rejects.toThrow();
  expect(s.appointments[0].status).toBe("CONFIRMED");
  expect((await s.getConversation(PL, D)).state).toBe("rx_input");
});
test("a 'Cancel & notify' tap left over from yesterday re-prompts instead of cancelling today's patients", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await book(s, "919111", "14:30", "15:00");
  await run(s, r("close"));
  const tomorrow = new Date(+NOW + 24 * 3600_000);
  await s.createAppointment({
    doctorId: DOC.id,
    patientPhone: "919222",
    patientName: "Sita",
    startsAt: atIst("2026-07-31", "14:30"),
    endsAt: atIst("2026-07-31", "15:00"),
    notes: null,
  });
  const out = await run(s, r("cn"), DOC, tomorrow);
  expect(bodies(out)).toEqual([
    "You have 1 confirmed appointment(s) today. What should happen to them?",
  ]);
  expect(s.appointments.find((x) => x.patientPhone === "919222")?.status).toBe(
    "CONFIRMED",
  );
  expect(await s.isClosed(DOC.id, "2026-07-31")).toBe(false);
});

// ---- clinic hours ----
const MORNING_Q = (now: string) =>
  `Morning hours? Now: ${now}.\nType new hours like "9am-1pm", or tap a button.`;
const SUMMARY = (m: string, a: string, e: string, l: string, slot: string) =>
  `Clinic hours\nMorning: ${m}\nAfternoon: ${a}\nEvening: ${e}\nLunch break: ${l}\nTime per patient: ${slot}`;

test("first-time setup continues into clinic hours after the signature", async () => {
  const fresh = {
    ...DOC,
    registrationNumber: null,
    signaturePath: null,
    hoursSet: false,
  };
  const s = createMemoryStore({ doctors: [fresh] });
  await run(s, t("hi"));
  await run(s, t("MMC-555"));
  const afterSig = await run(s, image(D, "SIG", undefined, undefined, PL));
  expect(bodies(afterSig)).toEqual([
    "Signature saved. Now your clinic hours.",
    MORNING_Q("10:00 AM–2:00 PM"),
  ]);
  expect(ids(afterSig[1])).toEqual(["keep", "off"]);
  expect(bodies(await run(s, t("9am-1pm")))[0]).toContain(
    "Afternoon hours? Now: 2:00 PM–6:00 PM.",
  );
  await run(s, t("3pm-6pm"));
  expect(bodies(await run(s, r("off")))[0]).toContain(
    "Lunch break? Now: None.",
  );
  const slotQ = await run(s, t("12:30pm-1pm"));
  expect(slotQ[0].msg).toMatchObject({ kind: "list", button: "Choose length" });
  expect(ids(slotQ[0])).toEqual(["s:15", "s:30", "s:45", "s:60"]);
  const done = await run(s, r("s:15"));
  expect(bodies(done)[0]).toBe(
    'Setup saved. Reply "setup" any time to update your registration number or signature, or "hours" to change your clinic hours.',
  );
  expect(bodies(done)[1]).toBe(
    SUMMARY(
      "9:00 AM–1:00 PM",
      "3:00 PM–6:00 PM",
      "Off",
      "12:30 PM–1:00 PM",
      "15 min",
    ),
  );
  expect(done[2].msg.kind).toBe("list");
  expect(await s.doctorByPersonalPhone(D)).toMatchObject({
    morningStart: "09:00",
    morningEnd: "13:00",
    afternoonStart: "15:00",
    afternoonEnd: "18:00",
    eveningStart: null,
    eveningEnd: null,
    lunchStart: "12:30",
    lunchEnd: "13:00",
    slotMinutes: 15,
    hoursSet: true,
  });
});

test("an existing doctor without hours is asked for them once", async () => {
  const s = createMemoryStore({ doctors: [{ ...DOC, hoursSet: false }] });
  const out = await run(s, t("hi"));
  expect(bodies(out)).toEqual([
    "One more setup step: your clinic hours.",
    MORNING_Q("10:00 AM–2:00 PM"),
  ]);
  await run(s, r("keep"));
  await run(s, r("keep"));
  await run(s, r("keep"));
  await run(s, r("keep"));
  await run(s, r("s:30"));
  expect((await s.doctorByPersonalPhone(D))?.hoursSet).toBe(true);
  expect(ids((await run(s, t("hi")))[0])).toContain("today");
});

test("hours from the menu: change lunch break; bookings are kept", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await book(s, "919111", "13:00", "13:30");
  const [summary, list] = await run(s, r("hours"));
  expect(bodies([summary])[0]).toBe(
    SUMMARY(
      "10:00 AM–2:00 PM",
      "2:00 PM–6:00 PM",
      "6:00 PM–10:00 PM",
      "None",
      "30 min",
    ),
  );
  expect(ids(list)).toEqual([
    "h:morning",
    "h:afternoon",
    "h:evening",
    "h:lunch",
    "h:slot",
  ]);
  expect(bodies(await run(s, r("h:lunch")))[0]).toContain(
    "Lunch break? Now: None.",
  );
  const saved = await run(s, t("1pm-2pm"));
  expect(bodies(saved)[0]).toBe(
    `Saved. Existing bookings are kept.\n\n${SUMMARY("10:00 AM–2:00 PM", "2:00 PM–6:00 PM", "6:00 PM–10:00 PM", "1:00 PM–2:00 PM", "30 min")}`,
  );
  expect(s.appointments[0].status).toBe("CONFIRMED");
});

test("overlapping hours are rejected and the question repeats", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, r("hours"));
  await run(s, r("h:morning"));
  const out = await run(s, t("10am-3pm"));
  expect(bodies(out)[0]).toBe(
    "That overlaps your afternoon hours (2:00 PM–6:00 PM). Type different hours, or tap a button.",
  );
  expect(bodies(out)[1]).toBe(MORNING_Q("10:00 AM–2:00 PM"));
  expect((await s.doctorByPersonalPhone(D))?.morningEnd).toBe("14:00");
});

test("unreadable hours repeat the question", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, r("hours"));
  await run(s, r("h:evening"));
  const out = await run(s, t("late"));
  expect(bodies(out)[0]).toBe(
    'Couldn\'t read that. Type it like "9am-1pm", or tap a button.',
  );
});

test("evening Off from the menu", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await run(s, r("hours"));
  await run(s, r("h:evening"));
  await run(s, r("off"));
  expect(await s.doctorByPersonalPhone(D)).toMatchObject({
    eveningStart: null,
    eveningEnd: null,
  });
});

test("blocking a period that is Off says so", async () => {
  const s = createMemoryStore({
    doctors: [{ ...DOC, morningStart: null, morningEnd: null }],
  });
  await run(s, r("block"));
  await run(s, r("d:2026-07-31"));
  expect(bodies(await run(s, r("r:morning")))).toEqual([
    "Your morning hours are Off, so there's nothing to block.",
  ]);
});

test("a lunch break that runs into a period is rejected", async () => {
  const s = createMemoryStore({ doctors: [{ ...DOC, morningEnd: "12:30" }] });
  await run(s, r("hours"));
  await run(s, r("h:lunch"));
  const out = await run(s, t("12:30pm-3pm"));
  expect(bodies(out)[0]).toBe(
    "That lunch break (12:30 PM–3:00 PM) runs into your afternoon hours (2:00 PM–6:00 PM). Put it inside one period or between periods.",
  );
  expect(bodies(out)[1]).toContain("Lunch break? Now: None.");
  expect((await s.doctorByPersonalPhone(D))?.lunchStart).toBeNull();
});

test("a lunch break inside a period or between periods is fine", async () => {
  const s = createMemoryStore({ doctors: [{ ...DOC, morningEnd: "12:30" }] });
  await run(s, r("h:lunch"));
  await run(s, t("12:30pm-2pm"));
  expect((await s.doctorByPersonalPhone(D))?.lunchStart).toBe("12:30");
  await run(s, r("h:lunch"));
  await run(s, t("3pm-4pm"));
  expect((await s.doctorByPersonalPhone(D))?.lunchStart).toBe("15:00");
});

test("changing a period so the lunch break crosses it is rejected", async () => {
  const s = createMemoryStore({
    doctors: [
      {
        ...DOC,
        morningEnd: "12:30",
        afternoonStart: "14:00",
        lunchStart: "12:30",
        lunchEnd: "14:00",
      },
    ],
  });
  await run(s, r("h:afternoon"));
  const out = await run(s, t("1pm-6pm"));
  expect(bodies(out)[0]).toBe(
    "Your lunch break (12:30 PM–2:00 PM) would run into these hours. Change the lunch break first, or type different hours.",
  );
  expect((await s.doctorByPersonalPhone(D))?.afternoonStart).toBe("14:00");
});
