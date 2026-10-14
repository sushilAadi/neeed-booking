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
  morningStart: "10:00",
  morningEnd: "14:00",
  afternoonStart: "14:00",
  afternoonEnd: "18:00",
  eveningStart: "18:00",
  eveningEnd: "22:00",
  lunchStart: null,
  lunchEnd: null,
  slotMinutes: 30,
  hoursSet: true,
  standardFee: 0,
  address: null,
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

const items = (s: Send): { id: string; title: string }[] =>
  s.msg.kind === "list"
    ? s.msg.rows
    : s.msg.kind === "buttons"
      ? s.msg.buttons
      : [];
export const ids = (s: Send): string[] => items(s).map((r) => r.id);
export const titles = (s: Send): string[] => items(s).map((r) => r.title);
export const bodies = (sends: Send[]): string[] =>
  sends.map((s) => (s.msg.kind === "document" ? s.msg.caption : s.msg.body));

const b64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
/** Tiny images for media stubs and signatures. */
export const PNG_1PX = b64(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
);
export const JPG_1PX = b64(
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYzLjEuMTAyAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAEsAAQEAAAAAAAAAAAAAAAAAAAAHAQEAAAAAAAAAAAAAAAAAAAAAEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgACAAIAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8Av4AP/9k=",
);
