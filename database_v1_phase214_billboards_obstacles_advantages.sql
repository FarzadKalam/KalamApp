-- Add textual context fields for billboards basic info.
alter table public.billboards
  add column if not exists obstacles text,
  add column if not exists advantages text;
