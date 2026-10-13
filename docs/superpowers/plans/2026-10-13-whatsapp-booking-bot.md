# WhatsApp Booking Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A multi-doctor WhatsApp bot on the Meta Cloud API. Patients book same-day appointments on each doctor's number; doctors manage their day and send prescriptions from a platform number. No paid template messages are ever sent.

**Architecture:** One Next.js route handler receives every Cloud API webhook, verifies the signature, dedupes by message id, and routes each message to a pure-ish bot handler (`handlePatient` / `handleDoctor`). A handler reads and writes through a `Store` interface (Supabase in production, in-memory in tests) and returns `Send[]`. `deliver()` sends them, dropping any message to a recipient whose 24 h window is closed. Conversation state (`state` + `ctx`) is kept per (number, user) in Postgres.

**Tech Stack:** Next.js 16.2 route handlers + `after()`, TypeScript, Supabase (Postgres + Storage, server-side secret key), `pdf-lib` for PDFs, `vitest` for tests, WhatsApp Cloud API Graph `v25.0`.

**Spec:** `docs/superpowers/specs/2026-10-13-whatsapp-booking-design.md`. All user-facing copy is in the spec; use it verbatim.

## Global Constraints

- Never send a template message. Every outbound message is a free-form `text`, `interactive` (button/list) or `document`.
- A message to anyone other than the current sender is sent only if `conversations.last_inbound_at` for (from-number, recipient) is less than 24 h ago.
- All day boundaries and displayed times are in `Asia/Kolkata` (fixed +05:30, no DST). Display formats: day `Thu, Jul 30`, range `2:30 PM–3:00 PM` (en dash, no leading zero on the hour).
- Statuses are exactly `CONFIRMED | CANCELLED | COMPLETED`. Bookings are created `CONFIRMED`.
- WhatsApp limits: ≤ 3 reply buttons (title ≤ 20 chars), list ≤ 10 rows (title ≤ 24, description ≤ 72), list button label ≤ 20, body ≤ 1024. Truncate text that's too long; throw on too many buttons or rows (that's a programmer error).
- Phone numbers are stored as digits only, with the country code and no `+` (as WhatsApp sends them, e.g. `919876543210`). Display them as `+{digits}`.
- Server-only secrets: `SUPABASE_SECRET_KEY`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`. Never import them into client components.
- Next.js 16: read `node_modules/next/dist/docs/` before touching framework APIs (AGENTS.md).
- Use `corepack pnpm` for package commands (pnpm is not installed globally).

## Review Focus

1. **Meta re-delivers the same webhook** (it retries on slow or failed responses) → the patient must not get duplicate replies or double bookings. Test in Task 9.
2. **Two patients pick the same slot at the same moment** → one is confirmed, the other gets "just taken" and the period list again. Tests in Task 3 (store) and Task 6.
3. **A message arrives between 00:00 and 05:30 IST (still the previous day in UTC)** → "today" must be the IST date. Test in Task 1.
4. **A user taps a stale list row** (a slot from an old list that's now booked or past, an appointment that was already cancelled, or an id belonging to another doctor or patient) → re-validate and re-prompt, never act on it. Tests in Tasks 6 and 8.
5. **An unexpected message type mid-flow** (sticker, audio, location, or an image when text is expected) → re-send the current step's prompt; never crash or silently drop the flow. Test in Task 5.

---

## File Structure

```
supabase/migrations/20261013000000_whatsapp_booking.sql   schema + buckets
vitest.config.ts                                           @ alias for tests
src/lib/time.ts            IST helpers + formatting
src/lib/slots.ts           free-slot calculation, periods, time-range parsing
src/lib/db/types.ts        Doctor, Appointment, Block, Conversation, Store
src/lib/db/supabase-store.ts   Store backed by Supabase (server only)
src/lib/db/memory-store.ts     Store in memory (tests)
src/lib/wa/types.ts        Incoming, Out, Send
src/lib/wa/webhook.ts      verifySignature, parseWebhook
src/lib/wa/client.ts       toGraph, sendMessage, downloadMedia
src/lib/wa/deliver.ts      windowOpen, deliver
src/lib/bot/test-kit.ts    fixtures for bot tests
src/lib/bot/patient.ts     handlePatient
src/lib/bot/doctor.ts      handleDoctor
src/lib/rx/pdf.ts          renderPrescription, rxNo
src/lib/bot/route.ts       routeIncoming (picks the bot, dedupe, touchInbound, deliver)
src/app/api/whatsapp/webhook/route.ts   GET verify + POST receive
```
Delete: `src/app/api/send-whatsapp/route.ts`; remove the `fetch("/api/send-whatsapp"...)` block in `src/context/AppointmentContext.tsx`; remove the `OPENWA_*` lines from `.env.example`.

---

### Task 1: Test tooling + IST time helpers

**Files:**
- Create: `vitest.config.ts`, `src/lib/time.ts`, `src/lib/time.test.ts`
- Modify: `package.json` (add `"test": "vitest run"`; devDependency `vitest`)

**Interfaces:**
- Produces:
  - `istDate(d: Date): string` → `"YYYY-MM-DD"` in IST
  - `atIst(date: string, hm: string): Date` → the instant of `date` at `hm` (`"HH:MM"`) in IST
  - `addDays(date: string, n: number): string`
  - `weekday(date: string): number` → 0 = Sunday
  - `fmtDay(d: Date): string` → `"Thu, Jul 30"`
  - `fmtTime(d: Date): string` → `"2:30 PM"`
  - `fmtRange(start: Date, end: Date): string` → `"2:30 PM–3:00 PM"`

- [ ] **Step 1: Install vitest and add the config**

`corepack pnpm add -D vitest`; `vitest.config.ts` sets `resolve.alias` `@` → `./src` and `test.include: ["src/**/*.test.ts"]`.

- [ ] **Step 2: Write the failing tests** in `src/lib/time.test.ts`

```ts
test("istDate uses IST, not UTC, just after IST midnight", () => {
  expect(istDate(new Date("2026-07-29T19:00:00Z"))).toBe("2026-07-30"); // 00:30 IST
});
test("atIst builds the IST instant", () => {
  expect(atIst("2026-07-30", "14:30").toISOString()).toBe("2026-07-30T09:00:00.000Z");
});
test("formatting", () => {
  const s = atIst("2026-07-30", "14:30"), e = atIst("2026-07-30", "15:00");
  expect(fmtDay(s)).toBe("Thu, Jul 30");
  expect(fmtRange(s, e)).toBe("2:30 PM–3:00 PM");
  expect(fmtTime(atIst("2026-07-30", "10:00"))).toBe("10:00 AM");
});
test("addDays crosses months; weekday", () => {
  expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
  expect(weekday("2026-08-02")).toBe(0);
});
```

- [ ] **Step 3: Run the tests to make sure they fail.** Run `corepack pnpm test`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/lib/time.ts`** with `Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", ... })`; `atIst` = `new Date(\`${date}T${hm}:00+05:30\`)`. Add `// ponytail: fixed +05:30, India has no DST`.

