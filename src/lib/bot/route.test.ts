import { expect, test } from "vitest";
import { createMemoryStore } from "../db/memory-store";
import type { Send } from "../wa/types";
import { routeIncoming } from "./route";
import { bodies, DOC, NOW, reply, text } from "./test-kit";

const collect = () => {
  const sent: Send[] = [];
  return {
    sent,
    send: async (x: Send) => {
      sent.push(x);
    },
  };
};
const noMedia = async () => ({ bytes: new Uint8Array(), mime: "image/jpeg" });

test("the same message id twice → handled once", async () => {
  const { sent, send } = collect();
  const s = createMemoryStore({ doctors: [DOC] });
  await routeIncoming(s, text("911", "hi"), NOW, send, noMedia);
  await routeIncoming(s, text("911", "hi"), NOW, send, noMedia); // same id
  expect(sent).toHaveLength(1);
});

test("doctor's personal phone on the platform number → doctor bot; other sender on the platform when it's also DOC's business number → patient bot", async () => {
  const shared = { ...DOC, businessPhoneNumberId: "PLATFORM" };
  const s = createMemoryStore({ doctors: [shared] });
  const a = collect();
  await routeIncoming(
    s,
    text(DOC.personalPhone, "hi", "m1", "PLATFORM"),
    NOW,
    a.send,
    noMedia,
  );
  expect(bodies(a.sent)).toEqual(["Hi Dr. Mehta. What would you like to do?"]);
  const b = collect();
  await routeIncoming(
    s,
    text("919555", "hi", "m2", "PLATFORM"),
    NOW,
    b.send,
    noMedia,
  );
  // the patient bot: its first question is the language
  expect(bodies(b.sent)).toEqual([
    "🙏 Sunrise Family Clinic\n\nChoose your language\nभाषा चुनें\nভাষা বাছক",
  ]);
});

test("unknown sender on the platform number with no doctor using it → 'registered doctors only'", async () => {
  const { sent, send } = collect();
  const s = createMemoryStore({ doctors: [DOC] });
  await routeIncoming(
    s,
    text("919555", "hi", "m3", "PLATFORM"),
    NOW,
    send,
    noMedia,
  );
  expect(bodies(sent)).toEqual(["This number is for registered doctors only."]);
  expect(sent[0]).toMatchObject({ from: "PLATFORM", to: "919555" });
});

test("a message on an unknown number is ignored", async () => {
  const { sent, send } = collect();
  await routeIncoming(
    createMemoryStore({ doctors: [DOC] }),
    text("919555", "hi", "m4", "NOPE"),
    NOW,
    send,
    noMedia,
  );
  expect(sent).toEqual([]);
});

test("records the inbound time so the window opens", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  await routeIncoming(s, text("911", "hi", "m5"), NOW, async () => {}, noMedia);
  expect((await s.getConversation("DOCPN", "911")).lastInboundAt).toEqual(NOW);
});

test("a handler error is caught and logged", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  s.patientAppointments = async () => {
    throw new Error("db down");
  };
  await expect(
    routeIncoming(s, text("911", "hi", "m6"), NOW, async () => {}, noMedia),
  ).resolves.toBeUndefined();
});
test("a handler error tells the sender to try again", async () => {
  const { sent, send } = collect();
  const s = createMemoryStore({ doctors: [DOC] });
  s.patientAppointments = async () => {
    throw new Error("db down");
  };
  await routeIncoming(s, text("911", "hi", "m7"), NOW, send, noMedia);
  // picking the language loads the menu, which hits the failing lookup
  await routeIncoming(s, reply("911", "lang:en", "m8"), NOW, send, noMedia);
  expect(bodies(sent).at(-1)).toBe(
    "Sorry, something went wrong — please try again.",
  );
  expect(sent.at(-1)).toMatchObject({ from: "DOCPN", to: "911" });
});
