# WhatsApp Booking Bot — Design (multi-doctor)

Date: 2026-10-13. Based on the "Sunrise Family Clinic" reference spec, adapted to the decisions below.

## Scope of this spec
The WhatsApp side only: the patient bot and the doctor bot, plus prescriptions.
Out of scope (separate plans later): web dashboard / calendar / availability date picker, Embedded Signup onboarding, subscription / billing / feature flags.

## Core decisions
1. **Multi-doctor.** Each doctor has their own WhatsApp Business number (Cloud API + coexistence, so the doctor still uses the WhatsApp Business app for normal chat). One **platform number** (owned by us) hosts the **doctor bot**.
   `doctors.personal_phone` = whichever WhatsApp the doctor uses to talk to the doctor bot; it can be their own business number (a WhatsApp Business app account can message the platform number like any user), so no extra SIM is needed.
2. **Routing.** For an incoming message on `phone_number_id`, from `from`:
   - `phone_number_id == WA_PLATFORM_PHONE_NUMBER_ID` and `from` matches a `doctors.personal_phone` → doctor bot for that doctor.
   - otherwise, if a doctor has `business_phone_number_id == phone_number_id` → patient bot for that doctor. (This lets a single Meta test number act as both the platform and one doctor's number during the pilot.)
   - otherwise, on the platform number → reply `"This number is for registered doctors only."`; on any other number → ignore.
3. **Same-day booking only.** Patients can book only today's slots. No date picker.
4. **Booking is instant.** Status `CONFIRMED` on creation. Statuses: `CONFIRMED | CANCELLED | COMPLETED`.
5. **Zero Meta cost.** Never send template messages. A message to someone other than the current sender is sent only if that person's last inbound message to that number was < 24 h ago; otherwise it is skipped (data stays in the DB / dashboard).
6. **Availability.** Open by default. Per doctor: `working_days` (default all 7), `day_start` 10:00, `day_end` 22:00, `slot_minutes` 30, `morning_end` 14:00, `afternoon_end` 18:00. Morning = day_start–morning_end, Afternoon = morning_end–afternoon_end, Evening = afternoon_end–day_end. A doctor can close a date (closure) or block a time range.
7. **Closing/blocking over existing bookings** → warn the doctor with two buttons: **Cancel & notify** (cancel each clashing CONFIRMED appointment with `cancelled_by=doctor` and message each patient) or **Keep bookings** (close/block for new bookings only).
8. **Timezone** Asia/Kolkata for all display and day boundaries; timestamps stored as `timestamptz`.
9. **Prescription.** The doctor marks a visit complete with text, a photo, or Skip. Text/photo → PDF (Rx No = `RX-` + first 8 chars of the appointment UUID, uppercased) → sent to the patient if the window is open, otherwise stored; the patient can fetch it any time via **My Prescriptions**.
10. **Idempotency.** Each WhatsApp message id is processed once.

## Patient bot (doctor's business number)
- Any message when not mid-flow and not in chat mode → menu (list, button "Choose an option"), body `"👋 Welcome to {clinic}. What would you like to do?"`, rows (only when applicable):
  `book` Book · `mine` My Appointments (has any today) · `cancel` Cancel (has a CONFIRMED appointment today) · `rx` My Prescriptions (has any prescription PDF) · `chat` Normal chat.
- Keywords at any time (case-insensitive, trimmed): `/book` or `book` → booking; `cancel` → cancel flow; `menu` or `hi` → menu.
- **Normal chat:** reply `"Sure — {doctor} will reply here personally. Type /book any time to book an appointment."`, state `chat`. In `chat` the bot stays silent unless the message is a keyword, or the previous inbound was ≥ 24 h ago (then show the menu).
- **Book:**
  1. If today is closed or not a working day → `"Sorry, {doctor} isn't taking bookings today. Please try again tomorrow."` → back to the menu state.
  2. Name: a returning patient (has a past appointment with this doctor) gets `"Welcome back! Your last visit was booked for "{name}". Tap below to reuse that name, or type a different patient's name."` + button `Yes, {name}` (title truncated to 20 chars). A new patient gets `"Sure! What's the patient's full name?"`.
  3. Period: `"Which part of today works for you?"` + up to 3 buttons `Morning (n)` / `Afternoon (n)` / `Evening (n)`, showing only periods with n > 0. If all are 0 → `"Sorry, no slots are left today."`.
  4. Time: a list (button "Choose a time"), rows = free slots in that period, title `10:00 AM–10:30 AM`. More than 10 free slots → the first 9 rows plus a row `more` titled `Later times`.
  5. Reason: `"Got it. Any specific concern or reason for the visit? (optional — type it, or tap Skip)"` + button `Skip`.
  6. Create. If the slot was taken meanwhile → `"Sorry, that time was just taken. Please pick another."` → back to step 3. On success → `"You're confirmed with {doctor} at {clinic}.\n\n📅 {Day}, {range}\n\nReply "cancel" any time to cancel this appointment."` and a doctor alert (if the doctor's window is open):
     `"New appointment booked ✅\n\nPatient: {name}\nPhone: +{phone}\n📅 {Day}, {range}\nReason: {notes or —}"`
- **My Appointments:** `"Today:"` + one line per appointment today `📅 {range} — {name} ({status})`; none → `"No appointments today."`
- **Cancel:** list of today's CONFIRMED appointments (button "Select appointment", row title = range, description = name) → `"Got it. Any reason for cancelling? (optional — type it, or tap Skip)"` + `Skip` → `"Your appointment has been cancelled."` + buttons `Book again` (id `book`) / `Menu` (id `menu`). Doctor alert: `"Appointment cancelled by patient ❌\n\nPatient: {name}\nPhone: +{phone}\n📅 {Day}, {range}\nReason: {reason or —}"`.
- **My Prescriptions:** a list of the last 10 appointments with a PDF (row title `{Day}`, description `{name}`, id `rx:{appointmentId}`) → sends the document.

## Doctor bot (platform number)
- **Forced setup** if `registration_number` or `signature_path` is null: `"Your prescription setup isn't done yet — let's finish that first."` → `"One-time setup: what's your medical registration number? (printed on every prescription slip — reply "setup" any time to change it later)"` → `"Now send a photo of your signature — sign on plain paper and photograph it."` (must be an image; otherwise repeat) → `"Setup saved. Reply "setup" any time to update your registration number or signature."` → menu.
- **Menu** (list, button "Choose an option"), body `"Hi {doctor}. What would you like to do?"`, rows: `today` Today · `close` Close today **or** `open` Open today (depending on today's closure) · `block` Block my time · `dcancel` Cancel appointment · `setup` Prescription setup.
- Keywords: `today`, `cancel`, `setup`, `close`, `open`, `block`, `menu`/`hi`.
- **Today:** `"Today's appointments:"` + numbered lines `{n}. {range} — {name} (+{phone}) [{status}]`; then, if any CONFIRMED, the list `"Tap a patient once their visit is done to mark it complete and add a prescription."` button `Mark complete`, rows id `done:{id}`, title name, description range. None → `"No appointments today."`
- **Mark complete:** `"Marking that visit complete. Type the prescription/notes, send a photo of it (caption optional), or tap Skip to finish with no prescription attached."` + `Skip`. Text → PDF with one medicine per line; photo → PDF with the photo embedded (caption as text above it); Skip → no PDF. Status `COMPLETED`. If a PDF was made and the patient's window is open → send the document `Prescription-{RxNo}.pdf`, caption `"Prescription from your visit on {Day}, {range} with {doctor}."`, and reply `"Saved and sent to the patient."`; if the window is closed → `"Saved. The patient's 24-hour window has closed, so they'll get it from "My Prescriptions" next time they message."`; Skip → `"Marked complete."`
- **Close today:** no CONFIRMED appointments today → close → `"Closed for today. Patients will be told you're not taking bookings."` With bookings → `"You have {n} confirmed appointment(s) today. What should happen to them?"` + buttons `Cancel & notify` / `Keep bookings`. Patient notice: `"Sorry, {doctor} has cancelled your appointment today ({range}). Reason: {reason or doctor unavailable}. Reply /book to pick another time if available."`
- **Open today:** remove today's closure → `"Open for bookings today."`
- **Block my time:** list of the next 7 dates including today (button "Choose a date", row title `{Day}`) → list `Whole day` / `Morning` / `Afternoon` / `Particular time` → for Particular time: `"What time range? Type it like "2pm-5pm" or "14:00-17:00"."` (invalid → `"Couldn't read that. Type it like "2pm-5pm" or "14:00-17:00"."`). Whole day = closure for that date. Clashes with CONFIRMED appointments → the same Cancel & notify / Keep bookings warning. Done → `"Blocked {Day} — {range}."`
- **Cancel appointment (doctor):** list of today's CONFIRMED (row id `dc:{id}`) → `"Any reason to give the patient? (optional — type it, or tap Skip)"` → cancel (`cancelled_by=doctor`) + patient notice (if the window is open) → `"Cancelled and the patient was notified."` (or `"Cancelled. The patient couldn't be messaged (24-hour window closed)."`).

## Prescription PDF
A4. Header: clinic name, subtitle "Prescription". Left `Dr. {name}`, `Reg. No: {reg}`; right `Rx No: {rx}`. Patient block: `Patient: {name}`, `Phone: +{phone}`, `Visit: {Day}, {range}`. A divider, then `Rx` followed by the lines (or the embedded photo). Bottom-right: the signature image, the doctor name, the Reg. No. Footer: `System-generated prescription — Rx No: {rx}, issued by {clinic}`.
