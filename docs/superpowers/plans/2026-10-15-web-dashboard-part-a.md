# Web Dashboard — Part A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A premium, mobile-first web dashboard for the doctor and their receptionists (per-person random keys, activity log, Today / Add patient / Reports / Settings, fee per visit), plus name+age / gender / area in WhatsApp booking.

**Architecture:** Same Next.js app as the bot. All data access stays server-side through the existing `Store` (memory store in tests, Supabase in prod). Web actions are Server Actions that call shared, tested "clinic" services in `src/lib/clinic/*`; the bot is refactored to use the same services where both do the same thing, so web and WhatsApp can't diverge. Login is a signed httpOnly session cookie created from a per-person random key.

**Tech Stack:** Next.js 16 (upgraded to 16.4.x), React 19, TypeScript, Tailwind v4, lucide-react, recharts, Supabase (secret key, RLS on / no policies), Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-10-15-web-dashboard-signup-design.md` (Part A sections).

## Global Constraints
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (AGENTS.md); heed deprecations.
- Keys: prefix `DR-` (doctor) / `RC-` (reception) + 12 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, displayed `DR-XXXX-XXXX-XXXX`; case-insensitive, dashes/spaces ignored; stored only as HMAC-SHA256 with `ACCESS_CODE_PEPPER`; shown once.
- Session cookie `neeed_session`: httpOnly, Secure, SameSite=Lax, 30 days, HMAC-SHA256 with `SESSION_SECRET`, payload `{staffId, keyVersion, exp}`.
- Login limit: 10 failed attempts per IP per 15 minutes → "Too many tries, wait 15 minutes."
- Same-day booking only. Zero Meta cost: message a patient only when `windowOpen(...)` is true.
- Fee is an integer number of rupees saved on the appointment when it is completed; changing the standard fee never touches past visits.
- Patient phone = WhatsApp number, stored as digits with country code (e.g. `919876543210`).
- Actor labels (exact): doctor staff row → `doctors.name` verbatim (it already includes "Dr.", e.g. `Dr. Mehta`); receptionist → `{staff.name} (Reception)`; doctor bot → `{doctors.name} (WhatsApp)`; patient bot → `Patient (WhatsApp)`.
- Receptionists can do everything except Settings → Staff (add/remove/new key) and new key for the doctor.
- Design: mobile first (375 px), bottom tab bar < 768 px, side menu ≥ 768 px; frosted-glass header/nav; soft raised cards with real borders; one accent (deep teal-green); WCAG AA contrast; touch targets ≥ 44 px; light + dark; motion 150–250 ms honouring `prefers-reduced-motion`.
- Doctor-side UI copy in English; patient bot strings in all three languages within WhatsApp limits.
- No new runtime dependencies except what Next itself needs; Vitest only for tests.

## Review Focus
- **Phone formats** typed by a receptionist (`98765 43210`, `+91 98765-43210`, `09876543210`, `919876543210`) all become `919876543210`; letters or wrong length → inline "Enter a 10-digit mobile number" (test in Task 4).
- **Two people booking the same slot** at once (two receptionists, or web + WhatsApp) → one booking, the other sees "That time was just taken" (test in Task 4).
- **A removed receptionist or a replaced key** while a device is still logged in → the next page load or action goes to `/login`, nothing is saved (test in Task 3).
- **Cross-clinic ids**: an action with another doctor's appointment id → rejected as not found, nothing changed (test in Task 4).
- **Fee edits**: changing the standard fee leaves completed visits' fees unchanged; editing a fee on a not-completed visit is refused (test in Task 5).

---

### Task 1: Cleanup + Next.js upgrade + landing page

**Files:**
- Delete: `src/app/page.tsx` (old demo), `src/components/*`, `src/context/*`, `src/utils/supabase/*`, `src/middleware.ts`
- Create: `src/app/page.tsx` (landing)
- Modify: `package.json` (next → latest 16.x; remove `framer-motion`, `@fontsource/inter`), `src/app/layout.tsx` (title "Neeed", description, no Google Fonts link — fonts come in Task 6)

- [ ] **Step 1:** Read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`, then `npm install next@16.4.1` (or newer 16.x) and remove the two packages. Run `npx next build` — expected: builds; only `/rx/[token]`, `/rx-guide.png`, API routes and `/` remain.
- [ ] **Step 2:** Landing `/`: clinic-neutral "Neeed" wordmark, one line "WhatsApp booking & prescriptions for your clinic", buttons **Log in** (`/login`) and **Sign up** (`/signup`, Part B — link may 404 until then). Server component, no client JS.
- [ ] **Step 3:** `npx vitest run && npx tsc --noEmit && npx biome check` — expected: all tests pass (148), no errors.
- [ ] **Step 4: Commit** `chore: remove old demo, upgrade Next.js, landing page`

### Task 2: Data model — migration, types, both stores

**Files:**
- Create: `supabase/migrations/20261015000000_dashboard.sql`
- Modify: `src/lib/db/types.ts`, `src/lib/db/memory-store.ts`, `src/lib/db/supabase-store.ts`, `src/lib/db/memory-store.test.ts`

**Interfaces — Produces:**
```ts
type Gender = "M" | "F" | "O";
type Source = "whatsapp" | "reception";
// Appointment gains:
patientAge: number | null; patientGender: Gender | null; patientArea: string | null;
source: Source; fee: number | null; createdBy: string | null; completedBy: string | null;
// NewAppointment gains optional: patientAge, patientGender, patientArea, source (default "whatsapp"), createdBy
// Doctor gains: standardFee: number; address: string | null   (updateDoctor accepts both)
type Role = "doctor" | "reception";
type Staff = { id: string; doctorId: string; role: Role; name: string; keyVersion: number; active: boolean; createdAt: Date; lastActiveAt: Date | null };
type Activity = { id: string; doctorId: string; actor: string; staffId: string | null; action: string; appointmentId: string | null; detail: Record<string, unknown>; at: Date };
// Store gains:
staffByKeyHash(hash: string): Promise<Staff | null>;          // active or not
staffById(id: string): Promise<Staff | null>;
listStaff(doctorId: string): Promise<Staff[]>;               // createdAt asc
createStaff(s: { doctorId: string; role: Role; name: string; keyHash: string }): Promise<Staff>;
updateStaff(id: string, patch: Partial<{ keyHash: string; keyVersion: number; active: boolean; lastActiveAt: Date }>): Promise<void>;
logActivity(a: Omit<Activity, "id" | "at">, at: Date): Promise<void>;
activity(doctorId: string, opts: { limit: number; staffId?: string }): Promise<Activity[]>; // newest first
loginFailures(ip: string, since: Date): Promise<number>;
addLoginFailure(ip: string, at: Date): Promise<void>;
```

- [ ] **Step 1:** Migration exactly per spec "Data changes (Part A migration)": appointment columns (`patient_age smallint`, `patient_gender text check (patient_gender in ('M','F','O'))`, `patient_area text`, `source text not null default 'whatsapp' check (source in ('whatsapp','reception'))`, `fee integer check (fee >= 0)`, `created_by text`, `completed_by text`); doctor columns (`standard_fee integer not null default 0 check (standard_fee >= 0)`, `address text`); tables `staff`, `activity` (index on `(doctor_id, at desc)`), `login_attempts` (index on `(ip, at)`); `alter table … enable row level security` on the three new tables, no policies.
- [ ] **Step 2: Failing tests** in `memory-store.test.ts`: `createStaff` then `staffByKeyHash` finds it; `updateStaff({active:false})` is reflected; `activity()` returns newest first and filters by `staffId`; `loginFailures` counts only rows with `at >= since`; `createAppointment` stores the new optional fields and defaults `source` to `"whatsapp"`.
- [ ] **Step 3:** Implement in memory store; mirror in Supabase store (row mappers + column map entries, same pattern as `toDoctor`/`DOCTOR_COLS`). Run `npx vitest run` — PASS.
- [ ] **Step 4:** Apply the migration to Neeed-Mumbai (`ipxodfmqmyydjoajnbsl`) via the Supabase MCP `apply_migration` (do NOT touch Neeed-Cad-Desk). Confirm with `list_tables`.
- [ ] **Step 5: Commit** `feat: data model for staff, activity, patient details and fees`

### Task 3: Keys, sessions, login

**Files:**
- Create: `src/lib/auth/keys.ts`, `src/lib/auth/session.ts`, `src/lib/auth/login.ts`, `src/lib/auth/auth.test.ts`

**Interfaces — Produces:**
```ts
// keys.ts
generateKey(role: Role, rand?: (n: number) => Uint8Array): string;    // "DR-XXXX-XXXX-XXXX"
normalizeKey(input: string): string | null;                            // "DR" + 12 chars uppercase, or null
hashKey(normalized: string, pepper: string): string;                    // hex HMAC-SHA256
// session.ts
signSession(p: { staffId: string; keyVersion: number }, now: Date, secret: string): string; // exp = now + 30 days
verifySession(token: string, now: Date, secret: string): { staffId: string; keyVersion: number } | null;
// login.ts
login(store: Store, input: { key: string; ip: string }, now: Date, env: { pepper: string; secret: string }):
  Promise<{ ok: true; token: string; staff: Staff } | { ok: false; message: string }>;
currentStaff(store: Store, token: string | undefined, now: Date, secret: string):
  Promise<{ staff: Staff; doctor: Doctor } | null>;   // null if bad/expired token, staff inactive, or keyVersion mismatch
actorLabel(staff: Staff, doctor: Doctor): string;     // per Global Constraints
```

- [ ] **Step 1: Failing tests** (`auth.test.ts`):
  - `generateKey("doctor")` matches `/^DR-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/`; `"reception"` → `RC-`.
  - `normalizeKey(" dr-k7qp 92xm-4twh ")` → `"DRK7QP92XM4TWH"`; wrong prefix / length / a `0`,`O`,`1`,`I`,`L` → `null`.
  - `verifySession(signSession(...))` round-trips; tampered token → null; 31 days later → null.
  - `login` with the right key → ok + token; wrong key → `{ok:false, message:"That key didn't work. Check it and try again."}` and one failure recorded; the 11th try within 15 min (even with the right key) → `"Too many tries, wait 15 minutes."`.
  - `currentStaff`: removed receptionist (`active:false`) → null; after `updateStaff({keyVersion: 2})` the old token → null (Review Focus).
  - `actorLabel` → `"Dr. Mehta"` for the doctor row (name as stored), `"Riya (Reception)"`.
- [ ] **Step 2:** Run `npx vitest run src/lib/auth` — FAIL (module missing).
- [ ] **Step 3:** Implement with `node:crypto` (`randomBytes` rejection-sampled into the 31-char alphabet, `createHmac`, `timingSafeEqual`), same style as `src/lib/rx/link.ts`. `currentStaff` also sets `lastActiveAt` at most once per hour.
- [ ] **Step 4:** Run tests — PASS.
- [ ] **Step 5:** `scripts/issue-key.ts` (run with `node --experimental-strip-types` against Supabase — no new dependency, reads env from `.env.local`): `--doctor <doctorId> [--role doctor|reception --name "..."]` creates or re-keys a staff row and prints the key once. Used for the pilot doctor. Add `SESSION_SECRET` and `ACCESS_CODE_PEPPER` (random 32-byte hex) to `.env.local` and Vercel env — ask the user to set the Vercel values; never print them in chat.
- [ ] **Step 6: Commit** `feat: per-person keys, signed sessions, rate-limited login`

### Task 4: Clinic services shared by web and bot

**Files:**
- Create: `src/lib/clinic/patient.ts`, `src/lib/clinic/booking.ts`, `src/lib/clinic/visits.ts`, `src/lib/clinic/availability.ts`, `src/lib/clinic/activity.ts`, `src/lib/clinic/clinic.test.ts`
- Modify: `src/lib/bot/doctor.ts` (use `cancelVisits`, `validateHours`, `addBlock…` from here; move `cancelAndNotify` out), `src/lib/bot/patient.ts` (log activity, set `createdBy`)

**Interfaces — Produces:**
```ts
type Actor = { label: string; staffId: string | null };
// patient.ts
normalizePhone(input: string): string | null;          // see Review Focus formats → "91" + 10 digits
lastPatientDetails(store: Store, doctorId: string, phone: string):
  Promise<{ name: string; age: number | null; gender: Gender | null; area: string | null } | null>;
// booking.ts
type PatientInput = { phone: string; name: string; age: number; gender: Gender; area?: string; reason?: string };
validatePatient(raw: Record<string, unknown>): { ok: true; value: PatientInput } | { ok: false; errors: Partial<Record<keyof PatientInput, string>> };
bookToday(store: Store, doctor: Doctor, input: PatientInput & { startsAt: Date; source: Source }, actor: Actor, now: Date):
  Promise<{ ok: true; appointment: Appointment; notices: Send[] } | { ok: false; message: string }>;
// visits.ts
cancelVisits(store: Store, doctor: Doctor, appts: Appointment[], reason: string | null, actor: Actor, now: Date): Promise<Send[]>;   // was cancelAndNotify; same patient text
ownAppointment(store: Store, doctorId: string, id: string): Promise<Appointment | null>;           // null for other clinics
setFee(store: Store, doctor: Doctor, id: string, fee: number, actor: Actor, now: Date): Promise<{ ok: boolean; message?: string }>;
// availability.ts
validateHours(d: Doctor, key: Period | "lunch", range: Range | null): string | null;   // the bot's exact messages
setClosedToday(store, doctor, closed: boolean, mode: "cancel" | "keep" | null, actor, now): Promise<{ clash?: number; notices: Send[] }>;
addBlockRange(store, doctor, date: string, range: Range | "whole", mode: "cancel" | "keep" | null, actor, now): Promise<{ clash?: number; notices: Send[] }>;
// activity.ts
record(store: Store, doctorId: string, actor: Actor, action: string, extra: { appointmentId?: string; detail?: Record<string, unknown> }, now: Date): Promise<void>;
```
Action names (exact): `booked`, `completed`, `cancelled`, `fee_changed`, `closed_today`, `opened_today`, `blocked`, `hours_changed`, `fee_default_changed`, `rx_setup_changed`, `staff_added`, `staff_removed`, `key_reissued`.

- [ ] **Step 1: Failing tests** (`clinic.test.ts`, memory store, NOW from test-kit):
  - `normalizePhone` cases from Review Focus + `"abc"` / `"12345"` → null.
  - `validatePatient`: missing name/age/gender → field errors; age `121` → `"Age must be 0–120"`; phone `"12345"` → `"Enter a 10-digit mobile number"`.
  - `bookToday`: books a free slot today with `source:"reception"`, `createdBy:"Riya (Reception)"`, and logs `booked`; a slot already booked (by a WhatsApp booking) → `{ok:false, message:"That time was just taken. Pick another."}`; a slot tomorrow or in the past → same message; no notice unless the patient's window is open.
  - `ownAppointment` with another doctor's id → null (Review Focus).
  - `setClosedToday(..., true, null)` with 2 confirmed bookings → `{clash: 2}` and nothing changed; with `"cancel"` → both cancelled, notices only for open windows, `closed_today` logged.
  - `validateHours` returns the bot's existing messages for lunch-crossing and overlapping ranges (copy from `doctor.ts` hoursStep).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement by moving logic out of `src/lib/bot/doctor.ts` (cancelAndNotify, close/closeConfirm/block apply, hours validation) and `src/lib/bot/patient.ts` (`create`) — the bot calls these services with actor `{label: \`${doctor.name} (WhatsApp)\`, staffId: null}` or `{label: "Patient (WhatsApp)", staffId: null}`.
- [ ] **Step 4:** Run the whole suite — new tests PASS and all existing bot tests still PASS unchanged.
- [ ] **Step 5: Commit** `refactor: shared clinic services for web and bot, with activity log`

### Task 5: Fee per visit

**Files:**
- Modify: `src/lib/bot/complete.ts`, `src/lib/bot/doctor.ts`, `src/lib/rx/web.ts`, `src/lib/bot/doctor.test.ts`, `src/lib/clinic/clinic.test.ts`

**Interfaces:** `completeVisit(store, doctor, a, content, now, opts?: { fee?: number; actor?: Actor })` — sets `fee = opts.fee ?? doctor.standardFee`, `completedBy = opts.actor?.label ?? null`, logs `completed`. Skip (no prescription) path in the bot also stores the fee.

- [ ] **Step 1: Failing tests:** doctor with `standardFee 300` completes a visit → `fee 300`; `updateDoctor({standardFee: 500})` → that visit still `300`, the next completed visit `500` (Review Focus); `setFee` on a COMPLETED visit → updated + `fee_changed` logged; on a CONFIRMED visit → `{ok:false, message:"Complete the visit first."}`; negative fee → refused.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** `feat: fee saved on each completed visit`

### Task 6: WhatsApp booking — name + age, gender, area

**Files:**
- Modify: `src/lib/bot/patient.ts`, `src/lib/bot/patient-text.ts`, `src/lib/bot/patient.test.ts`, `src/lib/bot/patient-text.test.ts`
- Create: `parseNameAge` in `src/lib/clinic/patient.ts` (+ tests in `clinic.test.ts`)

**Interfaces:** `parseNameAge(text: string): { name: string; age: number | null }` — the number (0–120) before or after the name is the age; separators `,` `-` spaces ignored; `"Ramesh Kumar, 45"` and `"45 Ramesh Kumar"` → `{name:"Ramesh Kumar", age:45}`; `"Ramesh"` → age null; `"Ramesh 150"` → age null and name `"Ramesh 150"`.
New states: `book_name` (name+age) → `book_age` (only if age missing) → `book_gender` (buttons `g:M` `g:F` `g:O`) → `book_area` (text or Skip) → existing `book_period`. Back on each goes one step back. "Yes, {name}" (`yesname`) reuses last gender + area, then asks age only (`book_age`).
New `Text` keys (all three languages): `askNameAge` (EN: "Sure! Send the patient's full name and age, like: Ramesh Kumar, 45"), `askAge` ("And the patient's age?"), `askGender` ("Patient's gender?"), `gender: {M,F,O}` (EN "Male"/"Female"/"Other"), `askArea` ("Which area or locality? (optional — type it, or tap Skip)"), `badAge` ("Please send the age as a number, like 45."). Replace `askName`. Hindi/Assamese translations in the same register as the existing ones.
Doctor alert gains lines `Age: {age}`, `Gender: {Male|Female|Other}`, `Area: {area|—}`.

- [ ] **Step 1: Failing tests:** `parseNameAge` cases above; EN full booking now `"Ramesh Kumar, 45"` → gender buttons → `g:M` → area prompt → `skip` → periods; name without age → `askAge` → `"abc"` → `badAge` → `"45"` → gender; Back from gender → age/name step; Hindi gender titles `["पुरुष","महिला","अन्य"]`; saved appointment has `patientAge 45`, `patientGender "M"`, `patientArea null`; length test covers the new buttons.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS (update existing booking tests for the new steps).
- [ ] **Step 5: Commit** `feat: WhatsApp booking asks name+age, gender and area`

### Task 7: Design system + app shell + login

**Files:**
- Create: `src/app/(dash)/layout.tsx`, `src/app/(dash)/nav.tsx` (client), `src/app/login/page.tsx`, `src/app/login/actions.ts`, `src/app/logout/route.ts`, `src/components/ui/{button,card,field,sheet,badge,stat,empty}.tsx`, `src/lib/auth/guard.ts`
- Modify: `src/app/globals.css` (design tokens), `src/app/layout.tsx` (font via `next/font/google`: Plus Jakarta Sans variable; `theme-color`; `viewport` with `viewportFit: "cover"`)

**Interfaces — Produces:** `requireStaff(): Promise<{ staff: Staff; doctor: Doctor; actor: Actor; store: Store }>` (server-only; redirects to `/login` when `currentStaff` is null). `requireDoctorRole()` — same but redirects to `/today` for receptionists. Route group `(dash)` serves `/today`, `/add`, `/reports`, `/settings`.

- [ ] **Step 1:** Before any UI code, load the `frontend-design` skill and read the Next 16 docs for route groups, Server Actions, `cookies()` and `next/font`.
- [ ] **Step 2:** Tokens in `globals.css` (`@theme`): `--bg`, `--surface`, `--surface-raised`, `--ink`, `--muted`, `--line`, `--accent` (deep teal-green, matches the PDF), `--accent-ink`, `--ok`, `--warn`, `--danger`, radii, the two-layer soft shadow, glass (`backdrop-filter: blur(16px) saturate(1.4)` on a translucent surface); dark values under `prefers-color-scheme: dark`. All text/background pairs ≥ 4.5:1.
- [ ] **Step 3:** Shell: glass header (clinic name, today's date, Open/Closed pill) + nav — glass bottom tab bar on < 768 px (Today, Add, Reports, Settings with lucide icons, 44 px targets, safe-area padding), side menu ≥ 768 px. `aria-current` on the active tab.
- [ ] **Step 4:** `/login`: one "Your key" field (`autocomplete="off"`, `autocapitalize="characters"`), a Server Action calling `login()` with the request IP (`x-forwarded-for` first entry), sets the cookie per Global Constraints, redirects to `/today`; inline error text from `login()`. `/logout` clears the cookie → `/login`.
- [ ] **Step 5:** Run the dev server (`preview_start` "dev"), log in with a key from `scripts/issue-key.ts` against a local test doctor; check `/login` and the empty shell at 375 px and desktop, light and dark (`resize_window`). Screenshot.
- [ ] **Step 6: Commit** `feat: design system, dashboard shell and key login`

### Task 8: Today + Mark complete

**Files:**
- Create: `src/app/(dash)/today/page.tsx`, `src/app/(dash)/today/actions.ts`, `src/app/(dash)/today/patient-card.tsx`, `src/app/(dash)/visit/[id]/page.tsx`, `src/app/(dash)/visit/[id]/actions.ts`
- Modify: `src/app/rx/[token]/rx-form.tsx` (accept `onSubmit(payload) => Promise<{ok:boolean; message:string}>` and an optional `fee` field; keep the token page working), `src/lib/rx/web.ts` (extract `submitRxFor(store, doctor, appointment, body, now, opts)` used by both the token route and the dashboard)

**Behaviour (spec "Today"):** stats row (waiting / done / cancelled / today's ₹ collection); Open/Closed switch → `setClosedToday`, clash → bottom sheet "Cancel & notify" / "Keep bookings"; groups Morning / Afternoon / Evening / Other times; search by name or number (client filter); card = time · name · age · gender · `tel:` link · 📱/🏥 badge · status · "Added by … · time" / "Completed by …"; actions: **Mark complete** → `/visit/[id]` (rx form + Fee pre-filled with `standardFee`, editable; "Complete without prescription" button), **Cancel** → sheet with optional reason → `cancelVisits`; completed cards show **Edit fee** (sheet → `setFee`). Every action re-runs `requireStaff()` and `ownAppointment()`; `revalidatePath("/today")` after changes. Empty state: "No patients yet today. Add a patient who called, or share your WhatsApp number."

- [ ] **Step 1:** Failing test for `submitRxFor` (dashboard path): completes with fee and actor, refuses a non-CONFIRMED visit with "This visit is already completed.", and the token route still passes its existing tests.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement `submitRxFor` + pages. **Step 4:** Run — PASS.
- [ ] **Step 5:** Browser check at 375 px and desktop, light/dark: book via `/add` (Task 9 may not exist yet — seed two appointments with a script or the WhatsApp test number), Close today with a clash, Cancel, Mark complete with a fee, Edit fee. Screenshot.
- [ ] **Step 6: Commit** `feat: Today page with complete, cancel, close and fee edit`

### Task 9: Add patient

**Files:**
- Create: `src/app/(dash)/add/page.tsx`, `src/app/(dash)/add/form.tsx` (client), `src/app/(dash)/add/actions.ts`

**Behaviour:** fields per spec with labels **WhatsApp mobile no.** (note: *"Enter the patient's WhatsApp number. They can then download their prescription anytime from WhatsApp → My prescriptions."*), Name, Age, Gender (segmented control M/F/O), Area (optional), Reason (optional); on a valid number blur → `lastPatientDetails` prefill (editable, with "Filled from last visit" hint); time picker = today's free slots grouped by part of the day (tappable chips; refreshed after a failed booking); submit → `validatePatient` + `bookToday` with `source:"reception"` → toast "Booked {name} at {time}" and reset; field errors inline.

- [ ] **Step 1:** Implement (logic is already tested in Task 4).
- [ ] **Step 2:** Browser check: invalid phone/age errors, prefill for a known number, double-booking the same slot from two tabs → second shows "That time was just taken. Pick another." 375 px + desktop. Screenshot.
- [ ] **Step 3: Commit** `feat: Add patient form for reception`

### Task 10: Reports + Activity

**Files:**
- Create: `src/lib/clinic/reports.ts`, `src/lib/clinic/reports.test.ts`, `src/app/(dash)/reports/page.tsx`, `src/app/(dash)/reports/charts.tsx` (client, recharts)

**Interfaces:**
```ts
buildReports(appts: Appointment[], now: Date): {
  today: { collection: number; seen: number };
  month: { collection: number; seen: number };
  collectionByMonth: { month: string; amount: number }[];      // last 12, "2026-10", oldest first, zeros included
  patientsByDay: { date: string; count: number }[];            // last 30 days, COMPLETED
  patientsByMonth: { month: string; count: number }[];         // last 12
  newVsReturning: { month: string; new: number; returning: number }[]; // by first-ever appointment per phone
  bySource: { month: string; whatsapp: number; reception: number }[];
  cancellations: { month: string; patient: number; doctor: number }[];
}
```
(The page loads `appointmentsBetween(doctorId, new Date(0), now)` and the latest 200 `activity` rows.)

- [ ] **Step 1: Failing tests:** collection sums only COMPLETED fees (null fee = 0) in IST months; a phone whose first appointment was last month counts as returning this month; months with no data appear as 0; cancellations split by `cancelledBy`.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5:** Page: stat cards (₹ today, ₹ this month, seen today, seen this month — count-up animation), charts in cards (bar: collection by month; line: patients by day; stacked bars: new vs returning, WhatsApp vs Reception, cancellations), accent colour from tokens, readable in dark mode; **Activity** list (who · what · when, relative time) with a person filter. Browser check 375 px + desktop.
- [ ] **Step 6: Commit** `feat: Reports and Activity`

### Task 11: Settings + Staff

**Files:**
- Create: `src/app/(dash)/settings/page.tsx`, `src/app/(dash)/settings/actions.ts`, `src/app/(dash)/settings/{hours,fee,block,rx-setup,staff}.tsx`, `src/lib/clinic/staff.ts`, `src/lib/clinic/staff.test.ts`

**Interfaces:**
```ts
addReceptionist(store, doctor, name: string, actor: Actor, now, pepper: string): Promise<{ staff: Staff; key: string }>;
removeStaff(store, doctor, staffId: string, actor: Actor, now): Promise<void>;        // active=false; refuses the doctor row
reissueKey(store, doctor, staffId: string, actor: Actor, now, pepper: string): Promise<string>; // new hash, keyVersion+1
```
**Behaviour:** sections — Clinic hours (Morning/Afternoon/Evening/Lunch as time ranges or Off, time per patient 15/30/45/60; `validateHours` messages inline; "Existing bookings are kept"), Standard fee (₹, logs `fee_default_changed`), Block time (date chips today…+6, Whole day / Morning / Afternoon / Evening / custom; clash sheet), Prescription setup (reg. no.; signature PNG/JPG ≤ 2 MB → `putFile("signatures", …)`, preview), **Staff** (doctor only: list with last active; Add receptionist → key shown once in a sheet with Copy + Download `.txt` + "save this now"; Remove (confirm); New key for a receptionist or yourself), Log out. Receptionists don't see Staff.

- [ ] **Step 1: Failing tests** (`staff.test.ts`): `addReceptionist` returns an `RC-` key that logs in; `removeStaff` makes `currentStaff` null for their old token; `removeStaff` on the doctor row throws "Can't remove the doctor"; `reissueKey` invalidates only that person's old sessions; each logs its action.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement services + page; Staff server actions call `requireDoctorRole()`. **Step 4:** Run — PASS.
- [ ] **Step 5:** Browser check: receptionist login can't see Staff and a crafted Staff action from a receptionist session is refused; hours validation messages; signature upload preview. 375 px + desktop, light/dark.
- [ ] **Step 6: Commit** `feat: Settings and Staff`

### Task 12: Pilot key, final checks, hand-off

- [ ] **Step 1:** `npx vitest run && npx tsc --noEmit && npx biome check && npx next build` — all clean.
- [ ] **Step 2:** Run `scripts/issue-key.ts --doctor <pilot doctor id>` against Neeed-Mumbai; give the user the `DR-` key in chat **only once** and tell them to save it (it is never shown again).
- [ ] **Step 3:** Full walk-through in the browser at 375 px and 1280 px, light and dark: login → Add patient → Today → Mark complete with fee → Reports → Settings (hours, fee, block, staff add/remove) → logout. Lighthouse accessibility ≥ 95 on `/today` and `/add`. Screenshots to the user.
- [ ] **Step 4:** Update the live-test artifact status (`ArtifactData` on `https://claude.ai/artifact/9TunQWYF4S8vd81dDWihwr`, collection `status`, doc `main`) with the dashboard steps.
- [ ] **Step 5:** Ask the user before pushing (`git push origin feat/whatsapp-bot:main` deploys production); confirm `SESSION_SECRET` and `ACCESS_CODE_PEPPER` are set in Vercel first.