- [ ] **Step 5: Run the tests to make sure they pass.** Run `corepack pnpm test`. Expected: PASS.

- [ ] **Step 6: Commit** — `git add vitest.config.ts package.json pnpm-lock.yaml src/lib/time.ts src/lib/time.test.ts && git commit -m "feat: IST time helpers and vitest"`

---

### Task 2: Slots, periods, time-range parsing

**Files:** Create `src/lib/slots.ts`, `src/lib/slots.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; the `Doctor` fields `dayStart`, `dayEnd`, `slotMinutes`, `morningEnd`, `afternoonEnd`, `workingDays` (declared in Task 3; for now use a local `type Hours = Pick<Doctor, ...>` with the same names).
- Produces:
  - `type Slot = { start: Date; end: Date }`
  - `type Period = "morning" | "afternoon" | "evening"`
  - `freeSlots(h: Hours, date: string, busy: { start: Date; end: Date }[], now: Date): Slot[]` — every slot from dayStart to dayEnd that does **not** overlap anything in `busy` (confirmed appointments + blocks) and starts after `now`. Returns `[]` if `weekday(date)` is not in `workingDays`.
  - `periodOf(h: Hours, s: Slot): Period`
  - `byPeriod(h: Hours, slots: Slot[]): Record<Period, Slot[]>`
  - `periodRange(h: Hours, date: string, p: Period | "whole"): { start: Date; end: Date }`
  - `parseRange(input: string): { start: string; end: string } | null` — `"HH:MM"` 24 h strings; accepts `2pm-5pm`, `2 pm - 5:30pm`, `14:00-17:00`, `9-11am` (the am/pm on the end applies to the start when the start has none); `null` if unparseable or end ≤ start.

- [ ] **Step 1: Write the failing tests**

```ts
const H = { dayStart: "10:00", dayEnd: "22:00", slotMinutes: 30, morningEnd: "14:00", afternoonEnd: "18:00", workingDays: [0,1,2,3,4,5,6] };
const early = new Date("2026-07-30T00:00:00Z");
test("24 slots in a full open day", () => expect(freeSlots(H, "2026-07-30", [], early)).toHaveLength(24));
test("block 13:00-16:30 removes 7 slots", () => {
  const busy = [{ start: atIst("2026-07-30","13:00"), end: atIst("2026-07-30","16:30") }];
  expect(freeSlots(H, "2026-07-30", busy, early)).toHaveLength(17);
});
test("past slots excluded", () => {
  expect(freeSlots(H, "2026-07-30", [], atIst("2026-07-30","21:10"))).toHaveLength(1); // 21:30 only
});
test("non-working day is empty", () => expect(freeSlots({ ...H, workingDays: [1] }, "2026-07-30", [], early)).toEqual([]));
test("periods split 8/8/8", () => {
  const p = byPeriod(H, freeSlots(H, "2026-07-30", [], early));
  expect([p.morning.length, p.afternoon.length, p.evening.length]).toEqual([8, 8, 8]);
});
test.each([
  ["2pm-5pm", { start: "14:00", end: "17:00" }],
  ["14:00-17:00", { start: "14:00", end: "17:00" }],
  ["1 pm - 4:30pm", { start: "13:00", end: "16:30" }],
  ["9-11am", { start: "09:00", end: "11:00" }],
  ["12pm-1pm", { start: "12:00", end: "13:00" }],
])("parseRange %s", (i, o) => expect(parseRange(i)).toEqual(o));
test.each(["5pm-2pm", "lunch", "25:00-26:00", ""])("parseRange rejects %s", (i) => expect(parseRange(i)).toBeNull());
```

- [ ] **Step 2: Run the tests to make sure they fail** (`corepack pnpm test`).
- [ ] **Step 3: Implement `src/lib/slots.ts`** to the signatures above.
- [ ] **Step 4: Run the tests to make sure they pass.**
- [ ] **Step 5: Commit** — `feat: slot calculation and time-range parsing`

---

### Task 3: Schema, types, Store (Supabase + memory)

**Files:**
- Create: `supabase/migrations/20261013000000_whatsapp_booking.sql`, `src/lib/db/types.ts`, `src/lib/db/supabase-store.ts`, `src/lib/db/memory-store.ts`, `src/lib/db/memory-store.test.ts`
- Modify: `.env.example` (add `SUPABASE_SECRET_KEY=`, `WA_ACCESS_TOKEN=`, `WA_APP_SECRET=`, `WA_VERIFY_TOKEN=`, `WA_PLATFORM_PHONE_NUMBER_ID=`, `WA_GRAPH_VERSION=v25.0`; remove `OPENWA_*`)

**Schema** (snake_case columns; the store maps them to camelCase):
- `doctors`: `id uuid pk default gen_random_uuid()`, `name text not null`, `clinic_name text not null`, `business_phone_number_id text unique not null`, `personal_phone text unique not null`, `registration_number text`, `signature_path text`, `working_days smallint[] not null default '{0,1,2,3,4,5,6}'`, `day_start text not null default '10:00'`, `day_end text not null default '22:00'`, `slot_minutes smallint not null default 30`, `morning_end text not null default '14:00'`, `afternoon_end text not null default '18:00'`, `created_at timestamptz not null default now()`.
- `appointments`: `id uuid pk default gen_random_uuid()`, `doctor_id uuid not null references doctors on delete cascade`, `patient_phone text not null`, `patient_name text not null`, `starts_at timestamptz not null`, `ends_at timestamptz not null`, `status text not null default 'CONFIRMED' check (status in ('CONFIRMED','CANCELLED','COMPLETED'))`, `notes text`, `cancel_reason text`, `cancelled_by text check (cancelled_by in ('patient','doctor'))`, `prescription_text text`, `prescription_image_path text`, `prescription_pdf_path text`, `created_at`, `updated_at timestamptz not null default now()`.
  - `create unique index appointments_one_confirmed_per_slot on appointments (doctor_id, starts_at) where status = 'CONFIRMED';`
  - `create index on appointments (doctor_id, patient_phone);`
- `closures (doctor_id uuid references doctors on delete cascade, date date, primary key (doctor_id, date))`
- `blocks (id uuid pk default gen_random_uuid(), doctor_id uuid not null references doctors on delete cascade, starts_at timestamptz not null, ends_at timestamptz not null, check (ends_at > starts_at))`
- `conversations (phone_number_id text, wa_user text, state text not null default 'idle', ctx jsonb not null default '{}', last_inbound_at timestamptz, primary key (phone_number_id, wa_user))`
- `processed_messages (id text primary key, at timestamptz not null default now())`
- `enable row level security` on every table, with **no policies** (only the server's secret key reads and writes).
- Private storage buckets `signatures` and `prescriptions` (`insert into storage.buckets (id, name, public) values (...)`).

**Interfaces** — Produces (`src/lib/db/types.ts`):
```ts
export type Status = "CONFIRMED" | "CANCELLED" | "COMPLETED";
export type Doctor = { id: string; name: string; clinicName: string; businessPhoneNumberId: string; personalPhone: string;
  registrationNumber: string | null; signaturePath: string | null; workingDays: number[]; dayStart: string; dayEnd: string;
  slotMinutes: number; morningEnd: string; afternoonEnd: string };
