export type Status = "CONFIRMED" | "CANCELLED" | "COMPLETED";
export type Doctor = {
  id: string;
  name: string;
  clinicName: string;
  businessPhoneNumberId: string;
  personalPhone: string;
  registrationNumber: string | null;
  signaturePath: string | null;
  workingDays: number[];
  dayStart: string;
  dayEnd: string;
  slotMinutes: number;
  morningEnd: string;
  afternoonEnd: string;
};
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
};
export type NewAppointment = Pick<
  Appointment,
  "doctorId" | "patientPhone" | "patientName" | "startsAt" | "endsAt" | "notes"
>;
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
  updateDoctor(
    id: string,
    patch: Partial<Pick<Doctor, "registrationNumber" | "signaturePath">>,
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
}
