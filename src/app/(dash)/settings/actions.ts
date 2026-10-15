"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireDoctorRole, requireStaff } from "@/lib/auth/guard";
import { openKey } from "@/lib/auth/keys";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
} from "@/lib/auth/session";
import { today } from "@/lib/bot/ctx";
import { record } from "@/lib/clinic/activity";
import {
  addBlockRange,
  type ClashMode,
  type HoursForm,
  type HoursKey,
  saveHours,
} from "@/lib/clinic/availability";
import { saveClinicDetails } from "@/lib/clinic/details";
import { addReceptionist, reissueKey, removeStaff } from "@/lib/clinic/staff";
import { imageType } from "@/lib/images";
import { PERIODS, type Period, periodHours, type Range } from "@/lib/slots";
import { addDays } from "@/lib/time";
import { deliver } from "@/lib/wa/deliver";

export type Result = { ok: boolean; message: string; clash?: number };

const pepper = () => process.env.ACCESS_CODE_PEPPER ?? "";
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const range = (v: unknown): Range | null => {
  const r = v as Range | null;
  return r && HM.test(r.start) && HM.test(r.end) ? r : null;
};

export async function saveHoursAction(
  f: HoursForm,
): Promise<
  | { ok: true; message: string }
  | { ok: false; errors: Partial<Record<HoursKey, string>> }
> {
  const s = await requireStaff();
  const form = { slotMinutes: Number(f.slotMinutes) } as HoursForm;
  for (const k of [...PERIODS, "lunch"] as const) form[k] = range(f[k]);
  const r = await saveHours(s.store, s.doctor, form, s.actor, s.now);
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Hours saved. Existing bookings are kept." };
}

/** The standard fee is the doctor's decision: doctor only. */
export async function saveFeeAction(fee: number): Promise<Result> {
  const s = await requireDoctorRole();
  if (!Number.isInteger(fee) || fee < 0 || fee > 999_999)
    return { ok: false, message: "Type the fee in whole rupees." };
  await s.store.updateDoctor(s.doctor.id, { standardFee: fee });
  await record(
    s.store,
    s.doctor.id,
    s.actor,
    "fee_default_changed",
    { detail: { from: s.doctor.standardFee, to: fee } },
    s.now,
  );
  revalidatePath("/", "layout");
  return { ok: true, message: "Standard fee saved." };
}

export async function blockAction(
  date: string,
  what: "whole" | Period | Range,
  mode: ClashMode,
): Promise<Result> {
  const s = await requireStaff();
  const first = today(s.now).date;
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  if (!days.includes(date)) return { ok: false, message: "Pick a day." };
  let r: Range | "whole" | null;
  if (what === "whole") r = "whole";
  else if (typeof what === "string")
    r = PERIODS.includes(what) ? periodHours(s.doctor, what) : null;
  else r = range(what);
  if (!r)
    return {
      ok: false,
      message:
        typeof what === "string"
          ? "That part of the day is Off already."
          : "Type a start and an end time, end after start.",
    };
  if (r !== "whole" && r.end <= r.start)
    return { ok: false, message: "The end time must be after the start." };
  const res = await addBlockRange(
    s.store,
    s.doctor,
    date,
    r,
    mode,
    s.actor,
    s.now,
  );
  if (res.clash) return { ok: false, message: "", clash: res.clash };
  await deliver(s.store, res.notices, { from: "", to: "" }, s.now);
  revalidatePath("/", "layout");
  return {
    ok: true,
    message:
      mode === "cancel"
        ? `Blocked. ${res.notices.length} patient(s) notified on WhatsApp.`
        : "Blocked. No new bookings in that time.",
  };
}