export type Appointment = { id: string; doctorId: string; patientPhone: string; patientName: string; startsAt: Date; endsAt: Date;
  status: Status; notes: string | null; cancelReason: string | null; cancelledBy: "patient" | "doctor" | null;
  prescriptionText: string | null; prescriptionImagePath: string | null; prescriptionPdfPath: string | null };
export type NewAppointment = Pick<Appointment, "doctorId" | "patientPhone" | "patientName" | "startsAt" | "endsAt" | "notes">;
export type Block = { id: string; doctorId: string; startsAt: Date; endsAt: Date };
export type Conversation = { phoneNumberId: string; waUser: string; state: string; ctx: Record<string, unknown>; lastInboundAt: Date | null };
export type Bucket = "signatures" | "prescriptions";
export interface Store {
  doctorByBusinessNumber(phoneNumberId: string): Promise<Doctor | null>;
  doctorByPersonalPhone(phone: string): Promise<Doctor | null>;
  updateDoctor(id: string, patch: Partial<Pick<Doctor, "registrationNumber" | "signaturePath">>): Promise<void>;
  getConversation(phoneNumberId: string, waUser: string): Promise<Conversation>; // default state "idle", ctx {}, lastInboundAt null
  saveConversation(c: Conversation): Promise<void>;                               // writes state + ctx only
  touchInbound(phoneNumberId: string, waUser: string, at: Date): Promise<void>;
  markProcessed(messageId: string): Promise<boolean>;                             // false if already seen
  appointmentsBetween(doctorId: string, from: Date, to: Date): Promise<Appointment[]>; // by startsAt asc, all statuses
  patientAppointments(doctorId: string, phone: string): Promise<Appointment[]>;    // startsAt desc
  createAppointment(a: NewAppointment): Promise<Appointment | "slot_taken">;
  getAppointment(id: string): Promise<Appointment | null>;
  updateAppointment(id: string, patch: Partial<Omit<Appointment, "id" | "doctorId">>): Promise<void>;
  isClosed(doctorId: string, date: string): Promise<boolean>;
  setClosed(doctorId: string, date: string, closed: boolean): Promise<void>;
  blocksBetween(doctorId: string, from: Date, to: Date): Promise<Block[]>;      // overlapping the range
  addBlock(doctorId: string, startsAt: Date, endsAt: Date): Promise<void>;
  putFile(bucket: Bucket, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getFile(bucket: Bucket, path: string): Promise<Uint8Array>;
  signedUrl(bucket: Bucket, path: string): Promise<string>;                      // valid 1 hour
}
```
- `createSupabaseStore(): Store` in `supabase-store.ts` (uses `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY)` from `@supabase/supabase-js`, with `import "server-only"` if that package is present, otherwise a comment). `createAppointment` maps a Postgres unique violation (`code === "23505"`) to `"slot_taken"`.
- `createMemoryStore(seed?: { doctors?: Doctor[] }): Store & { appointments: Appointment[]; files: Map<string, Uint8Array> }` in `memory-store.ts`, mirroring the same rules (unique CONFIRMED slot, markProcessed). `signedUrl` returns `mem://{bucket}/{path}`.

