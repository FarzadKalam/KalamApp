alter table public.personas
  add column if not exists access_channel text,
  add column if not exists sales_cycle text;
