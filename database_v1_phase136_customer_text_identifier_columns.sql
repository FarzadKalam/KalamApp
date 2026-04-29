-- Phase 136: Customer phone and identifier columns must be text

alter table if exists public.customers
  add column if not exists full_name text,
  add column if not exists person_type text not null default 'real',
  add column if not exists legal_name text,
  add column if not exists auto_name_enabled boolean not null default false,
  add column if not exists is_supplier boolean not null default false,
  add column if not exists is_employee boolean not null default false,
  add column if not exists related_employee_id uuid references public.profiles(id) on delete set null,
  add column if not exists national_code text,
  add column if not exists national_id text,
  add column if not exists registration_number text,
  add column if not exists economic_code text,
  add column if not exists industry text,
  add column if not exists postal_code text,
  add column if not exists portal_enabled boolean not null default false,
  add column if not exists portal_status text not null default 'disabled',
  add column if not exists preferred_notification_channel text not null default 'none',
  add column if not exists telegram_chat_id text,
  add column if not exists bale_chat_id text,
  add column if not exists rubika_chat_id text,
  add column if not exists portal_last_login_at timestamptz,
  add column if not exists portal_permissions_override jsonb not null default '{}'::jsonb,
  add column if not exists execution_process_draft jsonb not null default '{}'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb;

do $$
declare
  v_column text;
begin
  if to_regclass('public.customers') is null then
    return;
  end if;

  foreach v_column in array array[
    'mobile_1',
    'mobile_2',
    'phone',
    'assistant_phone',
    'postal_code',
    'national_code',
    'national_id',
    'registration_number',
    'economic_code',
    'accounting_code',
    'legacy_contact_code',
    'system_code'
  ]
  loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'customers'
        and column_name = v_column
        and data_type <> 'text'
    ) then
      execute format(
        'alter table public.customers alter column %I type text using %I::text',
        v_column,
        v_column
      );
    end if;
  end loop;
end $$;