- [ ] **Step 1: Write the failing test** `memory-store.test.ts`

```ts
test("second CONFIRMED booking on the same slot is slot_taken; a cancelled one frees it", async () => {
  const s = createMemoryStore({ doctors: [doc] });
  const a = await s.createAppointment(newApt);
  expect(await s.createAppointment({ ...newApt, patientPhone: "910000000002" })).toBe("slot_taken");
  await s.updateAppointment((a as Appointment).id, { status: "CANCELLED" });
  expect(await s.createAppointment({ ...newApt, patientPhone: "910000000002" })).not.toBe("slot_taken");
});
test("markProcessed is true once, then false", async () => {
  const s = createMemoryStore();
  expect(await s.markProcessed("wamid.1")).toBe(true);
  expect(await s.markProcessed("wamid.1")).toBe(false);
});
```
- [ ] **Step 2: Run the tests to make sure they fail.**
- [ ] **Step 3: Write the types, the memory store and the migration.**
- [ ] **Step 4: Run the tests to make sure they pass.**
- [ ] **Step 5: Implement `supabase-store.ts`.** Run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 6: Apply the migration.** Ask the user which Supabase project to use, then apply it with the Supabase MCP `apply_migration` (or `supabase db push`). Verify with `list_tables` that the 6 tables exist with RLS enabled and run `get_advisors` (security): it should report no missing-RLS findings for these tables.
- [ ] **Step 7: Commit** — `feat: booking schema and Store`

---

### Task 4: WhatsApp I/O — types, webhook parsing, signature, Graph client, deliver

**Files:** Create `src/lib/wa/types.ts`, `webhook.ts`, `client.ts`, `deliver.ts` and `webhook.test.ts`, `client.test.ts`, `deliver.test.ts`

