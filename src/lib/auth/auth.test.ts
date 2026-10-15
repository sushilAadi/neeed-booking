import { expect, test } from "vitest";
import { DOC, NOW } from "../bot/test-kit";
import { createMemoryStore } from "../db/memory-store";
import { generateKey, hashKey, normalizeKey } from "./keys";
import { actorLabel, currentStaff, login } from "./login";
import { signSession, verifySession } from "./session";

const ENV = { pepper: "pepper", secret: "secret" };
const KEY =
  /^(DR|RC)-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
const DAY = 24 * 3600_000;

test("generateKey: role prefix + 12 unambiguous characters, grouped", () => {
  const d = generateKey("doctor");
  const r = generateKey("reception");
  expect(d).toMatch(KEY);
  expect(d.startsWith("DR-")).toBe(true);
  expect(r.startsWith("RC-")).toBe(true);
  expect(d).not.toBe(generateKey("doctor"));
});

test("normalizeKey ignores case, spaces and dashes; rejects bad keys", () => {
  expect(normalizeKey(" dr-k7qp 92xm-4twh ")).toBe("DRK7QP92XM4TWH");
  expect(normalizeKey("RC K7QP92XM4TWH")).toBe("RCK7QP92XM4TWH");
  expect(normalizeKey("XX-K7QP-92XM-4TWH")).toBe(null);
  expect(normalizeKey("DR-K7QP-92XM")).toBe(null);
  for (const bad of ["0", "O", "1", "I", "L"])
    expect(normalizeKey(`DR-K7QP-92XM-4TW${bad}`)).toBe(null);
});

test("sessions round-trip, reject tampering and expire after 30 days", () => {
  const t = signSession({ staffId: "s1", keyVersion: 2 }, NOW, "secret");
  expect(verifySession(t, NOW, "secret")).toEqual({
    staffId: "s1",
    keyVersion: 2,
  });
  expect(verifySession(`${t}x`, NOW, "secret")).toBe(null);
  expect(verifySession(t, NOW, "other")).toBe(null);
  expect(verifySession(t, new Date(+NOW + 29 * DAY), "secret")).not.toBe(null);
  expect(verifySession(t, new Date(+NOW + 31 * DAY), "secret")).toBe(null);
});

const withStaff = async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const docKey = generateKey("doctor");
  const recKey = generateKey("reception");
  const doctor = await s.createStaff({
    doctorId: DOC.id,
    role: "doctor",
    name: DOC.name,
    keyHash: hashKey(normalizeKey(docKey) as string, ENV.pepper),
  });
  const riya = await s.createStaff({
    doctorId: DOC.id,
    role: "reception",
    name: "Riya",
    keyHash: hashKey(normalizeKey(recKey) as string, ENV.pepper),
  });
  return { s, docKey, recKey, doctor, riya };
};

test("login: the right key logs in; a wrong key is refused and counted", async () => {
  const { s, recKey, riya } = await withStaff();
  const ok = await login(
    s,
    { key: recKey.toLowerCase(), ip: "1.1.1.1" },
    NOW,
    ENV,
  );
  expect(ok).toMatchObject({ ok: true, staff: { id: riya.id } });
  const bad = await login(
    s,
    { key: "DR-AAAA-BBBB-CCCC", ip: "1.1.1.1" },
    NOW,
    ENV,
  );
  expect(bad).toEqual({
    ok: false,
    message: "That key didn't work. Check it and try again.",
  });
  expect(await s.loginFailures("1.1.1.1", new Date(0))).toBe(1);
});

test("login: after 10 failures in 15 minutes even the right key waits", async () => {
  const { s, docKey } = await withStaff();
  for (let n = 0; n < 10; n++)
    await login(s, { key: "nonsense", ip: "2.2.2.2" }, NOW, ENV);
  expect(await login(s, { key: docKey, ip: "2.2.2.2" }, NOW, ENV)).toEqual({
    ok: false,
    message: "Too many tries, wait 15 minutes.",
  });
  const later = new Date(+NOW + 16 * 60_000);
  expect(
    await login(s, { key: docKey, ip: "2.2.2.2" }, later, ENV),
  ).toMatchObject({ ok: true });
});

test("currentStaff: valid session → staff + doctor; removed or re-keyed → null", async () => {
  const { s, recKey, riya } = await withStaff();
  const r = await login(s, { key: recKey, ip: "3.3.3.3" }, NOW, ENV);
  if (!r.ok) throw new Error("login failed");
  expect(await currentStaff(s, r.token, NOW, ENV.secret)).toMatchObject({
    staff: { id: riya.id },
    doctor: { id: DOC.id },
  });
  expect(await currentStaff(s, undefined, NOW, ENV.secret)).toBe(null);
  await s.updateStaff(riya.id, { keyVersion: 2 });
  expect(await currentStaff(s, r.token, NOW, ENV.secret)).toBe(null);
  await s.updateStaff(riya.id, { keyVersion: 1, active: false });
  expect(await currentStaff(s, r.token, NOW, ENV.secret)).toBe(null);
});

test("currentStaff marks the staff member active, at most once an hour", async () => {
  const { s, docKey, doctor } = await withStaff();
  const r = await login(s, { key: docKey, ip: "4.4.4.4" }, NOW, ENV);
  if (!r.ok) throw new Error("login failed");
  await currentStaff(s, r.token, NOW, ENV.secret);
  expect((await s.staffById(doctor.id))?.lastActiveAt).toEqual(NOW);
  await currentStaff(s, r.token, new Date(+NOW + 10 * 60_000), ENV.secret);
  expect((await s.staffById(doctor.id))?.lastActiveAt).toEqual(NOW);
});

test("actorLabel: the doctor's stored name, or name (Reception)", async () => {
  const { doctor, riya } = await withStaff();
  expect(actorLabel(doctor, DOC)).toBe("Dr. Mehta");
  expect(actorLabel(riya, DOC)).toBe("Riya (Reception)");
});

test("sealKey/openKey round-trip; wrong pepper or tampering gives null", async () => {
  const { sealKey, openKey } = await import("./keys");
  const k = generateKey("reception");
  const blob = sealKey(k, "pepper");
  expect(blob).not.toContain(k);
  expect(openKey(blob, "pepper")).toBe(k);
  expect(openKey(blob, "other")).toBe(null);
  expect(openKey(`${blob.slice(0, -2)}AA`, "pepper")).toBe(null);
  expect(openKey("junk", "pepper")).toBe(null);
});
