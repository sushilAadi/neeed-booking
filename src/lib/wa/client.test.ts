import { expect, test } from "vitest";
import { toGraph } from "./client";

type G = {
  text: { body: string };
  interactive: {
    action: {
      button: string;
      sections: { rows: { title: string }[] }[];
      buttons: { reply: { title: string } }[];
    };
  };
};

test("toGraph list truncates titles and rejects 11 rows", () => {
  const g = toGraph("91", {
    kind: "list",
    body: "b",
    button: "Choose an option",
    rows: [{ id: "a", title: "x".repeat(30) }],
  }) as unknown as G;
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
  const g = toGraph("91", {
    kind: "buttons",
    body: "b",
    buttons: [{ id: "y", title: "Yes, ".padEnd(30, "z") }],
  }) as unknown as G;
  expect(g.interactive.action.buttons[0].reply.title).toHaveLength(20);
});
test("toGraph text and document", () => {
  expect(toGraph("91", { kind: "text", body: "x".repeat(5000) })).toMatchObject(
    { messaging_product: "whatsapp", to: "91", type: "text" },
  );
  expect(
    (toGraph("91", { kind: "text", body: "x".repeat(5000) }) as unknown as G)
      .text.body,
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

test("toGraph link button (cta_url)", () => {
  expect(
    toGraph("91", {
      kind: "link",
      body: "Write it here",
      button: "Write prescription",
      url: "https://x.test/rx/abc",
    }),
  ).toEqual({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "91",
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: "Write it here" },
      action: {
        name: "cta_url",
        parameters: {
          display_text: "Write prescription",
          url: "https://x.test/rx/abc",
        },
      },
    },
  });
});

test("toGraph puts a buttons message's image in the header", () => {
  expect(
    toGraph("91", {
      kind: "buttons",
      body: "b",
      image: "https://x.test/a.png",
      buttons: [{ id: "y", title: "Yes" }],
    }).interactive,
  ).toMatchObject({
    type: "button",
    header: { type: "image", image: { link: "https://x.test/a.png" } },
  });
});