**Interfaces** — Produces:
```ts
// types.ts
export type Incoming = { id: string; phoneNumberId: string; from: string;
  type: "text" | "reply" | "image" | "other"; text?: string; replyId?: string; mediaId?: string; caption?: string };
export type Out =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | { kind: "list"; body: string; button: string; rows: { id: string; title: string; description?: string }[] }
  | { kind: "document"; link: string; filename: string; caption: string };
export type Send = { from: string; to: string; msg: Out }; // from = phone_number_id
```
- `verifySignature(rawBody: string, header: string | null, appSecret: string): boolean` — `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256 hex; compare with `crypto.timingSafeEqual`; false on a missing or bad header.
- `parseWebhook(body: unknown): Incoming[]` — reads `entry[].changes[].value.messages[]` with `value.metadata.phone_number_id`; `text.body` → text; `interactive.button_reply.id` / `interactive.list_reply.id` → reply; `image.id` + `image.caption` → image; anything else → `other`. It ignores `statuses` and any non-`messages` field (for example `smb_message_echoes`).
- `toGraph(to: string, msg: Out): Record<string, unknown>` — the Cloud API `/messages` JSON, enforcing the limits in Global Constraints.
- `sendMessage(s: Send): Promise<void>` — POST `https://graph.facebook.com/${WA_GRAPH_VERSION}/${s.from}/messages` with `Bearer WA_ACCESS_TOKEN`; logs non-2xx and does not throw.
- `downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }>` — GET `/{mediaId}` → `url`, then GET `url` with the same bearer.
- `windowOpen(store: Store, from: string, to: string, now: Date): Promise<boolean>` — true when `lastInboundAt` is within 24 h.
- `deliver(store: Store, sends: Send[], sender: { from: string; to: string }, now: Date, send = sendMessage): Promise<void>` — sends in order; a Send to someone other than `sender` goes out only if `windowOpen`.

- [ ] **Step 1: Write the failing tests**

```ts
// webhook.test.ts
test("verifySignature accepts the right HMAC and rejects others", () => {
  const sig = "sha256=" + createHmac("sha256", "s").update("{}").digest("hex");
  expect(verifySignature("{}", sig, "s")).toBe(true);
  expect(verifySignature("{}", sig, "x")).toBe(false);
  expect(verifySignature("{}", null, "s")).toBe(false);
});
test("parseWebhook handles text, list reply, image, sticker; ignores statuses", () => {
  const msgs = parseWebhook(fixture /* one change with 4 messages + one statuses change */);
  expect(msgs.map((m) => m.type)).toEqual(["text", "reply", "image", "other"]);
  expect(msgs[1].replyId).toBe("book");
  expect(msgs[0].phoneNumberId).toBe("PNID");
});
// client.test.ts
test("toGraph list truncates titles and rejects 11 rows", () => {
  const g = toGraph("91", { kind: "list", body: "b", button: "Choose an option", rows: [{ id: "a", title: "x".repeat(30) }] }) as any;
  expect(g.interactive.action.sections[0].rows[0].title).toHaveLength(24);
  expect(() => toGraph("91", { kind: "list", body: "b", button: "c", rows: Array.from({ length: 11 }, (_, i) => ({ id: `${i}`, title: "t" })) })).toThrow();
});
test("toGraph rejects 4 buttons", () => { /* expect toThrow */ });
// deliver.test.ts
test("message to a third party with a closed window is skipped; sender always gets replies", async () => {
  const sent: Send[] = []; const s = createMemoryStore();
  await s.touchInbound("PN", "doc", new Date("2026-07-28T00:00:00Z")); // > 24 h ago
  await deliver(s, [{ from: "PN", to: "pat", msg: t }, { from: "PN", to: "doc", msg: t }],
    { from: "PN", to: "pat" }, new Date("2026-07-30T00:00:00Z"), async (x) => { sent.push(x); });
  expect(sent.map((x) => x.to)).toEqual(["pat"]);
});
```
- [ ] **Step 2: Run the tests to make sure they fail.**
- [ ] **Step 3: Implement the four files.**
- [ ] **Step 4: Run the tests to make sure they pass.**
- [ ] **Step 5: Commit** — `feat: WhatsApp Cloud API I/O`

---

### Task 5: Patient bot — menu, keywords, Normal chat, My Appointments

**Files:** Create `src/lib/bot/test-kit.ts`, `src/lib/bot/patient.ts`, `src/lib/bot/patient.test.ts`

