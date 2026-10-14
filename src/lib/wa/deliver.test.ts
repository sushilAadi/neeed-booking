import { expect, test } from "vitest";
import { createMemoryStore } from "../db/memory-store";
import { deliver } from "./deliver";
import type { Out, Send } from "./types";

const t: Out = { kind: "text", body: "x" };

test("message to a third party with a closed window is skipped; sender always gets replies", async () => {
  const sent: Send[] = [];
  const s = createMemoryStore();
  await s.touchInbound("PN", "doc", new Date("2026-07-28T00:00:00Z")); // > 24 h ago
  await deliver(
    s,
    [
      { from: "PN", to: "pat", msg: t },
      { from: "PN", to: "doc", msg: t },
    ],
    { from: "PN", to: "pat" },
    new Date("2026-07-30T00:00:00Z"),
    async (x) => {
      sent.push(x);
    },
  );
  expect(sent.map((x) => x.to)).toEqual(["pat"]);
});
test("third party inside the window gets it", async () => {
  const sent: Send[] = [];
  const s = createMemoryStore();
  await s.touchInbound("PN", "doc", new Date("2026-07-29T01:00:00Z"));
  await deliver(
    s,
    [{ from: "PN", to: "doc", msg: t }],
    { from: "X", to: "pat" },
    new Date("2026-07-30T00:00:00Z"),
    async (x) => {
      sent.push(x);
    },
  );
  expect(sent).toHaveLength(1);
});
