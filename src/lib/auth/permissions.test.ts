import { expect, test } from "vitest";
import { DOC, NOW } from "../bot/test-kit";
import { createMemoryStore } from "../db/memory-store";
import type { Staff } from "../db/types";
import { can, DEFAULT_PERMS, setPermissions } from "./permissions";

const staff = (p: Partial<Staff>): Staff => ({
  id: "s1",
  doctorId: DOC.id,
  role: "reception",
  name: "Riya",
  keyVersion: 1,
  active: true,
  createdAt: NOW,
  lastActiveAt: null,
  permissions: [],
  ...p,
});

test("doctor can do everything; reception only what is ticked", () => {
  expect(can(staff({ role: "doctor" }), "reports")).toBe(true);
  expect(can(staff({ permissions: ["add"] }), "add")).toBe(true);
  expect(can(staff({ permissions: ["add"] }), "reports")).toBe(false);
  expect(DEFAULT_PERMS).toEqual(["add", "cancel", "history"]);
});

test("setPermissions keeps only known boxes, refuses the doctor row, logs it", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const riya = await s.createStaff({
    doctorId: DOC.id,
    role: "reception",
    name: "Riya",
    keyHash: "h",
  });
  expect(riya.permissions).toEqual(DEFAULT_PERMS);
  const me = { label: DOC.name, staffId: "doc" };
  await setPermissions(s, DOC, riya.id, ["reports", "bogus", "fee"], me, NOW);
  expect((await s.staffById(riya.id))?.permissions).toEqual(["fee", "reports"]);
  const doc = await s.createStaff({
    doctorId: DOC.id,
    role: "doctor",
    name: DOC.name,
    keyHash: "d",
  });
  await expect(setPermissions(s, DOC, doc.id, [], me, NOW)).rejects.toThrow();
  const [a] = await s.activity(DOC.id, { limit: 1 });
  expect(a.action).toBe("access_changed");
});
