-- WhatsApp booking bot. Only the server (secret key) reads/writes: RLS on, no policies.
create table doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  clinic_name text not null,
  business_phone_number_id text unique not null,
  personal_phone text unique not null,
  registration_number text,
  signature_path text,
  working_days smallint[] not null default '{0,1,2,3,4,5,6}',
  day_start text not null default '10:00',
  day_end text not null default '22:00',
  slot_minutes smallint not null default 30,
  morning_end text not null default '14:00',
  afternoon_end text not null default '18:00',
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors on delete cascade,
  patient_phone text not null,
  patient_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'CANCELLED', 'COMPLETED')),
  notes text,
  cancel_reason text,
  cancelled_by text check (cancelled_by in ('patient', 'doctor')),
  prescription_text text,
  prescription_image_path text,
  prescription_pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index appointments_one_confirmed_per_slot on appointments (doctor_id, starts_at) where status = 'CONFIRMED';
create index appointments_doctor_patient on appointments (doctor_id, patient_phone);

create table closures (
  doctor_id uuid references doctors on delete cascade,
  date date,
  primary key (doctor_id, date)
);

create table blocks (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);
create index blocks_doctor on blocks (doctor_id, starts_at);

create table conversations (
  phone_number_id text,
  wa_user text,
  state text not null default 'idle',
  ctx jsonb not null default '{}',
  last_inbound_at timestamptz,
  primary key (phone_number_id, wa_user)
);

create table processed_messages (
  id text primary key,
  at timestamptz not null default now()
);

alter table doctors enable row level security;
alter table appointments enable row level security;
alter table closures enable row level security;
alter table blocks enable row level security;
alter table conversations enable row level security;
alter table processed_messages enable row level security;

insert into storage.buckets (id, name, public) values ('signatures', 'signatures', false), ('prescriptions', 'prescriptions', false);
