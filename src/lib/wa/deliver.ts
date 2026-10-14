import type { Store } from "../db/types";
import { sendMessage } from "./client";
import type { Send } from "./types";

const DAY = 24 * 60 * 60 * 1000;

export async function windowOpen(
  store: Store,
  from: string,
  to: string,
  now: Date,
): Promise<boolean> {
  const c = await store.getConversation(from, to);
  return c.lastInboundAt !== null && +now - +c.lastInboundAt < DAY;
}

// Zero-cost rule: only the current sender, or someone whose 24 h window is open, gets a message.
export async function deliver(
  store: Store,
  sends: Send[],
  sender: { from: string; to: string },
  now: Date,
  send: (s: Send) => Promise<void> = sendMessage,
): Promise<void> {
  for (const s of sends) {
    const isSender = s.from === sender.from && s.to === sender.to;
    if (isSender || (await windowOpen(store, s.from, s.to, now))) await send(s);
  }
}