/** Registration number and signature: the doctor's own, so doctor only. */
export async function saveRxSetupAction(form: FormData): Promise<Result> {
  const s = await requireDoctorRole();
  const reg = String(form.get("reg") ?? "")
    .trim()
    .slice(0, 60);
  const file = form.get("signature");
  const patch: { registrationNumber?: string; signaturePath?: string } = {};
  if (reg && reg !== s.doctor.registrationNumber)
    patch.registrationNumber = reg;
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024)
      return {
        ok: false,
        message: "That image is over 2 MB. Pick a smaller one.",
      };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const img = imageType(bytes);
    if (!img || img.ext === "webp")
      return { ok: false, message: "Use a PNG or JPG photo." };
    const ext = img.ext;
    const path = `${s.doctor.id}.${ext}`;
    await s.store.putFile(
      "signatures",
      path,
      bytes,
      ext === "png" ? "image/png" : "image/jpeg",
    );
    patch.signaturePath = path;
  }
  if (!Object.keys(patch).length)
    return { ok: false, message: "Nothing changed." };
  await s.store.updateDoctor(s.doctor.id, patch);
  await record(s.store, s.doctor.id, s.actor, "rx_setup_changed", {}, s.now);
  revalidatePath("/settings");
  return { ok: true, message: "Prescription setup saved." };
}

export type KeyResult =
  | { ok: true; key: string; name: string }
  | { ok: false; message: string };

export async function addReceptionistAction(name: string): Promise<KeyResult> {
  const s = await requireDoctorRole();
  try {
    const r = await addReceptionist(
      s.store,
      s.doctor,
      name,
      s.actor,
      s.now,
      pepper(),
    );
    revalidatePath("/settings");
    return { ok: true, key: r.key, name: r.staff.name };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function removeStaffAction(id: string): Promise<Result> {
  const s = await requireDoctorRole();
  try {
    await removeStaff(s.store, s.doctor, id, s.actor, s.now);
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Removed. Their devices are logged out." };
}

export async function newKeyAction(id: string): Promise<KeyResult> {
  const s = await requireDoctorRole();
  try {
    const key = await reissueKey(
      s.store,
      s.doctor,
      id,
      s.actor,
      s.now,
      pepper(),
    );
    const who = await s.store.staffById(id);
    if (!who) throw new Error("That person isn't on your staff.");
    // Your own new key: keep this device logged in, every other device logs out.
    if (id === s.staff.id)
      (await cookies()).set(
        SESSION_COOKIE,
        signSession(
          { staffId: id, keyVersion: who.keyVersion },
          s.now,
          process.env.SESSION_SECRET ?? "",
        ),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: SESSION_MAX_AGE,
        },
      );
    revalidatePath("/settings");
    return {
      ok: true,
      key,
      name: who.role === "doctor" ? s.doctor.name : who.name,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Shows a staff member's key to the doctor; null for keys made before keys were viewable. */
export async function revealKeyAction(id: string): Promise<string | null> {
  const s = await requireDoctorRole();
  const who = await s.store.staffById(id);
  if (!who || who.doctorId !== s.doctor.id || !who.active) return null;
  const enc = await s.store.staffKeyEnc(id);
  return enc ? openKey(enc, pepper()) : null;
}

/** Clinic name, printed doctor name and chamber address — doctor only. */
export async function saveClinicAction(input: {
  clinicName: string;
  name: string;
  address: string;
}) {
  const s = await requireDoctorRole();
  const r = await saveClinicDetails(
    s.store,
    s.doctor,
    {
      clinicName: String(input.clinicName ?? ""),
      name: String(input.name ?? ""),
      address: String(input.address ?? ""),
    },
    s.actor,
    s.now,
  );
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

/** Clinic logo for the dashboard menu — doctor only; PNG, JPG or WebP up to 1 MB. */
export async function saveLogoAction(form: FormData): Promise<Result> {
  const s = await requireDoctorRole();
  const file = form.get("logo");
  if (!(file instanceof File) || !file.size)
    return { ok: false, message: "Pick an image first." };
  if (file.size > 1024 * 1024)
    return {
      ok: false,
      message: "That image is over 1 MB. Pick a smaller one.",
    };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const img = imageType(bytes);
  if (!img) return { ok: false, message: "Use a PNG, JPG or WebP image." };
  const path = `logo-${s.doctor.id}-${s.now.getTime()}.${img.ext}`;
  await s.store.putFile("signatures", path, bytes, img.mime);
  await s.store.updateDoctor(s.doctor.id, { logoPath: path });
  await record(
    s.store,
    s.doctor.id,
    s.actor,
    "clinic_changed",
    { detail: { logo: true } },
    s.now,
  );
  revalidatePath("/", "layout");
  return { ok: true, message: "Logo saved." };
}