**Interfaces:**
- Consumes: `Store`, `Doctor`, `Incoming`, `Send`, `Out`; time + slots helpers.
- Produces:
  - `type BotCtx = { store: Store; doctor: Doctor; msg: Incoming; now: Date; media?: (id: string) => Promise<{ bytes: Uint8Array; mime: string }> }`
  - `handlePatient(c: BotCtx): Promise<Send[]>` — loads the conversation `(doctor.businessPhoneNumberId, msg.from)`, saves its new state, and returns sends (replies use `from = doctor.businessPhoneNumberId`, `to = msg.from`; the doctor alert uses `from = WA_PLATFORM_PHONE_NUMBER_ID`, `to = doctor.personalPhone`. Read the env var through a `platformId()` helper in `test-kit`-friendly form: `process.env.WA_PLATFORM_PHONE_NUMBER_ID ?? "PLATFORM"`).
  - Patient states: `idle | chat | book_name | book_period | book_time | book_reason | cancel_pick | cancel_reason`. ctx keys: `name`, `period`, `page`, `startsAt` (ISO), `appointmentId`.
  - `test-kit.ts`: `DOC: Doctor` (PNID `"DOCPN"`, personal phone `"919000000001"`), `NOW = atIst("2026-07-30","09:00")`, `text(from, body): Incoming`, `reply(from, id): Incoming`, `image(from, mediaId, caption?): Incoming`, `sticker(from): Incoming`, `bodies(sends: Send[]): string[]` (the body, or the caption for documents).
- Unknown input rule (shared by both bots): in a non-idle state, input the step can't use → re-send that step's prompt. In `idle`, anything → menu.

- [ ] **Step 1: Write the failing tests**

```ts
test("first hi shows only Book and Normal chat", async () => {
  const s = createMemoryStore({ doctors: [DOC] });
  const [m] = await handlePatient({ store: s, doctor: DOC, msg: text("911", "hi"), now: NOW });
  expect(m.msg.kind).toBe("list");
  expect((m.msg as any).rows.map((r: any) => r.id)).toEqual(["book", "chat"]);
});
test("menu shows mine + cancel when the patient has a confirmed appointment today", /* ids book, mine, cancel, chat */);
test("Normal chat goes silent; a keyword wakes it", async () => {
  // reply chat → 1 send with the spec chat copy; then text "how are you" → []; then "/book" → the name prompt
});
test("chat mode shows the menu again after a 24h gap", /* touchInbound 25h before NOW, text "hello" → menu */);
test("My Appointments lists today", /* "📅 2:30 PM–3:00 PM — Raj (CONFIRMED)" */);
test("sticker mid-flow re-sends the current prompt", async () => {
  // reply book → name prompt; sticker → the same name prompt again
});
```
- [ ] **Step 2: Run the tests to make sure they fail.**
- [ ] **Step 3: Implement `handlePatient`** for the menu, keywords, chat and mine. Leave the booking/cancel/rx branches to call functions you'll fill in during Task 6 (stub `book_*` to return the name prompt so the tests pass).
- [ ] **Step 4: Run the tests to make sure they pass.**
- [ ] **Step 5: Commit** — `feat: patient bot menu and chat mode`

---

### Task 6: Patient bot — Book, Cancel, My Prescriptions

**Files:** Modify `src/lib/bot/patient.ts`, `src/lib/bot/patient.test.ts`

**Interfaces:** Consumes `freeSlots`, `byPeriod`, `store.createAppointment`, `store.isClosed`, `store.blocksBetween`, `store.signedUrl`. Busy intervals = CONFIRMED appointments today + blocks today. Reply ids: periods `p:morning|p:afternoon|p:evening`, slot rows `t:{startISO}`, `more`, `skip`, `yesname`, cancel rows `c:{id}`, prescription rows `rx:{id}`.

- [ ] **Step 1: Write the failing tests**

```ts
test("full booking: name → period → time → skip → confirmed + doctor alert when the window is open", async () => {
  // touchInbound("PLATFORM", DOC.personalPhone, NOW) so the doctor's window is open
  // ... last call's sends: the patient body equals the spec confirmation with "📅 Thu, Jul 30, 2:30 PM–3:00 PM";
  // a second send to DOC.personalPhone starts with "New appointment booked ✅"
  // s.appointments[0].status === "CONFIRMED"
});
test("closed today → the closed message, no name prompt", /* setClosed(DOC.id, "2026-07-30", true) */);
test("returning patient gets a 'Yes, Raj' button and reply yesname uses it", /* ... */);
test("period buttons hide empty periods and show counts", /* block 10:00-14:00 → buttons ["Afternoon (8)", "Evening (8)"] */);
test("more than 10 free slots in a period → 9 rows + Later times; more → the next page", /* slotMinutes 15: morning has 16 */);
test("stale slot tap: slot booked by someone else meanwhile → 'just taken' + period buttons again", /* ... */);
test("stale slot tap: a slot id that's now in the past → the period buttons again, no booking", /* ... */);
test("cancel: pick → reason → cancelled; status CANCELLED, cancelledBy patient; alert to the doctor", /* ... */);
test("cancel with an id from another patient's appointment is ignored and the list re-shown", /* ... */);
test("My Prescriptions sends the document with the signed link", /* appointment with prescriptionPdfPath → reply rx:{id} → kind document, link mem://prescriptions/... */);
```
- [ ] **Step 2: Run the tests to make sure they fail.**
- [ ] **Step 3: Implement it.** Re-check before creating: the tapped `t:{iso}` must still be in `freeSlots(...)` at `now`; otherwise re-show the periods.
- [ ] **Step 4: Run the tests to make sure they pass.**
- [ ] **Step 5: Commit** — `feat: patient booking, cancel, prescriptions`

