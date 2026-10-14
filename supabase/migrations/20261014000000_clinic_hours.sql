-- Per-period clinic hours (a period with null start/end is Off), a daily lunch break, and a setup flag.
alter table doctors
  add column morning_start text,
  add column afternoon_start text,
  add column evening_start text,
  add column evening_end text,
  add column lunch_start text,
  add column lunch_end text,
  add column hours_set boolean not null default false;

update doctors set
  morning_start = day_start,
  afternoon_start = morning_end,
  evening_start = afternoon_end,
  evening_end = day_end;

alter table doctors
  alter column morning_end drop not null,
  alter column morning_end drop default,
  alter column afternoon_end drop not null,
  alter column afternoon_end drop default,
  drop column day_start,
  drop column day_end;

-- New doctors start with 10 AM–10 PM split at 2 PM and 6 PM, 30-minute slots, until setup confirms.
alter table doctors
  alter column morning_start set default '10:00',
  alter column morning_end set default '14:00',
  alter column afternoon_start set default '14:00',
  alter column afternoon_end set default '18:00',
  alter column evening_start set default '18:00',
  alter column evening_end set default '22:00';
