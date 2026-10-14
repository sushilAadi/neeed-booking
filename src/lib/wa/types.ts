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
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | {
      kind: "list";
      body: string;
      button: string;
      rows: { id: string; title: string; description?: string }[];
    }
  | { kind: "document"; link: string; filename: string; caption: string };
export type Send = { from: string; to: string; msg: Out }; // from = phone_number_id