---

### Task 7: Doctor bot — setup, menu, Today, Open/Close today, Cancel appointment

**Files:** Create `src/lib/bot/doctor.ts`, `src/lib/bot/doctor.test.ts`

**Interfaces:**
- Produces `handleDoctor(c: BotCtx): Promise<Send[]>` — conversation key `(platformId(), doctor.personalPhone)`; replies `from = platformId()`, patient notices `from = doctor.businessPhoneNumberId`.
- Doctor states: `idle | setup_reg | setup_sig | rx_input | close_confirm | block_date | block_range | block_custom | block_confirm | dcancel_pick | dcancel_reason`. Reply ids: menu `today|close|open|block|dcancel|setup`, `done:{id}`, `dc:{id}`, `cn` (Cancel & notify), `keep` (Keep bookings), `skip`.
- Signature: `media(mediaId)` → `store.putFile("signatures", \`${doctor.id}.${ext}\`, ...)` → `updateDoctor({ signaturePath })`.
- Produces for Task 8: `cancelAndNotify(c: BotCtx, appts: Appointment[], reason: string | null): Promise<Send[]>` — sets CANCELLED/doctor and returns a patient notice per appointment whose window is open.

- [ ] **Step 1: Write the failing tests**

```ts
test("setup is forced: hi → setup prompt; reg no; text instead of photo repeats; photo saves; then the menu", /* media stub returns jpeg bytes */);
test("menu shows 'Close today' when open and 'Open today' when closed", /* ... */);
test("Today lists appointments and offers Mark complete for CONFIRMED only", /* ... */);
test("close with no bookings closes immediately", /* isClosed true */);
test("close with 2 bookings → warning; cn cancels both and notifies the patients whose window is open", /* one patient window open, one 25h old → 1 notice */);
test("close with bookings → keep: closed, appointments stay CONFIRMED", /* ... */);
test("doctor cancel: dc:{id} → reason → cancelled + notice; dc: id of another doctor's appointment is ignored", /* ... */);
```
- [ ] **Step 2: Run the tests to make sure they fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the tests to make sure they pass.**
- [ ] **Step 5: Commit** — `feat: doctor bot setup, today, open/close, cancel`

---

### Task 8: Doctor bot — Block my time

**Files:** Modify `src/lib/bot/doctor.ts`, `src/lib/bot/doctor.test.ts`

**Interfaces:** Consumes `periodRange`, `parseRange`, `cancelAndNotify`. Date rows `d:{YYYY-MM-DD}` for today + the next 6 days; range rows `r:whole|r:morning|r:afternoon|r:custom`. `Morning` = periodRange `morning`; `Afternoon` = `afternoon`; `Whole day` = `setClosed(date, true)` (not a block). ctx keys: `date`, `start`, `end`.

- [ ] **Step 1: Write the failing tests**

```ts
test("block custom 1pm-4:30pm on a future date → 'Blocked Fri, Jul 31 — 1:00 PM–4:30 PM.'", /* blocksBetween has 1 block */);
test("invalid custom range re-prompts with the 'Couldn't read that' copy", /* ... */);
test("whole day → closure for that date", /* ... */);
test("block clashing with today's booking → warning; cn cancels + notifies; keep leaves it", /* ... */);
```
- [ ] **Step 2–4:** Run them to see them fail → implement → run them to see them pass.
- [ ] **Step 5: Commit** — `feat: doctor block my time`

---

### Task 9: Prescription PDF + Mark complete, routing, webhook route, cleanup

**Files:**
- Create: `src/lib/rx/pdf.ts`, `src/lib/rx/pdf.test.ts`, `src/lib/bot/route.ts`, `src/lib/bot/route.test.ts`, `src/app/api/whatsapp/webhook/route.ts`
- Modify: `src/lib/bot/doctor.ts` (+ tests), `src/context/AppointmentContext.tsx` (remove the send-whatsapp fetch), `package.json` (add `pdf-lib`)
- Delete: `src/app/api/send-whatsapp/route.ts`

