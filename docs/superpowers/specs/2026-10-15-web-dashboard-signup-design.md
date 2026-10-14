# Web Dashboard, Doctor Sign-up & Payments — Design

Date: 2026-10-15. Builds on `2026-10-13-whatsapp-booking-design.md` (the WhatsApp bot, live on neeed-booking.vercel.app).

## Goal and positioning
Neeed is deliberately small: WhatsApp booking + prescriptions + three patient languages + a small dashboard. No app to install, **no per-patient charges**, one flat price, everything included. The web is **only for the doctor and the doctor's receptionist** — patients keep using WhatsApp.

Success: a doctor (or receptionist) can do on a phone browser everything the WhatsApp doctor menu does, book patients who phone in, and see logs, collection and traction; a new doctor can sign up and pay without the founder's involvement; paying is the filter against fake sign-ups.

## Build order (each part gets its own implementation plan)
- **Part A — Dashboard + patient details.** Login, Today, Add patient, Reports, Settings; age / gender / area in WhatsApp booking; fee per visit.
- **Part B — Sign-up, payments, admin.** `/signup`, Razorpay (monthly / yearly, auto-pay), founding offer, expiry, `/admin`.

Out of scope: patient-facing web, feature tiers, refunds of any kind, Embedded Signup (needs Meta App Review; a later spec), GST invoicing, multi-doctor clinics.

## Core decisions
1. **One random secret key per person — no username, no password.** The doctor has a `DR-` key; each receptionist has their own `RC-` key, created by the doctor and linked to that doctor's clinic. Separate keys so every action records **who did it**. Receptionists have the same daily powers as the doctor except managing staff keys.
2. **Same rules as the bot.** All web actions run on the server through the existing `Store` and bot logic (`freeSlots`, closures, blocks, `completeVisit`, cancel/notify). A web and a WhatsApp booking can never clash (same DB unique index on confirmed slots).
3. **Same-day only** for every booking path (web Add patient and WhatsApp).
4. **Zero Meta cost stays.** Web actions message a patient only if that patient's 24 h window is open (same `windowOpen` rule); otherwise nothing is sent.
5. **Fee is saved on each visit when it is completed.** Changing the standard fee never changes old visits (Jan–May at ₹300 stay ₹300 after a June change to ₹500).
6. **Patient mobile = WhatsApp number**, so the patient can later fetch prescriptions themselves via WhatsApp → My prescriptions.
7. **One plan, everything included.** ₹1,999 / month or ₹19,990 / year (2 months free). Founding-doctor price for the first N doctors (N = 10, price and N set in admin). **No refunds** — no refund flow or button anywhere.
8. **Responsive, mobile first.** Every page works at 375 px wide; bottom tab bar on phones, side menu from 768 px.
10. **Premium design.** The dashboard must feel like a product the doctor is proud to have paid for: award-level, minimal, modern (see *Design direction*).
9. Doctor side stays English; the patient bot's languages are unchanged (picked per conversation).

## Part A — Dashboard + patient details

### Keys, login and session
- **Key format:** a role prefix + 12 random characters from an unambiguous alphabet (no 0/O/1/I/L), grouped: `DR-K7QP-92XM-4TWH` (doctor), `RC-M3VN-8QKD-2HJX` (receptionist). Nothing derived from name or address (~10¹⁸ combinations). Typed case-insensitively; dashes and spaces ignored.
- Stored only as an HMAC (`ACCESS_CODE_PEPPER`), never in plain text. **Shown once** when created, with Copy and Download (.txt) buttons and "save this now".
- `/login`: one field "Your key" → server finds the staff member → sets `neeed_session` (httpOnly, Secure, SameSite=Lax): HMAC-SHA256-signed `{staffId, keyVersion, exp}` with `SESSION_SECRET`. The device **stays logged in for 30 days** (no typing the key every morning); after that, or after Log out, the key is entered once more.
- A new key for a person bumps that person's `key_version`, so only their old sessions stop working.
- Brute force: at most 10 failed attempts per IP per 15 minutes (table `login_attempts`), then "Too many tries, wait 15 minutes".
- Every dashboard request/action re-checks the session, that the staff member is still active, and (Part B) that the clinic's plan is paid. Logout clears the cookie.
- The pilot doctor gets a `DR-` key via a one-off script in Part A (admin in Part B).

