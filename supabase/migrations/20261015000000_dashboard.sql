-- Web dashboard (Part A): patient details, fee per visit, staff keys, activity log, login limit.
-- RLS on with no policies: only the server (secret key) reads/writes.

alter table appointments
  add column patient_age smallint check (patient_age between 0 and 120),
  add column patient_gender text check (patient_gender in ('M', 'F', 'O')),
  add column patient_area text,
  add column source text not null default 'whatsapp' check (source in ('whatsapp', 'reception')),
  add column fee integer check (fee >= 0),
  add column created_by text,
  add column completed_by text;

alter table doctors
  add column standard_fee integer not null default 0 check (standard_fee >= 0),
  add column address text;

create table staff (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors on delete cascade,
  role text not null check (role in ('doctor', 'reception')),
  name text not null,
  key_hash text unique not null,
  key_version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_active_at timestamptz
);
create index staff_doctor on staff (doctor_id);

create table activity (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references doctors on delete cascade,
  actor text not null,
  staff_id uuid references staff on delete set null,
  action text not null,
  appointment_id uuid references appointments on delete set null,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index activity_doctor_at on activity (doctor_id, at desc);

create table login_attempts (
  ip text not null,
  at timestamptz not null default now()
);
create index login_attempts_ip_at on login_attempts (ip, at);

alter table staff enable row level security;
alter table activity enable row level security;
alter table login_attempts enable row level security;
