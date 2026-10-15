import { expect, test } from "vitest";
import { DOC, NOW } from "../bot/test-kit";
import { createMemoryStore } from "../db/memory-store";
import { saveClinicDetails } from "./details";

const ME = { label: DOC.name, staffId: "doc" };

test("saves clinic name, doctor name and address, and logs it", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const r = await saveClinicDetails(
    s,
    DOC,
    {
      clinicName: "  Rao Family Clinic ",
      name: "Asha Rao",
      address: " Main Road, Tezpur ",
    },
    ME,
    NOW,
  );
  expect(r).toEqual({ ok: true });
  expect(await s.doctorById(DOC.id)).toMatchObject({
    clinicName: "Rao Family Clinic",
    name: "Dr. Asha Rao",
    address: "Main Road, Tezpur",
    businessPhoneNumberId: DOC.businessPhoneNumberId,
    personalPhone: DOC.personalPhone,
  });
  const [a] = await s.activity(DOC.id, { limit: 1 });
  expect(a.action).toBe("clinic_changed");
});

test("names are required; 'Dr.' is not doubled", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const bad = await saveClinicDetails(
    s,
    DOC,
    { clinicName: " ", name: "", address: "" },
    ME,
    NOW,
  );
  expect(bad.ok).toBe(false);
  if (!bad.ok)
    expect(Object.keys(bad.errors).sort()).toEqual(["clinicName", "name"]);
  await saveClinicDetails(
    s,
    DOC,
    { clinicName: "X", name: "dr. Asha", address: "" },
    ME,
    NOW,
  );
  expect((await s.doctorById(DOC.id))?.name).toBe("Dr. Asha");
  expect((await s.doctorById(DOC.id))?.address).toBe(null);
});
