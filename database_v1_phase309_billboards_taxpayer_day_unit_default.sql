-- Goal: hardcode the official taxpayer-system day unit code for billboard items.

alter table if exists public.billboards
  alter column taxpayer_measure_unit_code set default 'DAY';

update public.billboards
set taxpayer_measure_unit_code = 'DAY'
where coalesce(btrim(taxpayer_measure_unit_code), '') = '';
