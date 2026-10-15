-- Doctors asking to join (sign-up page) until self-sign-up exists. Server (service key) only.
create table access_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  doctor_name text not null,
  clinic_name text not null,
  city text not null,
  phone text not null,
  email text,
  ip text not null,
  status text not null default 'new'
);
create index access_requests_ip_created on access_requests (ip, created_at);
alter table access_requests enable row level security;
