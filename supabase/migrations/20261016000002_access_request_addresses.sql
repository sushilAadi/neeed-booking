-- Request access: chamber address (required in the form), doctor address and registration number.
alter table access_requests
  add column clinic_address text,
  add column doctor_address text,
  add column registration_number text;
