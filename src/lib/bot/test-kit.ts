import type { Doctor } from "../db/types";
import { atIst } from "../time";
import type { Incoming, Send } from "../wa/types";

export const DOC: Doctor = {
  id: "doc-1",
  name: "Dr. Mehta",
  clinicName: "Sunrise Family Clinic",
  businessPhoneNumberId: "DOCPN",
  personalPhone: "919000000001",
  registrationNumber: "MMC-123",
  signaturePath: "doc-1.png",
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  dayStart: "10:00",
  dayEnd: "22:00",
  slotMinutes: 30,
  morningEnd: "14:00",
  afternoonEnd: "18:00",
};
export const NOW = atIst("2026-07-30", "09:00");

const base = (
  from: string,
  id?: string,
  phoneNumberId = DOC.businessPhoneNumberId,
) => ({ id: id ?? "wamid.test", phoneNumberId, from });
export const text = (
  from: string,
  body: string,
  id?: string,
  pn?: string,
): Incoming => ({ ...base(from, id, pn), type: "text", text: body });
export const reply = (
  from: string,
  replyId: string,
  id?: string,
  pn?: string,
): Incoming => ({ ...base(from, id, pn), type: "reply", replyId });
export const image = (
  from: string,
  mediaId: string,
  caption?: string,
  id?: string,
  pn?: string,
): Incoming => ({ ...base(from, id, pn), type: "image", mediaId, caption });
export const sticker = (from: string, id?: string, pn?: string): Incoming => ({
  ...base(from, id, pn),
  type: "other",
});

export const bodies = (sends: Send[]): string[] =>
  sends.map((s) => (s.msg.kind === "document" ? s.msg.caption : s.msg.body));
// biome-ignore lint/suspicious/noExplicitAny: test helper over the Out union
export const ids = (s: Send): string[] =>
  ((s.msg as any).rows ?? (s.msg as any).buttons ?? []).map(
    (r: { id: string }) => r.id,
  );
// biome-ignore lint/suspicious/noExplicitAny: test helper over the Out union
export const titles = (s: Send): string[] =>
  ((s.msg as any).rows ?? (s.msg as any).buttons ?? []).map(
    (r: { title: string }) => r.title,
  );
