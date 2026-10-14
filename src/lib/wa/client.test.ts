import { expect, test } from "vitest";
import { toGraph } from "./client";

test("toGraph list truncates titles and rejects 11 rows", () => {
  // biome-ignore lint/suspicious/noExplicitAny: graph JSON
  const g = toGraph("91", {
    kind: "list",
    body: "b",
    button: "Choose an option",
    rows: [{ id: "a", title: "x".repeat(30) }],
  }) as any;
  expect(g.interactive.action.sections[0].rows[0].title).toHaveLength(24);
  expect(g.interactive.action.button).toBe("Choose an option");
  expect(() =>
    toGraph("91", {
      kind: "list",
      body: "b",
      button: "c",
      rows: Array.from({ length: 11 }, (_, i) => ({ id: `${i}`, title: "t" })),
    }),
  ).toThrow();
});
test("toGraph rejects 4 buttons and truncates button titles to 20", () => {
  const four = Array.from({ length: 4 }, (_, i) => ({
    id: `${i}`,
    title: "t",
  }));
  expect(() =>
    toGraph("91", { kind: "buttons", body: "b", buttons: four }),
  ).toThrow();
  // biome-ignore lint/suspicious/noExplicitAny: graph JSON
  const g = toGraph("91", {
    kind: "buttons",
    body: "b",
    buttons: [{ id: "y", title: "Yes, ".padEnd(30, "z") }],
  }) as any;
  expect(g.interactive.action.buttons[0].reply.title).toHaveLength(20);
});
test("toGraph text and document", () => {
  expect(toGraph("91", { kind: "text", body: "x".repeat(5000) })).toMatchObject(
    { messaging_product: "whatsapp", to: "91", type: "text" },
  );
  // biome-ignore lint/suspicious/noExplicitAny: graph JSON
  expect(
    (toGraph("91", { kind: "text", body: "x".repeat(5000) }) as any).text.body,
  ).toHaveLength(4096);
  expect(
    toGraph("91", {
      kind: "document",
      link: "L",
      filename: "f.pdf",
      caption: "c",
    }),
  ).toMatchObject({
    type: "document",
    document: { link: "L", filename: "f.pdf", caption: "c" },
  });
});
