import type { Conversation, Doctor, Store } from "../db/types";
import { addDays, atIst, istDate } from "../time";
import type { Incoming, Out, Send } from "../wa/types";

export type Media = (
  id: string,
) => Promise<{ bytes: Uint8Array; mime: string }>;
export type BotCtx = {
  store: Store;
  doctor: Doctor;
  msg: Incoming;
  now: Date;
  media?: Media;
};

export const platformId = () =>
  process.env.WA_PLATFORM_PHONE_NUMBER_ID ?? "PLATFORM";

/** IST bounds of the day `now` falls in. */
export function today(now: Date) {
  const date = istDate(now);
  return {
    date,
    from: atIst(date, "00:00"),
    to: atIst(addDays(date, 1), "00:00"),
  };
}

/** Lower-cased trimmed text, or the tapped reply id. */
export function input(msg: Incoming): string | null {
  if (msg.type === "text") return (msg.text ?? "").trim().toLowerCase();
  if (msg.type === "reply") return msg.replyId ?? null;
  return null;
}

export const say = (body: string): Out => ({ kind: "text", body });

export async function saveState(
  store: Store,
  c: Conversation,
  state: string,
  ctx: Record<string, unknown> = {},
) {
  await store.saveConversation({ ...c, state, ctx });
}

export type { Send };
