-- Sealed copy of each staff key so the doctor can view it in Settings (see sealKey).
alter table staff add column key_enc text;
