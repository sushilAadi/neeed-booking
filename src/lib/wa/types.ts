export type Incoming = {
  id: string;
  phoneNumberId: string;
  from: string;
  type: "text" | "reply" | "image" | "other";
  text?: string;
  replyId?: string;
  mediaId?: string;
  caption?: string;
};
export type Out =
  | { kind: "text"; body: string }
  | {
      kind: "buttons";
      body: string;
      buttons: { id: string; title: string }[];
      /** Public PNG/JPG URL shown above the body. */
      image?: string;
    }
  | {
      kind: "list";
      body: string;
      button: string;
      rows: { id: string; title: string; description?: string }[];
    }
  | { kind: "document"; link: string; filename: string; caption: string }
  /** A message with one button that opens a web page. */
  | { kind: "link"; body: string; button: string; url: string };
export type Send = { from: string; to: string; msg: Out }; // from = phone_number_id
