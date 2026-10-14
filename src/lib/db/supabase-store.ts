// Server only: uses SUPABASE_SECRET_KEY. Never import from a client component.
import { createClient } from "@supabase/supabase-js";
import type { Appointment, Block, Doctor, Store } from "./types";

type Row = Record<string, any>;

const toDoctor = (r: Row): Doctor => ({
  id: r.id,
  name: r.name,
  clinicName: r.clinic_name,
  businessPhoneNumberId: r.business_phone_number_id,
  personalPhone: r.personal_phone,
  registrationNumber: r.registration_number,
  signaturePath: r.signature_path,
  workingDays: r.working_days,
  dayStart: r.day_start,
  dayEnd: r.day_end,
  slotMinutes: r.slot_minutes,
  morningEnd: r.morning_end,
  afternoonEnd: r.afternoon_end,
});

const toAppointment = (r: Row): Appointment => ({
  id: r.id,
  doctorId: r.doctor_id,
  patientPhone: r.patient_phone,
  patientName: r.patient_name,
  startsAt: new Date(r.starts_at),
  endsAt: new Date(r.ends_at),
  status: r.status,
  notes: r.notes,
  cancelReason: r.cancel_reason,
  cancelledBy: r.cancelled_by,
  prescriptionText: r.prescription_text,
  prescriptionImagePath: r.prescription_image_path,
  prescriptionPdfPath: r.prescription_pdf_path,
});

const APPT_COLS: Record<string, string> = {
  patientPhone: "patient_phone",
  patientName: "patient_name",
  startsAt: "starts_at",
  endsAt: "ends_at",
  status: "status",
  notes: "notes",
  cancelReason: "cancel_reason",
  cancelledBy: "cancelled_by",
  prescriptionText: "prescription_text",
  prescriptionImagePath: "prescription_image_path",
  prescriptionPdfPath: "prescription_pdf_path",
};

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export function createSupabaseStore(): Store {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });

  return {
    async doctorByBusinessNumber(pn) {
      const r = must(
        await db
          .from("doctors")
          .select("*")
          .eq("business_phone_number_id", pn)
          .maybeSingle(),
      );
      return r ? toDoctor(r) : null;
    },
    async doctorByPersonalPhone(p) {
      const r = must(
        await db
          .from("doctors")
          .select("*")
          .eq("personal_phone", p)
          .maybeSingle(),
      );
      return r ? toDoctor(r) : null;
    },
    async updateDoctor(id, patch) {
      const row: Row = {};
      if ("registrationNumber" in patch)
        row.registration_number = patch.registrationNumber;
      if ("signaturePath" in patch) row.signature_path = patch.signaturePath;
      must(await db.from("doctors").update(row).eq("id", id));
    },
    async getConversation(pn, u) {
      const r = must(
        await db
          .from("conversations")
          .select("*")
          .eq("phone_number_id", pn)
          .eq("wa_user", u)
          .maybeSingle(),
      );
      return {
        phoneNumberId: pn,
        waUser: u,
        state: r?.state ?? "idle",
        ctx: r?.ctx ?? {},
        lastInboundAt: r?.last_inbound_at ? new Date(r.last_inbound_at) : null,
      };
    },
    async saveConversation(c) {
      must(
        await db
          .from("conversations")
          .upsert({
            phone_number_id: c.phoneNumberId,
            wa_user: c.waUser,
            state: c.state,
            ctx: c.ctx,
          }),
      );
    },
    async touchInbound(pn, u, at) {
      must(
        await db
          .from("conversations")
          .upsert({
            phone_number_id: pn,
            wa_user: u,
            last_inbound_at: at.toISOString(),
          }),
      );
    },
    async markProcessed(id) {
      const { error } = await db.from("processed_messages").insert({ id });
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error(error.message);
    },
    async appointmentsBetween(did, from, to) {
      const rows = must(
        await db
          .from("appointments")
          .select("*")
          .eq("doctor_id", did)
          .gte("starts_at", from.toISOString())
          .lt("starts_at", to.toISOString())
          .order("starts_at"),
      );
      return (rows ?? []).map(toAppointment);
    },
    async patientAppointments(did, phone) {
      const rows = must(
        await db
          .from("appointments")
          .select("*")
          .eq("doctor_id", did)
          .eq("patient_phone", phone)
          .order("starts_at", { ascending: false }),
      );
      return (rows ?? []).map(toAppointment);
    },
    async createAppointment(n) {
      const { data, error } = await db
        .from("appointments")
        .insert({
          doctor_id: n.doctorId,
          patient_phone: n.patientPhone,
          patient_name: n.patientName,
          starts_at: n.startsAt.toISOString(),
          ends_at: n.endsAt.toISOString(),
          notes: n.notes,
        })
        .select("*")
        .single();
      if (error?.code === "23505") return "slot_taken";
      if (error) throw new Error(error.message);
      return toAppointment(data);
    },
    async getAppointment(id) {
      const r = must(
        await db.from("appointments").select("*").eq("id", id).maybeSingle(),
      );
      return r ? toAppointment(r) : null;
    },
    async updateAppointment(id, patch) {
      const row: Row = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(patch))
        row[APPT_COLS[k]] = v instanceof Date ? v.toISOString() : v;
      must(await db.from("appointments").update(row).eq("id", id));
    },
    async isClosed(did, date) {
      const r = must(
        await db
          .from("closures")
          .select("date")
          .eq("doctor_id", did)
          .eq("date", date)
          .maybeSingle(),
      );
      return r !== null;
    },
    async setClosed(did, date, closed) {
      if (closed)
        must(await db.from("closures").upsert({ doctor_id: did, date }));
      else
        must(
          await db
            .from("closures")
            .delete()
            .eq("doctor_id", did)
            .eq("date", date),
        );
    },
    async blocksBetween(did, from, to) {
      const rows = must(
        await db
          .from("blocks")
          .select("*")
          .eq("doctor_id", did)
          .lt("starts_at", to.toISOString())
          .gt("ends_at", from.toISOString()),
      );
      return (rows ?? []).map(
        (r: Row): Block => ({
          id: r.id,
          doctorId: r.doctor_id,
          startsAt: new Date(r.starts_at),
          endsAt: new Date(r.ends_at),
        }),
      );
    },
    async addBlock(did, startsAt, endsAt) {
      must(
        await db
          .from("blocks")
          .insert({
            doctor_id: did,
            starts_at: startsAt.toISOString(),
            ends_at: endsAt.toISOString(),
          }),
      );
    },
    async putFile(bucket, path, bytes, contentType) {
      must(
        await db.storage
          .from(bucket)
          .upload(path, bytes, { contentType, upsert: true }),
      );
    },
    async getFile(bucket, path) {
      const blob = must(await db.storage.from(bucket).download(path));
      return new Uint8Array(await (blob as Blob).arrayBuffer());
    },
    async signedUrl(bucket, path) {
      return must(await db.storage.from(bucket).createSignedUrl(path, 3600))!
        .signedUrl;
    },
  };
}
