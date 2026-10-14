import { createHmac, timingSafeEqual } from "node:crypto";
import type { Incoming } from "./types";

export function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const want = Buffer.from(
    createHmac("sha256", appSecret).update(rawBody).digest("hex"),
  );
  const got = Buffer.from(header.slice(7));
  return got.length === want.length && timingSafeEqual(got, want);
}

// biome-ignore lint/suspicious/noExplicitAny: untrusted webhook JSON, checked field by field
type J = any;
const arr = (x: J): J[] => (Array.isArray(x) ? x : []);

export function parseWebhook(body: unknown): Incoming[] {
  const out: Incoming[] = [];
  for (const entry of arr((body as J)?.entry)) {
    for (const change of arr(entry?.changes)) {
      if (change?.field !== "messages") continue;
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (typeof phoneNumberId !== "string") continue;
      for (const m of arr(change.value?.messages)) {
        if (typeof m?.id !== "string" || typeof m?.from !== "string") continue;
        const base = { id: m.id, phoneNumberId, from: m.from };
        const reply =
          m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
        if (m.type === "text" && typeof m.text?.body === "string")
          out.push({ ...base, type: "text", text: m.text.body });
        else if (m.type === "interactive" && typeof reply === "string")
          out.push({ ...base, type: "reply", replyId: reply });
        else if (m.type === "image" && typeof m.image?.id === "string")
          out.push({
            ...base,
            type: "image",
            mediaId: m.image.id,
            caption: m.image.caption,
          });
        else out.push({ ...base, type: "other" });
      }
    }
  }
  return out;
}
