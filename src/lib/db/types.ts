export type Status = "CONFIRMED" | "CANCELLED" | "COMPLETED";
export type Gender = "M" | "F" | "O";
export type Source = "whatsapp" | "reception";
export type Role = "doctor" | "reception";
export type Doctor = {
  id: string;
  name: string;
  clinicName: string;
  businessPhoneNumberId: string;
  personalPhone: string;
  registrationNumber: string | null;
  signaturePath: string | null;
  workingDays: number[];
  /** "HH:MM" IST; a period whose start/end are null is Off. */
  morningStart: string | null;
  morningEnd: string | null;
  afternoonStart: string | null;
  afternoonEnd: string | null;
  eveningStart: string | null;
  eveningEnd: string | null;
  /** Daily break; never offered to patients. */
  lunchStart: string | null;
  lunchEnd: string | null;
  /** Appointment length in minutes (15/30/45/60). */
  slotMinutes: number;
  /** Clinic hours confirmed in setup. */
  hoursSet: boolean;
  /** Consultation fee in rupees, copied onto each visit when it is completed. */
  standardFee: number;
  address: string | null;
};
export type HoursPatch = Partial<
  Pick<
    Doctor,
    | "morningStart"
    | "morningEnd"
    | "afternoonStart"
    | "afternoonEnd"
    | "eveningStart"
    | "eveningEnd"
    | "lunchStart"
    | "lunchEnd"
    | "slotMinutes"
    | "hoursSet"
  >
>;
export type Appointment = {
  id: string;
  doctorId: string;
  patientPhone: string;
  patientName: string;
  startsAt: Date;
  endsAt: Date;
  status: Status;
  notes: string | null;
  cancelReason: string | null;
  cancelledBy: "patient" | "doctor" | null;
  prescriptionText: string | null;
  prescriptionImagePath: string | null;
  prescriptionPdfPath: string | null;
  patientAge: number | null;
  patientGender: Gender | null;
  patientArea: string | null;
  source: Source;
  /** Rupees, saved when the visit is completed; later fee changes never touch it. */
  fee: number | null;
  /** Actor labels, e.g. "Riya (Reception)". */
  createdBy: string | null;
  completedBy: string | null;
};
export type NewAppointment = Pick<
  Appointment,
  "doctorId" | "patientPhone" | "patientName" | "startsAt" | "endsAt" | "notes"
> &
  Partial<
    Pick<
      Appointment,
      "patientAge" | "patientGender" | "patientArea" | "source" | "createdBy"
    >
  >;
export type Staff = {
  id: string;
  doctorId: string;
  role: Role;
  name: string;
  keyVersion: number;
  active: boolean;
  createdAt: Date;
  lastActiveAt: Date | null;
};
export type Activity = {
  id: string;
  doctorId: string;
  actor: string;
  staffId: string | null;
  action: string;
  appointmentId: string | null;
  detail: Record<string, unknown>;
  at: Date;
};
export type Block = {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
};
export type Conversation = {
  phoneNumberId: string;
  waUser: string;
  state: string;
  ctx: Record<string, unknown>;
  lastInboundAt: Date | null;
};
export type Bucket = "signatures" | "prescriptions";
export interface Store {
  doctorByBusinessNumber(phoneNumberId: string): Promise<Doctor | null>;
  doctorByPersonalPhone(phone: string): Promise<Doctor | null>;
  doctorById(id: string): Promise<Doctor | null>;
  /** The doctor's latest prescription texts, newest first (for medicine-name suggestions). */
  prescribedTexts(doctorId: string): Promise<string[]>;
  updateDoctor(
    id: string,
    patch: Partial<
      Pick<
        Doctor,
        "registrationNumber" | "signaturePath" | "standardFee" | "address"
      >
    > &
      HoursPatch,
  ): Promise<void>;
  getConversation(phoneNumberId: string, waUser: string): Promise<Conversation>; // default state "idle", ctx {}, lastInboundAt null
  saveConversation(c: Conversation): Promise<void>; // writes state + ctx only
  touchInbound(phoneNumberId: string, waUser: string, at: Date): Promise<void>;
  markProcessed(messageId: string): Promise<boolean>; // false if already seen
  appointmentsBetween(
    doctorId: string,
    from: Date,
    to: Date,
  ): Promise<Appointment[]>; // by startsAt asc, all statuses
  patientAppointments(doctorId: string, phone: string): Promise<Appointment[]>; // startsAt desc
  createAppointment(a: NewAppointment): Promise<Appointment | "slot_taken">;
  getAppointment(id: string): Promise<Appointment | null>;
  updateAppointment(
    id: string,
    patch: Partial<Omit<Appointment, "id" | "doctorId">>,
  ): Promise<void>;
  isClosed(doctorId: string, date: string): Promise<boolean>;
  setClosed(doctorId: string, date: string, closed: boolean): Promise<void>;
  blocksBetween(doctorId: string, from: Date, to: Date): Promise<Block[]>; // overlapping the range
  addBlock(doctorId: string, startsAt: Date, endsAt: Date): Promise<void>;
  putFile(
    bucket: Bucket,
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
  getFile(bucket: Bucket, path: string): Promise<Uint8Array>;
  signedUrl(bucket: Bucket, path: string): Promise<string>; // valid 1 hour
  staffByKeyHash(hash: string): Promise<Staff | null>; // active or not
  staffById(id: string): Promise<Staff | null>;
  listStaff(doctorId: string): Promise<Staff[]>; // createdAt asc
  createStaff(s: {
    doctorId: string;
    role: Role;
    name: string;
    keyHash: string;
  }): Promise<Staff>;
  updateStaff(
    id: string,
    patch: Partial<{
      keyHash: string;
      keyVersion: number;
      active: boolean;
      lastActiveAt: Date;
    }>,
  ): Promise<void>;
  logActivity(a: Omit<Activity, "id" | "at">, at: Date): Promise<void>;
  activity(
    doctorId: string,
    opts: { limit: number; staffId?: string },
  ): Promise<Activity[]>; // newest first
  loginFailures(ip: string, since: Date): Promise<number>;
  addLoginFailure(ip: string, at: Date): Promise<void>;
}
