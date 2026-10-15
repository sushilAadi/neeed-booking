-- Receptionist access, ticked by the doctor (see src/lib/auth/permissions.ts).
alter table staff add column permissions text[] not null default '{add,cancel,history}';
