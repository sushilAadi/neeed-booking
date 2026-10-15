# Dashboard redesign — premium look, motion, History, Request access

Date: 2026-10-15 · Status: approved in chat, awaiting spec review
Builds on: `2026-10-15-web-dashboard-signup-design.md` (Part A, live since `3ac563e`).

## Why

The doctor didn't like the Part A look. They want a modern, premium dashboard in the style of their reference image (soft gradient, white rounded cards, black pill selection, colourful status accents), with polished motion, and pages that use the full screen so the doctor scrolls as little as possible. They also want to see visit history and search it by phone number, and a sign-up page.

## What the user said vs. what I assumed

**Said:** match the reference; premium, "award-winning" feel; motion with cube-motion; less scrolling, use the full space with proper spacing, minimal design; Lucide icons (animated or normal); multiple pages; a History page searchable by number; responsive on every device; login and sign-up get the same feel.

**Assumed (confirmed in chat):** laptop/desktop at the clinic is the main screen (1280–1440 px); the sign-up page is a request-access form until real self-sign-up (Part B); fonts stay Matangi; light and dark themes; normal Lucide icons with CSS hover motion (no extra animation library).

## Success criteria

- At 1280 × 800 and wider, Today, Add patient, Mark complete, Settings and Reports fit without page scroll; long lists scroll inside their card.
- 375 / 768 / 1280 / 1440 px, light and dark, all look intentional (no overflow, no horizontal scroll).
- Lighthouse accessibility ≥ 95 on every dashboard page; WCAG AA contrast for text.
- Every motion uses cube-motion (`rise`, `leave`, `morph`, `reveal`) or a CSS press/hover; reduced motion turns them off.
- Every Part A behaviour still works (all existing tests green).

## Visual system

- **Background:** fixed soft gradient — warm peach top-left → pale blue right (light); deep graphite/navy (dark). Defined as tokens on `:root` with a dark override.
- **Cards:** white surface, radius 28 px (inner elements 16–20 px), soft two-layer shadow plus a faint hairline for contrast, padding 24 px (16 px on phones).
- **Buttons:** primary = near-black pill with white text; secondary = white pill with hairline; icon buttons = 44 px white circles. Press: `scale 0.97`. Hover: 2 px lift on cards and buttons.
- **Status colours (only place colour appears):** waiting = orange, done = blue, cancelled = red, money = green; purple and yellow only inside charts. Text on tints uses the darkest stop of the same hue.
- **Type:** Matangi. Page title 40 px (32 on phones), weight 500, with a 15 px muted line above it. Numbers tabular.
- **Icons:** `lucide-react`, 20 px, stroke 1.75; a small CSS nudge on hover.
- **Spacing scale:** 4 / 8 / 12 / 16 / 24 / 32 px; grid gaps 16 px (desktop 20 px).

## Shell and navigation

- **≥ 768 px:** left rail of round icon buttons — Today, Add patient, History, Reports, Settings; Log out at the bottom. Active = black circle. Top bar: Neeed logo, page-level period pills in the centre where a page has them (History, Reports), Open/Closed-today switch, name + role on the right.
- **< 768 px:** frosted bottom tab bar with the same five icons; compact top bar (clinic, date, open/closed).
- Page body uses CSS grid filling `100dvh` minus the top bar on desktop; scrolling regions are the list cards, not the page.

## Motion (cube-motion)

| Moment | Motion |
|---|---|
| Page mount | `rise` on the page grid, `targets: "children"` (staggered cards) |
| Lists and below-the-fold cards | `reveal` |
| State labels: Save → Saved, Open today ↔ Closed today, status badge change, Request access → Thanks | `morph` |
| Toasts, cancelled card, removed staff row | `leave` (await, then remove) |
| Button press / card hover | CSS only |

Reduced motion is respected by the library; CSS hovers are wrapped in `prefers-reduced-motion: no-preference`.

## Pages

1. **Login** — split screen. Left: gradient brand panel, headline, three floating preview cards (queue row, "₹3,500 collected", WhatsApp booking) rising in. Right: white card with the key field and Log in, link to Request access. Phone: key card only.
2. **Request access** (`/signup`) — same split. Fields: doctor name, clinic name, city, WhatsApp number (Indian formats, normalised as in Add patient), email (optional). Submit → saved in `access_requests`; card morphs to "Thanks, we'll WhatsApp you within a day". Alert to the Neeed admin's WhatsApp (`NEEED_ADMIN_PHONE`) through the existing 24-hour-window delivery; if it can't send, the request is still saved. Max 5 requests per IP per hour.
3. **Today** — title + 4 stat cards (Waiting, Done, Cancelled, Collected). Left ⅔: queue card with Morning / Afternoon / Evening pills and search; compact rows (time, name, age · gender, status badge, actions: Mark complete, Edit fee, Cancel, Call); scrolls inside. Right ⅓: Next patient card with a large Mark complete; "Collected today" ring chart.
4. **Add patient** — left: form (WhatsApp number with prefill from the last visit, name, age, gender, area, reason). Right: free-time pills by period and a sticky Book button. One screen at 1280 × 800.
5. **Mark complete** (`/visit/[id]`) — left: patient details + medicines table (existing RxForm logic). Right: fee, Preview PDF, Complete and send, Complete without prescription.
6. **History** (`/history`, new) — search (phone digits or name), period pills This week / This month / All (default This month). Left: visits list (date, patient, status, fee, source), newest first, 50 per page with "Load more". Right: selected patient panel — details, every visit (reason, fee, status, completed by), "View prescription PDF" for visits that have one (signed URL), "Book again" (opens Add patient prefilled). Phone: panel opens as a sheet.
7. **Reports** — period pills Today / This week / This month; 4 stat cards; status ring chart; collection trend line; horizontal-bar card for WhatsApp vs reception and New vs returning (reference "Invoice overview" style); right column Activity list with the person filter (reference "Open tickets" style).
8. **Settings** — three-column card grid: Clinic hours | Standard fee + Block time | Prescription setup + Staff (doctor only). Stacks on phones. Behaviour unchanged.

## Data and server

- **History:** `searchVisits(store, doctorId, { q, from, to, limit, before })` in `src/lib/clinic/history.ts`. `q` with ≥ 4 digits matches the phone (contains), otherwise a case-insensitive name match; empty `q` lists the range. New store method `searchAppointments` (Supabase: `ilike` on name, `like` on phone, range on `starts_at`, ordered desc, limit; memory store mirrors it). Only the logged-in doctor's rows.
- **Request access:** migration adds `access_requests (id, created_at, doctor_name, clinic_name, city, phone, email, ip, status default 'new')`, RLS on with no public policies (service key only). `requestAccess(store, input, now)` validates and saves; rate limit reuses the `login_attempts` pattern (new kind or table column).
- No change to bookings, completion, fees, keys, sessions or the bots.

## Testing

- TDD for `searchVisits` (phone vs name, range, doctor isolation, paging) and `requestAccess` (validation, phone normalisation, rate limit, saved even when the alert fails).
- Full suite, `tsc`, biome, `next build` clean.
- Browser check of every page at 375 / 768 / 1280 / 1440 px, light and dark; no page scroll at 1280 × 800 for the one-screen pages; Lighthouse accessibility ≥ 95.

## Out of scope

Real doctor self-sign-up, plans and payments (Part B); admin page for access requests (read them in Supabase until Part B); animated-icon library; changes to the WhatsApp bots.

## Delivery

Branch `feat/whatsapp-bot`; nothing pushed until the user approves. Order: design tokens + shell → Login + Request access → Today → Add patient → Mark complete → History → Reports → Settings → final checks.
