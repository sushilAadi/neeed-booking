import type { Store } from "../db/types";
import { downloadMedia, sendMessage } from "../wa/client";
import { deliver } from "../wa/deliver";
import type { Incoming, Send } from "../wa/types";
import { type Media, platformId, say } from "./ctx";
import { handleDoctor } from "./doctor";
import { handlePatient } from "./patient";

export async function routeIncoming(
  store: Store,
  msg: Incoming,
  now: Date,
  send: (s: Send) => Promise<void> = sendMessage,
  media: Media = downloadMedia,
): Promise<void> {
  try {
    if (!(await store.markProcessed(msg.id))) return;
    let sends: Send[] = [];
    const doctorAsSender =
      msg.phoneNumberId === platformId()
        ? await store.doctorByPersonalPhone(msg.from)
        : null;
    if (doctorAsSender)
      sends = await handleDoctor({
        store,
        doctor: doctorAsSender,
        msg,
        now,
        media,
      });
    else {
      const doctor = await store.doctorByBusinessNumber(msg.phoneNumberId);
      if (doctor)
        sends = await handlePatient({ store, doctor, msg, now, media });
      else if (msg.phoneNumberId === platformId())
        sends = [
          {
            from: msg.phoneNumberId,
            to: msg.from,
            msg: say("This number is for registered doctors only."),
          },
        ];
      else return;
    }
    await store.touchInbound(msg.phoneNumberId, msg.from, now);
    await deliver(
      store,
      sends,
      { from: msg.phoneNumberId, to: msg.from },
      now,
      send,
    );
  } catch (e) {
    console.error("routeIncoming failed", msg.id, e);
  }
}
