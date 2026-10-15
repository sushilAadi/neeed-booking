import { expect, test } from "vitest";
import { generateKey, hashKey, normalizeKey } from "../auth/keys";
import { currentStaff, login } from "../auth/login";
import { DOC, NOW } from "../bot/test-kit";
import { createMemoryStore } from "../db/memory-store";
import { addReceptionist, reissueKey, removeStaff } from "./staff";

const ENV = { pepper: "pepper", secret: "secret" };
const ME = { label: DOC.name, staffId: "doc" };

const setup = async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const docKey = generateKey("doctor");
  const doc = await s.createStaff({
    doctorId: DOC.id,
    role: "doctor",
    name: DOC.name,
    keyHash: hashKey(normalizeKey(docKey) as string, ENV.pepper),
  });
  return { s, doc, docKey };
};
const tokenFor = async (
  s: Awaited<ReturnType<typeof setup>>["s"],
  key: string,
) => {
  const r = await login(s, { key, ip: "1.1.1.1" }, NOW, ENV);
  if (!r.ok) throw new Error(r.message);
  return r.token;
};
const actions = async (s: Awaited<ReturnType<typeof setup>>["s"]) =>
  (await s.activity(DOC.id, { limit: 10 })).map((a) => a.action);

test("addReceptionist: returns an RC- key that logs in, and logs it", async () => {
  const { s } = await setup();
  const { staff, key } = await addReceptionist(
    s,
    DOC,
    "  Riya ",
    ME,
    NOW,
    ENV.pepper,
  );
  expect(key.startsWith("RC-")).toBe(true);
  expect(staff).toMatchObject({ role: "reception", name: "Riya" });
  const t = await tokenFor(s, key);
  expect((await currentStaff(s, t, NOW, ENV.secret))?.staff.id).toBe(staff.id);
  expect(await actions(s)).toContain("staff_added");
});

test("addReceptionist: a name is required", async () => {
  const { s } = await setup();
  await expect(
    addReceptionist(s, DOC, "  ", ME, NOW, ENV.pepper),
  ).rejects.toThrow("Type a name");
});

test("removeStaff: their old session stops working; logged", async () => {
  const { s } = await setup();
  const { staff, key } = await addReceptionist(
    s,
    DOC,
    "Riya",
    ME,
    NOW,
    "pepper",
  );
  const t = await tokenFor(s, key);
  await removeStaff(s, DOC, staff.id, ME, NOW);
  expect(await currentStaff(s, t, NOW, ENV.secret)).toBe(null);
  expect(await actions(s)).toContain("staff_removed");
});

test("removeStaff: refuses the doctor row and other clinics' staff", async () => {
  const { s, doc } = await setup();
  await expect(removeStaff(s, DOC, doc.id, ME, NOW)).rejects.toThrow(
    "Can't remove the doctor",
  );
  const other = await s.createStaff({
    doctorId: "other-doc",
    role: "reception",
    name: "X",
    keyHash: "h",
  });
  await expect(removeStaff(s, DOC, other.id, ME, NOW)).rejects.toThrow();
  expect((await s.staffById(other.id))?.active).toBe(true);
});

test("reissueKey: only that person's old sessions end; new key works", async () => {
  const { s, doc, docKey } = await setup();
  const { staff, key } = await addReceptionist(
    s,
    DOC,
    "Riya",
    ME,
    NOW,
    "pepper",
  );
  const docT = await tokenFor(s, docKey);
  const riyaT = await tokenFor(s, key);
  const fresh = await reissueKey(s, DOC, staff.id, ME, NOW, ENV.pepper);
  expect(fresh.startsWith("RC-")).toBe(true);
  expect(await currentStaff(s, riyaT, NOW, ENV.secret)).toBe(null);
  expect((await currentStaff(s, docT, NOW, ENV.secret))?.staff.id).toBe(doc.id);
  expect((await login(s, { key, ip: "2.2.2.2" }, NOW, ENV)).ok).toBe(false);
  const t2 = await tokenFor(s, fresh);
  expect((await currentStaff(s, t2, NOW, ENV.secret))?.staff.id).toBe(staff.id);
  expect(await actions(s)).toContain("key_reissued");
  expect(
    (await reissueKey(s, DOC, doc.id, ME, NOW, "pepper")).startsWith("DR-"),
  ).toBe(true);
});

test("keys can be viewed later by the doctor: add and reissue store a sealed copy", async () => {
  const { openKey } = await import("../auth/keys");
  const { s } = await setup();
  const { staff, key } = await addReceptionist(
    s,
    DOC,
    "Riya",
    ME,
    NOW,
    "pepper",
  );
  expect(openKey((await s.staffKeyEnc(staff.id)) as string, "pepper")).toBe(
    key,
  );
  const fresh = await reissueKey(s, DOC, staff.id, ME, NOW, "pepper");
  expect(openKey((await s.staffKeyEnc(staff.id)) as string, "pepper")).toBe(
    fresh,
  );
});