**Interfaces:**
- `rxNo(appointmentId: string): string` → `"RX-5B039563"` for `5b039563-b504-...`
- `renderPrescription(i: { clinic: string; doctorName: string; regNo: string; rxNo: string; patientName: string; patientPhone: string; visit: string; lines: string[]; photo?: { bytes: Uint8Array; mime: string }; signature: { bytes: Uint8Array; mime: string } }): Promise<Uint8Array>` — pdf-lib, A4, Helvetica; the layout follows the spec. Wrap long lines with `font.widthOfTextAtSize`; add a page when the text reaches the signature area (the signature goes on the last page). JPEG → `embedJpg`, PNG → `embedPng`.
- Mark complete in `doctor.ts`: `done:{id}` (must be this doctor's CONFIRMED appointment) → state `rx_input` → text/image/skip → PDF to `prescriptions/{id}.pdf` → `updateAppointment({ status: "COMPLETED", prescriptionText, prescriptionImagePath, prescriptionPdfPath })` → a document send `from = doctor.businessPhoneNumberId` if `windowOpen`, with the spec's reply copy.
- `routeIncoming(store: Store, msg: Incoming, now: Date, send = sendMessage, media = downloadMedia): Promise<void>` — `markProcessed(msg.id)` (return if false) → pick the bot per the spec's Routing → handler (with `media` in `BotCtx`) → `touchInbound(msg.phoneNumberId, msg.from, now)` → `deliver(...)`. Errors are caught and logged per message.
- `route.ts` (Next): `GET` returns `hub.challenge` when `hub.mode === "subscribe"` and `hub.verify_token === WA_VERIFY_TOKEN`, else 403. `POST` reads `await req.text()`, verifies the signature (401 on failure), parses, then `after(() => Promise.all(msgs.map((m) => routeIncoming(createSupabaseStore(), m, new Date()))))` and returns 200 immediately. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `04-functions/after.md` first.

- [ ] **Step 1: Write the failing tests**

```ts
// pdf.test.ts
test("rxNo", () => expect(rxNo("5b039563-b504-41de-95a4-3508c01ba783")).toBe("RX-5B039563"));
test("renders a PDF; 80 lines spill onto a second page", async () => {
  const bytes = await renderPrescription({ ...base, lines: Array.from({ length: 80 }, (_, i) => `Med ${i}`) });
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
});
// doctor.test.ts additions
test("mark complete with text → COMPLETED, PDF stored, document sent, 'Saved and sent to the patient.'", /* ... */);
test("mark complete when the patient's window is closed → stored, no document, the window-closed copy", /* ... */);
test("mark complete with skip → COMPLETED, no PDF, 'Marked complete.'", /* ... */);
// route.test.ts
test("the same message id twice → handled once", async () => {
  const sent: Send[] = []; const s = createMemoryStore({ doctors: [DOC] });
  await routeIncoming(s, text("911", "hi"), NOW, async (x) => { sent.push(x); });
  await routeIncoming(s, text("911", "hi"), NOW, async (x) => { sent.push(x); }); // same id
  expect(sent).toHaveLength(1);
});
test("doctor's personal phone on the platform number → doctor bot; other sender on the platform when it's also DOC's business number → patient bot", /* ... */);
test("unknown sender on the platform number with no doctor using it → 'registered doctors only'", /* ... */);
```
`text()` in the test-kit must give a stable id per call site (accept an optional `id` argument; default `"wamid.test"`).

- [ ] **Step 2: Run the tests to make sure they fail.**
- [ ] **Step 3: Implement `pdf.ts`, mark complete, `route.ts` (lib) and the webhook route; delete the OpenWA route and its call.**
- [ ] **Step 4: Run all checks:** `corepack pnpm test && npx tsc --noEmit && corepack pnpm lint`. Expected: all pass.
- [ ] **Step 5: Commit** — `feat: prescriptions, webhook routing; remove OpenWA`

---

### Task 10: Live pilot on the Meta test number (manual verification)

Needs the user. No code unless a bug is found (fix it with a failing test first).

- [ ] **Step 1:** The user creates a Meta app with the WhatsApp use case and gets the test number's Phone Number ID, a temporary/system-user access token, and the App Secret. Put them in `.env.local` (`WA_PLATFORM_PHONE_NUMBER_ID` = the test number's id).
- [ ] **Step 2:** Insert one doctor row: `business_phone_number_id` = the same test id, `personal_phone` = the user's phone digits; add a second phone (the patient) as a test recipient in the Meta dashboard.
- [ ] **Step 3:** Expose the dev server (`preview_start` "dev" plus a tunnel the user chooses, e.g. `cloudflared tunnel --url http://localhost:3000`) and set the webhook URL `…/api/whatsapp/webhook` with `WA_VERIFY_TOKEN`; subscribe to the `messages` field.
- [ ] **Step 4:** Walk through the spec end to end: doctor setup → patient hi → book → doctor alert → doctor Today → mark complete with text → the patient receives the PDF → patient My Prescriptions → doctor Close today with Cancel & notify. Check the rows in Supabase after each step.
- [ ] **Step 5:** Commit any fixes; report the results with screenshots to the user.
