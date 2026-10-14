import { createHmac } from "node:crypto";
import { expect, test } from "vitest";
import { parseWebhook, verifySignature } from "./webhook";

test("verifySignature accepts the right HMAC and rejects others", () => {
  const sig = `sha256=${createHmac("sha256", "s").update("{}").digest("hex")}`;
  expect(verifySignature("{}", sig, "s")).toBe(true);
  expect(verifySignature("{}", sig, "x")).toBe(false);
  expect(verifySignature("{}", null, "s")).toBe(false);
  expect(verifySignature("{}", "sha256=zz", "s")).toBe(false);
});

const fixture = {
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "PNID" },
            messages: [
              { id: "m1", from: "911", type: "text", text: { body: "hi" } },
              {
                id: "m2",
                from: "911",
                type: "interactive",
                interactive: {
                  type: "list_reply",
                  list_reply: { id: "book", title: "Book" },
                },
              },
              {
                id: "m3",
                from: "911",
                type: "image",
                image: { id: "MEDIA", caption: "rx" },
              },
              { id: "m4", from: "911", type: "sticker", sticker: { id: "S" } },
            ],
          },
        },
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "PNID" },
            statuses: [{ id: "x", status: "read" }],
          },
        },
        {
          field: "smb_message_echoes",
          value: {
            metadata: { phone_number_id: "PNID" },
            message_echoes: [{ id: "e" }],
          },
        },
      ],
    },
  ],
};

test("parseWebhook handles text, list reply, image, sticker; ignores statuses", () => {
  const msgs = parseWebhook(fixture);
  expect(msgs.map((m) => m.type)).toEqual(["text", "reply", "image", "other"]);
  expect(msgs[1].replyId).toBe("book");
  expect(msgs[0].phoneNumberId).toBe("PNID");
  expect(msgs[0].text).toBe("hi");
  expect(msgs[2]).toMatchObject({ mediaId: "MEDIA", caption: "rx" });
});
test("parseWebhook tolerates garbage", () => {
  expect(parseWebhook(null)).toEqual([]);
  expect(parseWebhook({ entry: "x" })).toEqual([]);
});
test("button reply is a reply", () => {
  const b = {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "P" },
              messages: [
                {
                  id: "b",
                  from: "1",
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: { id: "skip", title: "Skip" },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  expect(parseWebhook(b)[0]).toMatchObject({ type: "reply", replyId: "skip" });
});
test("verifySignature rejects everything when the app secret is empty", () => {
  const sig = `sha256=${createHmac("sha256", "").update("{}").digest("hex")}`;
  expect(verifySignature("{}", sig, "")).toBe(false);
});
