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
1. **One login per doctor: the access code.** Doctor and receptionist share it; no separate receptionist account, same powers. Issuing a new code (admin) logs every device out.
2. **Same rules as the bot.** All web actions run on the server through the existing `Store` and bot logic (`freeSlots`, closures, blocks, `completeVisit`, cancel/notify). A web and a WhatsApp booking can never clash (same DB unique index on confirmed slots).
3. **Same-day only** for every booking path (web Add patient and WhatsApp).
4. **Zero Meta cost stays.** Web actions message a patient only if that patient's 24 h window is open (same `windowOpen` rule); otherwise nothing is sent.
5. **Fee is saved on each visit when it is completed.** Changing the standard fee never changes old visits (Jan–May at ₹300 stay ₹300 after a June change to ₹500).
6. **Patient mobile = WhatsApp number**, so the patient can later fetch prescriptions themselves via WhatsApp → My prescriptions.
7. **One plan, everything included.** ₹1,999 / month or ₹19,990 / year (2 months free). Founding-doctor price for the first N doctors (N = 10, price and N set in admin). **No refunds** — no refund flow or button anywhere.
8. **Responsive, mobile first.** Every page works at 375 px wide; bottom tab bar on phones, side menu from 768 px.
9. Doctor side stays English; the patient bot's languages are unchanged (picked per conversation).

## Part A — Dashboard + patient details

### Login and session
- `/login`: one field "Access code" → server checks it → sets `neeed_session` (httpOnly, Secure, SameSite=Lax, 30 days): HMAC-SHA256-signed `{doctorId, codeVersion, exp}` with `SESSION_SECRET`. Same signing approach as the prescription link.
- Access code: 8 characters from an unambiguous alphabet (no 0/O/1/I), shown as `XXXX-XXXX`; typed case-insensitively, dashes and spaces ignored. Stored only as an HMAC (`ACCESS_CODE_PEPPER`), never in plain text.
- `doctors.access_code_version` is in the session; a new code bumps it, so old sessions fail.
- Brute force: at most 10 failed attempts per IP per 15 minutes (table `login_attempts`), then "Too many tries, wait 15 minutes".
- Every dashboard request/action re-checks the session and that the doctor is allowed in (Part B adds the paid/expired check). Logout clears the cookie.
- The pilot doctor gets a code via admin (Part B) or a one-off script in Part A.

### Layout
- Header: clinic name, Open/Closed-today switch, menu.
- Tabs: **Today · Add patient · Reports · Settings** (bottom bar < 768 px, side menu ≥ 768 px).
- Built with the existing Tailwind v4, lucide-react icons, recharts for graphs. The old demo (`src/app/page.tsx`, `src/components/*`, `src/context/*`) is removed; `/` becomes a short page with **Log in** and **Sign up** links.

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
- New steps after the name, in the patient's chosen language: **Age** (typed number 0–120; re-asked if not a number) → **Gender** (3 buttons Male / Female / Other, translated) → **Area** (typed, or Skip) → then the existing part-of-day step.
- "Yes, {last name}" also reuses the last gender and area; age is still asked.
- Back works on every new step. Typed `back` too.
- Doctor's "New appointment booked" alert adds age, gender, area.
- New strings added to `patient-text.ts` in all three languages, within WhatsApp limits (tested).

### Data changes (Part A migration)
- `appointments`: `patient_age smallint`, `patient_gender text check in ('M','F','O')`, `patient_area text`, `source text not null default 'whatsapp' check in ('whatsapp','reception')`, `fee integer` (rupees; set on completion).
- `doctors`: `access_code_hash text unique`, `access_code_version integer not null default 1`, `standard_fee integer not null default 0`.
- `login_attempts (ip text, at timestamptz)`.
- Existing rows: `source = 'whatsapp'`, age/gender/area null (shown as "—").
- RLS stays on with no policies: only the server (secret key) reads/writes.

## Part B — Sign-up, payments, admin

### Sign-up and first payment
1. `/signup`: Name · Clinic name · **WhatsApp mobile no.** (*"Your own WhatsApp number. You'll manage the clinic and get booking alerts here."*) · Email · Registration no. · City / State. Creates a doctor with `status = pending`.
2. Plan: **Monthly ₹1,999** or **Yearly ₹19,990**; while founding places are left, the founding price is shown instead with "X of N left" (founding yearly = 10 × founding monthly). ☑ **Auto-pay** ticked by default; can be unticked.
3. Pay with Razorpay Checkout. Auto-pay → Razorpay Subscription (UPI Autopay or card mandate). Unticked → one-time Order.
4. Payment verified on the server (Checkout signature + webhook) → `status = active`, `paid_until` set, payment row stored, founding place taken if applicable → **access code shown once** with a Copy button and "save this now".

### Renewal and expiry
- Auto-pay: webhook `subscription.charged` extends `paid_until` and records the payment.
- Manual: from 7 days before `paid_until`, a dashboard banner "Your plan ends on {date} — Renew" → pay → `paid_until` extended from the old end date.
- Auto-pay can be switched off in Settings (cancels the Razorpay subscription at period end); access lasts until `paid_until`.
- After `paid_until + 3 days`: dashboard shows only a Renew screen; the patient bot on that doctor's number stays silent (normal WhatsApp); the doctor bot replies "Your Neeed plan has ended. Renew at {url}." No data is deleted; paying restores everything.
- **No refunds.**
- Risk to check with Razorpay: UPI Autopay debits above ₹15,000 may need the customer to approve each debit, so yearly auto-pay may work best via card mandate; the plan page says so if Razorpay confirms it.

### Admin (`/admin`)
- Password from `ADMIN_PASSWORD` (Vercel secret); separate signed cookie, 12 hours; same failed-attempt limit.
- **Doctors**: status, plan, paid until, founding, last payment, WhatsApp connected yes/no; switch on/off; **issue new access code** (shown once; logs all devices out); **set paid until** (for cash / bank transfer).
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
- Vitest (no new test framework), memory store as today: session sign/verify/expiry/version bump; access code generate/normalise/hash; login rate limit; fee snapshot on completion and fee edit; Add patient validation, prefill and slot clash; reports aggregation (collection, new vs returning, source, cancellations); WhatsApp age/gender/area steps incl. Back and "Yes, name"; all new strings in 3 languages within WhatsApp limits; Razorpay signature checks, idempotent webhook, paid_until extension from old end, founding place count; expiry rules (grace, bot silence, doctor bot notice).
- Browser check of every page at 375 px and desktop, light theme, before each push.
