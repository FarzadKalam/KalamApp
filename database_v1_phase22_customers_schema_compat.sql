-- Phase 22: Customers schema compatibility (missing columns + full_name backfill)
-- Date: 2026-03-20
-- Type: additive / non-breaking

begin;

alter table if exists public.customers
  add column if not exists person_type text not null default 'real',
  add column if not exists national_code text,
  add column if not exists national_id text,
  add column if not exists registration_number text,
  add column if not exists economic_code text,
  add column if not exists postal_code text,
  add column if not exists total_paid_amount numeric(18,2) not null default 0;

-- Optional compatibility: move old national_identifier values into national_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'national_identifier'
  ) THEN
    EXECUTE '
      UPDATE public.customers
      SET national_id = COALESCE(NULLIF(national_id, ''''), national_identifier)
      WHERE COALESCE(NULLIF(national_identifier, ''''), '''') <> '''';
    ';
  END IF;
END
$$;

update public.customers
set person_type = 'real'
where coalesce(person_type, '') not in ('real', 'legal');

alter table if exists public.customers
  drop constraint if exists chk_customers_person_type;

alter table if exists public.customers
  add constraint chk_customers_person_type
  check (person_type in ('real', 'legal'));

-- Backfill full_name for empty rows with latest naming logic
update public.customers
set full_name = trim(
  regexp_replace(
    case
      when coalesce(person_type, 'real') = 'legal' then
        concat_ws(' - ',
          nullif(trim(legal_name), ''),
          nullif(trim(business_name), '')
        )
      else
        concat_ws(' - ',
          nullif(trim(concat_ws(' ', nullif(prefix, ''), nullif(first_name, ''), nullif(last_name, ''))), ''),
          nullif(trim(business_name), '')
        )
    end,
    '\s+',
    ' ',
    'g'
  )
)
where coalesce(full_name, '') = '';

commit;
