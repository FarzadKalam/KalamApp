-- Goal: replace the old textual billboard taxpayer day unit with the official numeric code.

alter table if exists public.billboards
  alter column taxpayer_measure_unit_code set default '16104';

update public.billboards
set taxpayer_measure_unit_code = '16104'
where upper(coalesce(btrim(taxpayer_measure_unit_code), '')) in ('', 'DAY');
