// Server only: uses SUPABASE_SECRET_KEY. Never import from a client component.
import { createClient } from "@supabase/supabase-js";
import type {
  Activity,
  Appointment,
  Block,
  Doctor,
  Staff,
  Store,
} from "./types";

// biome-ignore lint/suspicious/noExplicitAny: untyped Supabase rows, mapped field by field below
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
  morningStart: r.morning_start,
  morningEnd: r.morning_end,
  afternoonStart: r.afternoon_start,
  afternoonEnd: r.afternoon_end,
  eveningStart: r.evening_start,
  eveningEnd: r.evening_end,
  lunchStart: r.lunch_start,
  lunchEnd: r.lunch_end,
  slotMinutes: r.slot_minutes,
  hoursSet: r.hours_set,
  standardFee: r.standard_fee ?? 0,
  address: r.address ?? null,
});

const DOCTOR_COLS: Record<string, string> = {
  registrationNumber: "registration_number",
  signaturePath: "signature_path",
  morningStart: "morning_start",
  morningEnd: "morning_end",
  afternoonStart: "afternoon_start",
  afternoonEnd: "afternoon_end",
  eveningStart: "evening_start",
  eveningEnd: "evening_end",
  lunchStart: "lunch_start",
  lunchEnd: "lunch_end",
  slotMinutes: "slot_minutes",
  hoursSet: "hours_set",
  standardFee: "standard_fee",
  address: "address",
};

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
  patientAge: r.patient_age,
  patientGender: r.patient_gender,
  patientArea: r.patient_area,
  source: r.source,
  fee: r.fee,
  createdBy: r.created_by,
  completedBy: r.completed_by,
});

const toStaff = (r: Row): Staff => ({
  id: r.id,
  doctorId: r.doctor_id,
  role: r.role,
  name: r.name,
  keyVersion: r.key_version,
  active: r.active,
  createdAt: new Date(r.created_at),
  lastActiveAt: r.last_active_at ? new Date(r.last_active_at) : null,
});

const toActivity = (r: Row): Activity => ({
  id: r.id,
  doctorId: r.doctor_id,
  actor: r.actor,
  staffId: r.staff_id,
  action: r.action,
  appointmentId: r.appointment_id,
  detail: r.detail ?? {},
  at: new Date(r.at),
});

const STAFF_COLS: Record<string, string> = {
  keyHash: "key_hash",
  keyVersion: "key_version",
  active: "active",
  lastActiveAt: "last_active_at",
};

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
  patientAge: "patient_age",
  patientGender: "patient_gender",
  patientArea: "patient_area",
  source: "source",
  fee: "fee",
  createdBy: "created_by",
  completedBy: "completed_by",
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
    async doctorById(id) {
      const r = must(
        await db.from("doctors").select("*").eq("id", id).maybeSingle(),
      );
      return r ? toDoctor(r) : null;
    },
    async prescribedTexts(did) {
      const rows = must(
        await db
          .from("appointments")
          .select("prescription_text")
          .eq("doctor_id", did)
          .not("prescription_text", "is", null)
          .order("updated_at", { ascending: false })
          .limit(200),
      );
      return (rows ?? []).map((r: Row) => r.prescription_text as string);
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
      for (const [k, v] of Object.entries(patch)) row[DOCTOR_COLS[k]] = v;
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
        await db.from("conversations").upsert({
          phone_number_id: c.phoneNumberId,
          wa_user: c.waUser,
          state: c.state,
          ctx: c.ctx,
        }),
      );
    },
    async touchInbound(pn, u, at) {
      must(
        await db.from("conversations").upsert({
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
    async searchAppointments(did, o) {
      // Escape LIKE wildcards in what the user typed.
      const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      let q = db
        .from("appointments")
        .select("*")
        .eq("doctor_id", did)
        .gte("starts_at", o.from.toISOString())
        .lt(
          "starts_at",
          (o.before && o.before < o.to ? o.before : o.to).toISOString(),
        );
      if (o.phone) q = q.like("patient_phone", like(o.phone));
      if (o.name) q = q.ilike("patient_name", like(o.name));
      const rows = must(
        await q.order("starts_at", { ascending: false }).limit(o.limit),
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
          patient_age: n.patientAge ?? null,
          patient_gender: n.patientGender ?? null,
          patient_area: n.patientArea ?? null,
          source: n.source ?? "whatsapp",
          created_by: n.createdBy ?? null,
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
        await db.from("blocks").insert({
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
      const data = must(
        await db.storage.from(bucket).createSignedUrl(path, 3600),
      );
      if (!data) throw new Error(`no signed url for ${bucket}/${path}`);
      return data.signedUrl;
    },
    async staffByKeyHash(hash) {
      const r = must(
        await db.from("staff").select("*").eq("key_hash", hash).maybeSingle(),
      );
      return r ? toStaff(r) : null;
    },
    async staffById(id) {
      const r = must(
        await db.from("staff").select("*").eq("id", id).maybeSingle(),
      );
      return r ? toStaff(r) : null;
    },
    async listStaff(did) {
      const rows = must(
        await db
          .from("staff")
          .select("*")
          .eq("doctor_id", did)
          .order("created_at"),
      );
      return (rows ?? []).map(toStaff);
    },
    async createStaff(n) {
      const r = must(
        await db
          .from("staff")
          .insert({
            doctor_id: n.doctorId,
            role: n.role,
            name: n.name,
            key_hash: n.keyHash,
          })
          .select("*")
          .single(),
      );
      if (!r) throw new Error("staff insert returned no row");
      return toStaff(r);
    },
    async updateStaff(id, patch) {
      const row: Row = {};
      for (const [k, v] of Object.entries(patch))
        row[STAFF_COLS[k]] = v instanceof Date ? v.toISOString() : v;
      must(await db.from("staff").update(row).eq("id", id));
    },
    async logActivity(a, at) {
      must(
        await db.from("activity").insert({
          doctor_id: a.doctorId,
          actor: a.actor,
          staff_id: a.staffId,
          action: a.action,
          appointment_id: a.appointmentId,
          detail: a.detail,
          at: at.toISOString(),
        }),
      );
    },
    async activity(did, opts) {
      let q = db.from("activity").select("*").eq("doctor_id", did);
      if (opts.staffId) q = q.eq("staff_id", opts.staffId);
      const rows = must(
        await q.order("at", { ascending: false }).limit(opts.limit),
      );
      return (rows ?? []).map(toActivity);
    },
    async loginFailures(ip, since) {
      const { count, error } = await db
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("at", since.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async addLoginFailure(ip, at) {
      must(
        await db.from("login_attempts").insert({ ip, at: at.toISOString() }),
      );
    },
    async addAccessRequest(r, at) {
      must(
        await db.from("access_requests").insert({
          doctor_name: r.doctorName,
          clinic_name: r.clinicName,
          city: r.city,
          phone: r.phone,
          email: r.email,
          ip: r.ip,
          created_at: at.toISOString(),
        }),
      );
    },
    async accessRequestsSince(ip, since) {
      const { count, error } = await db
        .from("access_requests")
        .select("*", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", since.toISOString());
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  };
}
