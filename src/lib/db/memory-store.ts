import type {
  Activity,
  Appointment,
  Block,
  Conversation,
  Doctor,
  Staff,
  Store,
} from "./types";

export type MemoryStore = Store & {
  appointments: Appointment[];
  files: Map<string, Uint8Array>;
};

export function createMemoryStore(seed?: { doctors?: Doctor[] }): MemoryStore {
  const doctors = (seed?.doctors ?? []).map((d) => ({ ...d }));
  const appointments: Appointment[] = [];
  const blocks: Block[] = [];
  const closures = new Set<string>();
  const convs = new Map<string, Conversation>();
  const processed = new Set<string>();
  const files = new Map<string, Uint8Array>();
  const staff: (Staff & { keyHash: string })[] = [];
  const acts: Activity[] = [];
  const fails: { ip: string; at: Date }[] = [];
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const key = (a: string, b: string) => `${a}|${b}`;

  const pub = ({ keyHash: _, ...s }: Staff & { keyHash: string }): Staff => ({
    ...s,
  });

  const conv = (phoneNumberId: string, waUser: string): Conversation =>
    convs.get(key(phoneNumberId, waUser)) ?? {
      phoneNumberId,
      waUser,
      state: "idle",
      ctx: {},
      lastInboundAt: null,
    };

  return {
    appointments,
    files,
    async doctorByBusinessNumber(pn) {
      return doctors.find((d) => d.businessPhoneNumberId === pn) ?? null;
    },
    async doctorById(id) {
      return doctors.find((d) => d.id === id) ?? null;
    },
    async prescribedTexts(did) {
      return appointments
        .filter((a) => a.doctorId === did && a.prescriptionText)
        .sort((a, b) => +b.startsAt - +a.startsAt)
        .slice(0, 200)
        .map((a) => a.prescriptionText as string);
    },
    async doctorByPersonalPhone(p) {
      return doctors.find((d) => d.personalPhone === p) ?? null;
    },
    async updateDoctor(did, patch) {
      const d = doctors.find((x) => x.id === did);
      if (d) Object.assign(d, patch);
    },
    async getConversation(pn, u) {
      return structuredClone(conv(pn, u));
    },
    async saveConversation(c) {
      const cur = conv(c.phoneNumberId, c.waUser);
      convs.set(key(c.phoneNumberId, c.waUser), {
        ...cur,
        state: c.state,
        ctx: structuredClone(c.ctx),
      });
    },
    async touchInbound(pn, u, at) {
      convs.set(key(pn, u), { ...conv(pn, u), lastInboundAt: at });
    },
    async markProcessed(mid) {
      if (processed.has(mid)) return false;
      processed.add(mid);
      return true;
    },
    async appointmentsBetween(did, from, to) {
      return appointments
        .filter(
          (a) => a.doctorId === did && a.startsAt >= from && a.startsAt < to,
        )
        .sort((a, b) => +a.startsAt - +b.startsAt)
        .map((a) => ({ ...a }));
    },
    async patientAppointments(did, phone) {
      return appointments
        .filter((a) => a.doctorId === did && a.patientPhone === phone)
        .sort((a, b) => +b.startsAt - +a.startsAt)
        .map((a) => ({ ...a }));
    },
    async createAppointment(n) {
      if (
        appointments.some(
          (a) =>
            a.doctorId === n.doctorId &&
            a.status === "CONFIRMED" &&
            +a.startsAt === +n.startsAt,
        )
      )
        return "slot_taken";
      const a: Appointment = {
        patientAge: null,
        patientGender: null,
        patientArea: null,
        source: "whatsapp",
        createdBy: null,
        ...n,
        fee: null,
        completedBy: null,
        id: id(),
        status: "CONFIRMED",
        cancelReason: null,
        cancelledBy: null,
        prescriptionText: null,
        prescriptionImagePath: null,
        prescriptionPdfPath: null,
      };
      appointments.push(a);
      return { ...a };
    },
    async getAppointment(aid) {
      const a = appointments.find((x) => x.id === aid);
      return a ? { ...a } : null;
    },
    async updateAppointment(aid, patch) {
      const a = appointments.find((x) => x.id === aid);
      if (a) Object.assign(a, patch);
    },
    async isClosed(did, date) {
      return closures.has(key(did, date));
    },
    async setClosed(did, date, closed) {
      if (closed) closures.add(key(did, date));
      else closures.delete(key(did, date));
    },
    async blocksBetween(did, from, to) {
      return blocks.filter(
        (b) => b.doctorId === did && b.startsAt < to && b.endsAt > from,
      );
    },
    async addBlock(did, startsAt, endsAt) {
      blocks.push({ id: id(), doctorId: did, startsAt, endsAt });
    },
    async putFile(bucket, path, bytes) {
      files.set(`${bucket}/${path}`, bytes);
    },
    async getFile(bucket, path) {
      const f = files.get(`${bucket}/${path}`);
      if (!f) throw new Error(`no file ${bucket}/${path}`);
      return f;
    },
    async signedUrl(bucket, path) {
      return `mem://${bucket}/${path}`;
    },
    async staffByKeyHash(hash) {
      const s = staff.find((x) => x.keyHash === hash);
      return s ? pub(s) : null;
    },
    async staffById(sid) {
      const s = staff.find((x) => x.id === sid);
      return s ? pub(s) : null;
    },
    async listStaff(did) {
      return staff.filter((x) => x.doctorId === did).map(pub);
    },
    async createStaff(n) {
      const s = {
        ...n,
        id: id(),
        keyVersion: 1,
        active: true,
        createdAt: new Date(seq),
        lastActiveAt: null,
      };
      staff.push(s);
      return pub(s);
    },
    async updateStaff(sid, patch) {
      const s = staff.find((x) => x.id === sid);
      if (s) Object.assign(s, patch);
    },
    async logActivity(a, at) {
      acts.push({ ...a, id: id(), at });
    },
    async activity(did, opts) {
      return acts
        .filter(
          (a) =>
            a.doctorId === did && (!opts.staffId || a.staffId === opts.staffId),
        )
        .sort((a, b) => +b.at - +a.at)
        .slice(0, opts.limit)
        .map((a) => ({ ...a }));
    },
    async loginFailures(ip, since) {
      return fails.filter((f) => f.ip === ip && f.at >= since).length;
    },
    async addLoginFailure(ip, at) {
      fails.push({ ip, at });
    },
  };
}
