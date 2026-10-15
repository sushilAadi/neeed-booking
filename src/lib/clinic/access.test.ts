import { expect, test } from "vitest";
import { NOW } from "../bot/test-kit";
import { createMemoryStore } from "../db/memory-store";
import { requestAccess } from "./access";

const ok = {
  doctorName: "Dr. Asha Rao",
  clinicName: "Rao Clinic",
  city: "Tezpur",
  phone: "+91 98765-43210",
  email: "",
  clinicAddress: "Ward 4, Main Road, Tezpur 784001",
  doctorAddress: "",
  regNumber: "",
  ip: "1.1.1.1",
};
const quiet = async () => {};

test("saves a valid request with the phone normalised", async () => {
  const s = createMemoryStore();
  const texts: string[] = [];
  const r = await requestAccess(s, ok, NOW, async (t) => {
    texts.push(t);
  });
  expect(r).toEqual({ ok: true });
  expect(s.accessRequests).toHaveLength(1);
  expect(s.accessRequests[0]).toMatchObject({
    doctorName: "Dr. Asha Rao",
    phone: "919876543210",
    email: null,
  });
  expect(texts[0]).toContain("*New access request*");
});

test("rejects missing fields and a bad phone", async () => {
  const s = createMemoryStore();
  const r = await requestAccess(
    s,
    { ...ok, doctorName: " ", clinicName: "", city: "", phone: "123" },
    NOW,
    quiet,
  );
  expect(r.ok).toBe(false);
  if (!r.ok)
    expect(Object.keys(r.errors).sort()).toEqual([
      "city",
      "clinicName",
      "doctorName",
      "phone",
    ]);
  expect(s.accessRequests).toHaveLength(0);
});

test("bad email is rejected, empty email is fine", async () => {
  const s = createMemoryStore();
  const bad = await requestAccess(s, { ...ok, email: "nope" }, NOW, quiet);
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.errors.email).toBeTruthy();
  const good = await requestAccess(s, { ...ok, email: "a@b.in" }, NOW, quiet);
  expect(good.ok).toBe(true);
});

test("6th request from one IP within an hour is refused", async () => {
  const s = createMemoryStore();
  for (let i = 0; i < 5; i++)
    expect((await requestAccess(s, ok, NOW, quiet)).ok).toBe(true);
  const r = await requestAccess(s, ok, NOW, quiet);
  expect(r).toEqual({
    ok: false,
    errors: { form: "Too many requests. Try again in an hour." },
  });
  const later = new Date(+NOW + 61 * 60_000);
  expect((await requestAccess(s, ok, later, quiet)).ok).toBe(true);
});

test("still saves when the alert throws", async () => {
  const s = createMemoryStore();
  const r = await requestAccess(s, ok, NOW, async () => {
    throw new Error("whatsapp down");
  });
  expect(r).toEqual({ ok: true });
  expect(s.accessRequests).toHaveLength(1);
});

test("chamber address is required; doctor address and reg. no. are saved when given", async () => {
  const s = createMemoryStore();
  const bad = await requestAccess(s, { ...ok, clinicAddress: " " }, NOW, quiet);
  expect(bad.ok).toBe(false);
  if (!bad.ok) expect(bad.errors.clinicAddress).toBeTruthy();
  const good = await requestAccess(
    s,
    { ...ok, doctorAddress: "12 Lake View, Tezpur", regNumber: "ASM-1234" },
    NOW,
    quiet,
  );
  expect(good.ok).toBe(true);
  expect(s.accessRequests[0]).toMatchObject({
    clinicAddress: "Ward 4, Main Road, Tezpur 784001",
    doctorAddress: "12 Lake View, Tezpur",
    regNumber: "ASM-1234",
  });
});