### Staff (doctor only)
- Settings → **Staff**: list of receptionists (name, added on, last active).
- **Add receptionist**: enter their name → `RC-` key shown once.
- **Remove**: their devices are logged out at once; their past actions keep their name.
- **New key** for any receptionist, or for the doctor themself (while logged in). A doctor who lost the key on every device gets a new one from `/admin`.

### Who did what
- Every booking, completion, cancellation, fee change, close/open, block and settings change records the actor: a staff member (`Dr. Sharma`, `Riya (Reception)`), the doctor bot (`Dr. Sharma (WhatsApp)`), or the patient (`Patient (WhatsApp)`).
- Patient cards show it ("Added by Riya · 10:42 AM", "Completed by Dr. Sharma").
- Reports → **Activity**: the latest 200 actions with who, what, when; filter by person.

### Design direction (premium)
- **Feel:** calm, confident, expensive — a product a doctor is proud to have paid for. Minimal: one task per screen, generous white space, no clutter, no decoration that isn't information.
- **Surfaces:** frosted-glass header and bottom bar (backdrop blur over a soft gradient); content on soft, slightly raised cards (neumorphic-inspired shadows) — but with **real borders and WCAG AA contrast** for all text and controls, so it stays readable in a bright clinic. Touch targets ≥ 44 px.
- **Type:** one modern variable sans via `next/font` (e.g. Plus Jakarta Sans or Manrope) with a clear scale; numbers in tabular figures for times, fees and counts.
- **Colour:** neutral base (warm off-white / deep ink), **one** accent (deep teal-green, matching the prescription PDF), semantic colours only for status (waiting / done / cancelled). Light and dark themes from the same tokens.
- **Motion:** short, purposeful (150–250 ms) — card press, sheet open, number count-up on Reports; respects `prefers-reduced-motion`.
- **Components:** bottom sheets on phones for actions (Mark complete, Cancel, Add patient time picker), skeleton loading, empty states that say what to do next, inline validation, toasts for "Saved".
- **Quality bar:** every screen checked at 375 px and desktop, in light and dark, before each push; Lighthouse accessibility ≥ 95.

### Layout
- Header: clinic name, Open/Closed-today switch, menu.
- Tabs: **Today · Add patient · Reports · Settings** (bottom bar < 768 px, side menu ≥ 768 px).
- Built with the existing Tailwind v4, lucide-react icons, recharts for graphs.
- **Cleanup:** the old demo (`src/app/page.tsx`, `src/components/*`, `src/context/*`, `src/utils/supabase/*` + `src/middleware.ts` if unused) and unused packages (e.g. framer-motion) are removed; `/` becomes a short page with **Log in** and **Sign up**. **Next.js upgraded to the latest stable release** first, following its upgrade guide in `node_modules/next/dist/docs/` (Next 16 renames `middleware.ts` → `proxy.ts`).

### Today
- Top: ⏳ waiting · ✅ done · ❌ cancelled · 💰 today's collection.
- Open / Closed today switch. Closing over confirmed bookings → dialog **Cancel & notify** / **Keep bookings** (same as the bot).
- Patients grouped Morning / Afternoon / Evening / Other times (same grouping as the bot's Today's patients), time order, search by name or number.
- Card: time · name · age · gender · mobile (tap to call) · 📱 WhatsApp or 🏥 Reception · status.
  - **Mark complete** → prescription screen (the existing `/rx` form, reused inside the dashboard, no token needed) with a **Fee** field pre-filled with the standard fee, editable for this visit (e.g. ₹0 follow-up). Type medicines, or upload a photo, or complete without a prescription. A PDF preview before Send, like the bot. Completing stores the fee.
  - **Cancel** → optional reason → `CANCELLED`, `cancelled_by = doctor`; patient told only if their window is open.
  - Completed visits show **Edit fee**.

