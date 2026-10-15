# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild every dashboard screen in the reference's premium style with cube-motion, add History (search by phone/name) and a Request-access sign-up page.

**Architecture:** Design tokens and primitives live in `globals.css` (CSS classes, as in Part A); a small client `Motion` helper wraps cube-motion. Pages keep their existing server actions and `src/lib/clinic/*` services; only the screens change, plus two new services (`history.ts`, `access.ts`) with store methods.

**Tech Stack:** Next 16.4.1 (App Router, server actions), React 19, Tailwind v4, lucide-react, recharts, cube-motion 0.1.0 (new), Supabase, vitest, biome. Package manager: `npx -y pnpm@12.11.2`.

**Spec:** `docs/superpowers/specs/2026-10-15-dashboard-redesign-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before Next-specific code (AGENTS.md).
- Font Matangi (`--font-body`); no new fonts. Icons: `lucide-react` only, 20 px, `strokeWidth={1.75}`.
- Card radius 28 px; inner 16–20 px; card padding 24 px (16 px < 768 px); spacing scale 4/8/12/16/24/32; grid gap 16 px, 20 px ≥ 1280 px.
- Primary button = near-black pill; secondary = white pill + hairline; icon button = 44 px circle; `:active { scale: .97 }`; hover lift 2 px only under `prefers-reduced-motion: no-preference`.
- Status colours: waiting orange, done blue, cancelled red, money green; purple/yellow only in charts; text on a tint uses that hue's darkest stop; WCAG AA.
- Motion only via cube-motion (`rise`, `leave`, `morph`, `reveal`) or CSS press/hover.
- Breakpoints: phone < 768 (bottom tab bar), ≥ 768 left rail. At 1280 × 800 Today, Add patient, Mark complete, Settings, Reports have no page scroll; lists scroll inside their card.
- Copy: sentence case, no "please", no "successfully".
- Lighthouse accessibility ≥ 95 per page.
- Never push without the user's OK.

## Review Focus

1. History search with a phone typed as "+91 98765-43210" or "98765" — expect digits-only matching (spaces, dashes, +91 ignored). → test in Task 6.
2. History search returning another clinic's visits — must never happen. → test in Task 6.
3. Request access when `NEEED_ADMIN_PHONE` is unset or WhatsApp send throws — request still saved, user still sees Thanks. → test in Task 2.
4. A very long patient list / long names at 1280 × 800 — page must not scroll; names truncate. → browser check in Task 3.
5. Reduced-motion users and SSR — cube-motion calls only after mount, nothing invisible if JS fails (elements visible by default). → check in Task 1.

---

### Task 1: Design system, motion helper, app shell

**Files:**
- Modify: `src/app/globals.css` (replace Part A tokens/primitives), `src/app/(dash)/layout.tsx`, `src/app/(dash)/nav.tsx`, `package.json`
- Create: `src/components/motion.tsx`, `src/components/page-head.tsx`

**Interfaces:**
- Produces: CSS classes `.card .btn .btn-primary .btn-ghost .btn-icon .pill .pill[aria-pressed=true] .field .chip .badge-wait .badge-done .badge-cancel .scroll-area`, page grid `.page` (fills `100dvh − topbar` ≥ 768 px).
- Produces: `<Rise className? as?>` (calls `rise(el,{targets:"children"})` on mount), `<Reveal>`, `<Morph active on off>` re-exported from `cube-motion/react`; `<PageHead eyebrow title actions?>`.
- Produces: nav items `[Today /today, Add patient /add, History /history, Reports /reports, Settings /settings]` + Log out (POST /logout).

- [ ] **Step 1:** `npx -y pnpm@12.11.2 add cube-motion@0.1.0`; read `/Users/sushil/.claude/skills/cube-motion/reference.md`.
- [ ] **Step 2:** Tokens on `:root` + dark (`prefers-color-scheme` guarded by `:not([data-theme=light])` and `[data-theme=dark]`): `--bg-grad` (light: peach #FCE9DC top-left → #EAF1FB right; dark: #12141A → #171C26), `--surface`, `--ink`, `--muted`, `--line`, `--wait #E8772E`, `--done #2F7DE1`, `--cancel #E5484D`, `--money #1F9D55`, plus `-soft` tints. Body background `--bg-grad` fixed.
- [ ] **Step 3:** Shell: left rail (≥ 768) of 44 px round links with `aria-current`, top bar (logo, centre slot for period pills, Open/Closed switch from Today's existing `setClosedAction`, name + role); phone bottom tab bar with the same five items.
- [ ] **Step 4:** Verify: `npx vitest run && npx tsc --noEmit && npx biome check src` → all clean; browser at 375/768/1280 light+dark: rail vs tab bar, no horizontal scroll; with JS disabled content is visible.
- [ ] **Step 5:** Commit `feat(ui): premium design system, motion helper and shell`.

### Task 2: Login and Request access

**Files:**
- Create: `supabase/migrations/20261016000000_access_requests.sql`, `src/lib/clinic/access.ts`, `src/lib/clinic/access.test.ts`, `src/app/signup/page.tsx`, `src/app/signup/form.tsx`, `src/app/signup/actions.ts`, `src/components/auth-split.tsx`
- Modify: `src/lib/db/types.ts`, `src/lib/db/memory-store.ts`, `src/lib/db/supabase-store.ts`, `src/app/login/page.tsx`, `src/app/login/form.tsx`, `src/app/page.tsx` (Sign up → `/signup`)

**Interfaces:**
- Produces: `type AccessRequest = { doctorName; clinicName; city; phone; email: string | null; ip: string }`; Store: `addAccessRequest(r: AccessRequest, at: Date): Promise<void>`, `accessRequestsSince(ip: string, since: Date): Promise<number>`.
- Produces: `requestAccess(store, input: {doctorName,clinicName,city,phone,email,ip}, now, alert: (text: string) => Promise<void>): Promise<{ok:true} | {ok:false; errors: Partial<Record<"doctorName"|"clinicName"|"city"|"phone"|"email"|"form", string>>}>`.
- Table `access_requests (id uuid pk default gen_random_uuid(), created_at timestamptz default now(), doctor_name text, clinic_name text, city text, phone text, email text, ip text, status text default 'new')`, RLS on, no policies.

- [ ] **Step 1: Failing tests** in `access.test.ts`:
  - `"saves a valid request with the phone normalised"` — phone `"+91 98765-43210"` → saved `phone === "919876543210"`, result `{ok:true}`.
  - `"rejects missing fields and a bad phone"` — empty names/city, phone `"123"` → `errors` has `doctorName, clinicName, city, phone`; nothing saved.
  - `"bad email is rejected, empty email is fine"`.
  - `"6th request from one IP within an hour is refused"` → `errors.form === "Too many requests. Try again in an hour."`.
  - `"still saves when the alert throws"` → alert rejects, result ok, 1 row.
- [ ] **Step 2:** `npx vitest run src/lib/clinic/access.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement with `normalizePhone` from `patient.ts`; limits: names/city ≤ 80 chars, email ≤ 120; alert text `*New access request*\n{doctor} · {clinic}, {city}\n+{phone}` (WhatsApp syntax). Apply migration to Neeed-Mumbai via Supabase MCP `apply_migration`.
- [ ] **Step 4:** Run tests → PASS.
- [ ] **Step 5:** UI: `AuthSplit` (left brand panel with three preview cards in `<Rise>`, right slot; phone shows right slot only). Login form keeps `signIn`. Signup action: IP from `x-forwarded-for`; alert = `deliver(store,[{from: WA_PLATFORM_PHONE_NUMBER_ID, to: NEEED_ADMIN_PHONE, msg:{kind:"text",body}}],{from:"",to:""},now)` or no-op when either env is unset; success card swaps via `<Morph>` to "Thanks, we'll WhatsApp you within a day."
- [ ] **Step 6:** Browser: 375 + 1440, light + dark, submit empty → inline errors, submit valid → Thanks; one test row then deleted via SQL.
- [ ] **Step 7:** Commit `feat: premium login and request-access page`.

### Task 3: Today

**Files:** Modify `src/app/(dash)/today/page.tsx`, `src/app/(dash)/today/today-view.tsx`

**Interfaces:** Consumes existing `setClosedAction, cancelAction, feeAction` (unchanged), Task 1 primitives.

- [ ] **Step 1:** Layout: `PageHead` + 4 stat cards; grid `2fr 1fr` ≥ 1024: queue card (period pills Morning/Afternoon/Evening, search, `.scroll-area` rows: time · name · age·gender · badge · actions Mark complete/Edit fee/Cancel/Call) and right column (Next patient card with large Mark complete; "Collected today" recharts ring). Phone: stacked.
- [ ] **Step 2:** Motion: page `<Rise>`, status badge `<Morph>`, cancelled row `leave` before refresh, toast via `<Rise show>`.
- [ ] **Step 3:** Verify suite/tsc/biome clean; browser 375/768/1280×800/1440 light+dark; at 1280×800 `document.documentElement.scrollHeight === innerHeight`; 30-row list scrolls inside the card; Lighthouse a11y ≥ 95.
- [ ] **Step 4:** Commit `feat(ui): Today redesign`.

### Task 4: Add patient

**Files:** Modify `src/app/(dash)/add/page.tsx`, `src/app/(dash)/add/form.tsx`

- [ ] **Step 1:** Two columns ≥ 1024 (form | time pills by period + sticky Book); prefill from `lastPatientDetails` unchanged; accept `?phone=` query to prefill (used by History "Book again").
- [ ] **Step 2:** Book button label `<Morph>` Book → Booked; errors inline as now.
- [ ] **Step 3:** Verify as Task 3 Step 3 for `/add`; `/add?phone=919999900001` prefills.
- [ ] **Step 4:** Commit `feat(ui): Add patient redesign`.

### Task 5: Mark complete

**Files:** Modify `src/app/visit/[id]/page.tsx`, `src/app/rx/[token]/rx-form.tsx` (layout props only; WhatsApp link page must look unchanged or better)

- [ ] **Step 1:** Two columns ≥ 1024: patient details + medicines table | fee, Preview PDF, Complete and send, Complete without prescription. Keep RxForm logic.
- [ ] **Step 2:** Verify `/visit/[id]` at 1280×800 no page scroll; `/rx/[token]` still works on 375 (open an existing token link from test data or a unit render); suite green.
- [ ] **Step 3:** Commit `feat(ui): Mark complete redesign`.

### Task 6: History

**Files:**
- Create: `src/lib/clinic/history.ts`, `src/lib/clinic/history.test.ts`, `src/app/(dash)/history/page.tsx`, `src/app/(dash)/history/history-view.tsx`, `src/app/(dash)/history/actions.ts`
- Modify: `src/lib/db/types.ts`, `memory-store.ts`, `supabase-store.ts`

**Interfaces:**
- Store: `searchAppointments(doctorId: string, o: { phone?: string; name?: string; from: Date; to: Date; limit: number; before?: Date }): Promise<Appointment[]>` (startsAt desc).
- `searchVisits(store, doctorId, q: string, range: { from: Date; to: Date }, page: { limit: number; before?: Date }): Promise<{ visits: Appointment[]; more: boolean }>` — `q` digits (after stripping spaces, dashes, leading +/91 when > 10 digits) with ≥ 4 digits → phone contains; else trimmed name, case-insensitive contains; empty → all in range.
- Action `rxUrlAction(appointmentId): Promise<string | null>` — signed URL for `prescriptionPdfPath` of the logged-in doctor's visit only.

- [ ] **Step 1: Failing tests** in `history.test.ts`: `"finds by phone digits in any format"` (`"+91 98765-43210"`, `"98765"` both hit, `"9876"` hits); `"finds by name ignoring case"`; `"only this doctor's visits"`; `"range and newest first"`; `"pages with before and reports more"` (limit 2 of 3 → `more:true`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; Supabase: `.eq("doctor_id")`, `.like("patient_phone", %d%)` or `.ilike("patient_name", %q%)` (escape `%`/`_`), `.gte/.lt starts_at`, `.order desc`, `.limit(limit+1)`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** UI: search field + period pills (This week/This month/All, default This month, in the top-bar slot) in URL params; list left with Load more; patient panel right (details, all visits via `patientAppointments`, View prescription PDF via `rxUrlAction`, Book again → `/add?phone=`); phone: panel in `Sheet`. `reveal` on rows.
- [ ] **Step 6:** Browser: search `99999` and `test patient` find test data; panel opens; 375 sheet; light+dark; a11y ≥ 95.
- [ ] **Step 7:** Commit `feat: History with search by phone or name`.

### Task 7: Reports

**Files:** Modify `src/app/(dash)/reports/page.tsx`, `src/app/(dash)/reports/charts.tsx`, `src/lib/clinic/reports.ts` (+ test) only if a period filter needs new data

**Interfaces:** Consumes `buildReports` (existing). Produces period param `?p=today|week|month` (default month).

- [ ] **Step 1:** If `buildReports` lacks today/week totals for the pills, add a failing test `"totals for today, this week and this month"` first, then implement.
- [ ] **Step 2:** Layout: pills, 4 stats, status ring, collection line, horizontal bar card (WhatsApp vs reception, New vs returning), right Activity column with person filter (existing).
- [ ] **Step 3:** Verify 1280×800 no page scroll; light+dark; suite green.
- [ ] **Step 4:** Commit `feat(ui): Reports redesign`.

### Task 8: Settings

**Files:** Modify `src/app/(dash)/settings/page.tsx`, `src/app/(dash)/settings/sections.tsx`

- [ ] **Step 1:** Three-column grid ≥ 1280 (Hours | Fee + Block | Rx setup + Staff), two columns ≥ 768, stacked on phone; Save buttons `<Morph>` Save → Saved; removed staff row `leave`.
- [ ] **Step 2:** Verify as before; receptionist view still hides Staff/Rx setup.
- [ ] **Step 3:** Commit `feat(ui): Settings redesign`.

### Task 9: Final checks

- [ ] **Step 1:** `npx vitest run && npx tsc --noEmit && npx biome check src && npx -y pnpm@12.11.2 exec next build` → clean.
- [ ] **Step 2:** Every page at 375/768/1280/1440, light+dark; Lighthouse a11y ≥ 95 on /login, /signup, /today, /add, /history, /reports, /settings; screenshots to the user.
- [ ] **Step 3:** Tell the user to add `NEEED_ADMIN_PHONE` in Vercel (digits, e.g. 91XXXXXXXXXX); ask before pushing.
