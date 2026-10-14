import type { Out, Send } from "./types";

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const graph = () =>
  `https://graph.facebook.com/${process.env.WA_GRAPH_VERSION ?? "v25.0"}`;
const auth = () => ({ Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` });

export function toGraph(to: string, msg: Out): Record<string, unknown> {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
  };
  switch (msg.kind) {
    case "text":
      return {
        ...base,
        type: "text",
        text: { body: cut(msg.body, 4096), preview_url: false },
      };
    case "document":
      return {
        ...base,
        type: "document",
        document: {
          link: msg.link,
          filename: msg.filename,
          caption: cut(msg.caption, 1024),
        },
      };
    case "link":
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "cta_url",
          body: { text: cut(msg.body, 1024) },
          action: {
            name: "cta_url",
            parameters: { display_text: cut(msg.button, 20), url: msg.url },
          },
        },
      };
    case "buttons":
      if (msg.buttons.length < 1 || msg.buttons.length > 3)
        throw new Error(`buttons: ${msg.buttons.length}`);
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          ...(msg.image
            ? { header: { type: "image", image: { link: msg.image } } }
            : {}),
          body: { text: cut(msg.body, 1024) },
          action: {
            buttons: msg.buttons.map((b) => ({
              type: "reply",
              reply: { id: b.id, title: cut(b.title, 20) },
            })),
          },
        },
      };
    case "list":
      if (msg.rows.length < 1 || msg.rows.length > 10)
        throw new Error(`list rows: ${msg.rows.length}`);
      return {
        ...base,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: cut(msg.body, 1024) },
          action: {
            button: cut(msg.button, 20),
            sections: [
              {
                rows: msg.rows.map((r) => ({
                  id: r.id,
                  title: cut(r.title, 24),
                  ...(r.description
                    ? { description: cut(r.description, 72) }
                    : {}),
                })),
              },
            ],
          },
        },
      };
  }
}

export async function sendMessage(s: Send): Promise<void> {
  try {
    const res = await fetch(`${graph()}/${s.from}/messages`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(toGraph(s.to, s.msg)),
    });
    if (!res.ok) console.error("wa send failed", res.status, await res.text());
  } catch (e) {
    console.error("wa send error", e);
  }
}

export async function downloadMedia(
  mediaId: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const meta = await fetch(`${graph()}/${mediaId}`, { headers: auth() });
  if (!meta.ok) throw new Error(`media meta ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as {
    url: string;
    mime_type: string;
  };
  const file = await fetch(url, { headers: auth() });
  if (!file.ok) throw new Error(`media download ${file.status}`);
  return { bytes: new Uint8Array(await file.arrayBuffer()), mime: mime_type };
}