### Add patient (receptionist or doctor)
- **WhatsApp mobile no.** (required; 10-digit Indian number or with country code, stored as digits with country code like the bot does). Note under it: *"Enter the patient's WhatsApp number. They can then download their prescription anytime from WhatsApp → My prescriptions."*
- Name (required) · Age (required, 0–120) · Gender (Male / Female / Other, required) · Area (optional) · Reason (optional).
- Typing a known number pre-fills name, age, gender, area from that patient's last visit (editable).
- Pick a free time today, grouped by part of the day. Submit → `CONFIRMED`, `source = reception`. Slot just taken → "That time was just taken" and the slot list refreshes.
- No WhatsApp message to the patient unless their window is open (then a short English confirmation; the patient bot's language is per conversation and unknown here).

### Reports
- 💰 Collection: today, this month, monthly bar graph (last 12 months) — sum of `fee` of COMPLETED visits.
- 👥 Patients per day (last 30 days) and per month (last 12) — COMPLETED visits.
- 🆕 New vs returning per month — a visit is "new" if that doctor has no earlier appointment with the same `patient_phone`.
- 📱 WhatsApp vs 🏥 Reception bookings per month (`source`).
- ❌ Cancellations per month, split by patient / doctor.
- Computed on the server from `appointments`; fine for a single clinic's volume.

### Settings
- Clinic hours + lunch break + time per patient — same validation as the bot (`crosses`, lunch inside a period, etc.). Changing hours never cancels bookings.
- **Standard fee** (₹, whole rupees, default 0 until set).
- Block time: a date (today + next 6 days, as the bot) and Whole day / Morning / Afternoon / Evening / custom range; clash dialog as the bot.
- Prescription setup: registration number; signature image upload (PNG/JPG ≤ 2 MB) with preview.
- Log out.

### WhatsApp booking: age, gender, area
- The name question becomes **name and age in one message** ("Ramesh Kumar, 45" or "45 Ramesh Kumar" — the number before or after the name is the age, 0–120). If no age is found, the bot asks just the age. Then **Gender** (3 buttons Male / Female / Other, translated) → **Area** (typed, or Skip) → the existing part-of-day step.
- "Yes, {last name}" also reuses the last gender and area; the age is still asked.
- Back works on every new step. Typed `back` too.
- Doctor's "New appointment booked" alert adds age, gender, area.
- New strings added to `patient-text.ts` in all three languages, within WhatsApp limits (tested).

### Data changes (Part A migration)
- `appointments`: `patient_age smallint`, `patient_gender text check in ('M','F','O')`, `patient_area text`, `source text not null default 'whatsapp' check in ('whatsapp','reception')`, `fee integer` (rupees; set on completion).
- `doctors`: `standard_fee integer not null default 0`, `address text`.
- `staff (id uuid, doctor_id, role text check in ('doctor','reception'), name text, key_hash text unique, key_version integer default 1, active boolean default true, created_at, last_active_at)`. One `doctor` row per doctor.
- `activity (id, doctor_id, actor text, staff_id uuid null, action text, appointment_id uuid null, detail jsonb, at timestamptz)`.
- `appointments`: also `created_by text`, `completed_by text` (actor labels, for the cards).
- `login_attempts (ip text, at timestamptz)`.
- Existing rows: `source = 'whatsapp'`, age/gender/area null (shown as "—").
- RLS stays on with no policies: only the server (secret key) reads/writes.

## Part B — Sign-up, payments, admin

### Sign-up and first payment
1. `/signup`: Name · Clinic name · **Clinic address** (also printed on the prescription PDF) · **WhatsApp mobile no.** (*"Your own WhatsApp number. You'll manage the clinic and get booking alerts here."*) · Email · Registration no. · City / State. Creates a doctor with `status = pending`.
2. Plan: **Monthly ₹1,999** or **Yearly ₹19,990**; while founding places are left, the founding price is shown instead with "X of N left" (founding yearly = 10 × founding monthly). ☑ **Auto-pay** ticked by default; can be unticked.
3. Pay with Razorpay Checkout. Auto-pay → Razorpay Subscription (UPI Autopay or card mandate). Unticked → one-time Order.
4. Payment verified on the server (Checkout signature + webhook) → `status = active`, `paid_until` set, payment row stored, founding place taken if applicable → the doctor's **`DR-` key shown once** with Copy / Download and "save this now".

### Renewal and expiry
- Auto-pay: webhook `subscription.charged` extends `paid_until` and records the payment.
- Manual: from 7 days before `paid_until`, a dashboard banner "Your plan ends on {date} — Renew" → pay → `paid_until` extended from the old end date.
- Auto-pay can be switched off in Settings (cancels the Razorpay subscription at period end); access lasts until `paid_until`.
- After `paid_until + 2 days` (grace): dashboard shows only a Renew screen; the patient bot on that doctor's number stays silent (normal WhatsApp); the doctor bot replies "Your Neeed plan has ended. Renew at {url}." No data is deleted; paying restores everything.
- **No refunds.**
- Risk to check with Razorpay: UPI Autopay debits above ₹15,000 may need the customer to approve each debit, so yearly auto-pay may work best via card mandate; the plan page says so if Razorpay confirms it.

### Admin (`/admin`)
- Password from `ADMIN_PASSWORD` (Vercel secret); separate signed cookie, 12 hours; same failed-attempt limit.
- **Doctors**: status, plan, paid until, founding, last payment, WhatsApp connected yes/no, staff count; switch on/off; **issue a new doctor key** (shown once; logs that doctor's devices out); **set paid until** (for cash / bank transfer).
- **Payments**: list only (no refund buttons).
- **Settings**: monthly price, yearly price, founding monthly price, founding places, founding offer on/off.

### Data changes (Part B migration)
- `doctors`: `email text`, `city text`, `state text`, `status text not null default 'active' check in ('pending','active','off')`, `plan text check in ('monthly','yearly')`, `paid_until timestamptz`, `autopay boolean not null default true`, `founding boolean not null default false`, `razorpay_customer_id text`, `razorpay_subscription_id text`; `business_phone_number_id` becomes nullable (doctor can use the web before their number is connected). Existing pilot doctor: `active`, `paid_until` far future.
- `payments (id, doctor_id, amount, plan, period_start, period_end, razorpay_payment_id unique, razorpay_order_id, razorpay_subscription_id, paid_at)`.
- `app_settings` (single row): `monthly_price 1999`, `yearly_price 19990`, `founding_price`, `founding_slots 10`, `founding_enabled`.
- Webhook `/api/razorpay/webhook` verifies `X-Razorpay-Signature`; idempotent on `razorpay_payment_id`.

### Secrets (Vercel env, never in chat or code)
`SESSION_SECRET`, `ACCESS_CODE_PEPPER`, `ADMIN_PASSWORD`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.

### Founder's tasks outside code
Razorpay account for NEEED Associates (test mode first; KYC for live) · Vercel Pro before real payments · set the secrets above.

## Error handling
- Every server action validates input (phone digits, age range, gender enum, fee ≥ 0, slot still free) and returns a plain message the form shows inline; nothing half-saved (DB unique index guards double booking).
- Lost or tampered session → back to `/login`. Admin likewise.
- Razorpay webhook: bad signature → 400 and ignored; repeat events → no double extension.
- PDF / storage failures on Mark complete → visit stays CONFIRMED, message "Couldn't save, try again".

## Testing
- Vitest (no new test framework), memory store as today: session sign/verify/expiry/version bump; key generate/normalise/hash and DR/RC roles; receptionist add/remove/new key and permission (no staff management); actor recorded on every action; login rate limit; name+age parsing ("Ramesh Kumar, 45", "45 Ramesh", missing age); fee snapshot on completion and fee edit; Add patient validation, prefill and slot clash; reports aggregation (collection, new vs returning, source, cancellations); WhatsApp age/gender/area steps incl. Back and "Yes, name"; all new strings in 3 languages within WhatsApp limits; Razorpay signature checks, idempotent webhook, paid_until extension from old end, founding place count; expiry rules (grace, bot silence, doctor bot notice).
- Browser check of every page at 375 px and desktop, light theme, before each push.
