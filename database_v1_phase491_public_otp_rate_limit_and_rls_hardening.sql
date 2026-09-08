-- =====================================================
-- KalamApp - Phase 491 Public OTP Rate Limit & RLS Hardening
-- Date: 2026-09-09
-- Type: Security corrective / idempotent migration
-- هدف: بستن تولید مستقیم OTP عمومی، کنترل سمت‌سرور درخواست‌ها
-- و fail-closed کردن policyهای tenant-owned.
-- =====================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Public confirmation OTP request guard
-- -----------------------------------------------------------------------------
-- شناسه لینک، شماره و IP به صورت هش‌شده نگه‌داری می‌شوند؛ جدول برای clientها
-- هیچ policy ندارد و فقط function کنترل‌شدهٔ service_role به آن دسترسی دارد.
create table if not exists public.public_confirmation_otp_request_limits (
  id uuid primary key default extensions.uuid_generate_v4(),
  scope text not null check (scope in ('invoice_confirmation', 'delivery_confirmation')),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  phone_hash text not null check (phone_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text null check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null default now()
);

create index if not exists idx_public_confirmation_otp_limits_source_phone_time
  on public.public_confirmation_otp_request_limits (scope, source_hash, phone_hash, requested_at desc);

create index if not exists idx_public_confirmation_otp_limits_source_time
  on public.public_confirmation_otp_request_limits (scope, source_hash, requested_at desc);

create index if not exists idx_public_confirmation_otp_limits_ip_time
  on public.public_confirmation_otp_request_limits (scope, ip_hash, requested_at desc)
  where ip_hash is not null;

alter table public.public_confirmation_otp_request_limits enable row level security;
revoke all on table public.public_confirmation_otp_request_limits from public, anon, authenticated;

create or replace function public.allow_public_confirmation_otp_request(
  p_scope text,
  p_source_token text,
  p_module text,
  p_party text,
  p_phone text,
  p_client_ip text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := btrim(coalesce(p_scope, ''));
  v_source_token text := btrim(coalesce(p_source_token, ''));
  v_module text := btrim(coalesce(p_module, ''));
  v_party text := btrim(coalesce(p_party, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_client_ip text := nullif(btrim(coalesce(p_client_ip, '')), '');
  v_source_hash text;
  v_phone_hash text;
  v_ip_hash text;
  v_last_request_at timestamptz;
  v_window_count integer;
  v_request_id uuid;
  v_retry_after integer;
begin
  if v_scope not in ('invoice_confirmation', 'delivery_confirmation')
     or v_source_token = ''
     or length(v_source_token) > 256
     or v_module not in ('invoices', 'purchase_invoices', 'delivery_forms')
     or (v_scope = 'delivery_confirmation' and v_party not in ('delivered_by', 'received_by'))
     or (v_scope = 'invoice_confirmation' and v_party <> '')
     or v_phone !~ '^09[0-9]{9}$' then
    return jsonb_build_object('allowed', false, 'error', 'invalid_otp_request');
  end if;

  v_source_hash := encode(
    extensions.digest(v_scope || chr(31) || lower(v_module) || chr(31) || lower(v_party) || chr(31) || lower(v_source_token), 'sha256'),
    'hex'
  );
  v_phone_hash := encode(extensions.digest(v_phone, 'sha256'), 'hex');
  if v_client_ip is not null
     and length(v_client_ip) <= 64
     and v_client_ip ~ '^[0-9A-Fa-f:.]+$' then
    v_ip_hash := encode(extensions.digest(lower(v_client_ip), 'sha256'), 'hex');
  else
    v_ip_hash := null;
  end if;

  -- همزمانی درخواست‌های یک لینک را serialize می‌کند تا محدودیت با چند درخواست
  -- موازی دور زده نشود.
  perform pg_advisory_xact_lock(hashtext(v_scope || ':' || v_source_hash));

  delete from public.public_confirmation_otp_request_limits
  where requested_at < now() - interval '24 hours';

  select max(requested_at)
  into v_last_request_at
  from public.public_confirmation_otp_request_limits
  where scope = v_scope
    and source_hash = v_source_hash
    and phone_hash = v_phone_hash;

  if v_last_request_at is not null and v_last_request_at > now() - interval '90 seconds' then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_last_request_at + interval '90 seconds' - now())))::integer);
    return jsonb_build_object(
      'allowed', false,
      'error', 'rate_limited',
      'retry_after_seconds', v_retry_after
    );
  end if;

  select count(*)
  into v_window_count
  from public.public_confirmation_otp_request_limits
  where scope = v_scope
    and source_hash = v_source_hash
    and requested_at > now() - interval '15 minutes';

  if v_window_count >= 5 then
    return jsonb_build_object(
      'allowed', false,
      'error', 'rate_limited',
      'retry_after_seconds', 900
    );
  end if;

  if v_ip_hash is not null then
    select count(*)
    into v_window_count
    from public.public_confirmation_otp_request_limits
    where scope = v_scope
      and ip_hash = v_ip_hash
      and requested_at > now() - interval '15 minutes';

    if v_window_count >= 25 then
      return jsonb_build_object(
        'allowed', false,
        'error', 'rate_limited',
        'retry_after_seconds', 900
      );
    end if;
  end if;

  insert into public.public_confirmation_otp_request_limits (
    scope,
    source_hash,
    phone_hash,
    ip_hash
  ) values (
    v_scope,
    v_source_hash,
    v_phone_hash,
    v_ip_hash
  ) returning id into v_request_id;

  return jsonb_build_object('allowed', true, 'request_id', v_request_id);
end;
$$;

create or replace function public.release_public_confirmation_otp_request(
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_request_id is null then
    return;
  end if;

  -- فقط یک تلاش تازه‌ای که هنوز پیامکی از آن ارسال نشده حذف می‌شود؛ این مسیر
  -- هنگام خطای داخلی Edge استفاده خواهد شد تا retry معتبر بی‌دلیل مسدود نشود.
  delete from public.public_confirmation_otp_request_limits
  where id = p_request_id
    and requested_at > now() - interval '5 minutes';
end;
$$;

revoke all on function public.allow_public_confirmation_otp_request(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.release_public_confirmation_otp_request(uuid) from public, anon, authenticated;
grant execute on function public.allow_public_confirmation_otp_request(text, text, text, text, text, text) to service_role;
grant execute on function public.release_public_confirmation_otp_request(uuid) to service_role;

-- فقط Edge Function مجاز است OTP خام را از senderهای public دریافت کند.
-- مسیر verify عمومی عمداً تغییر نمی‌کند تا تجربهٔ تایید مشتری بدون وقفه بماند.
revoke all on function public.send_invoice_confirm_otp(text, text, text) from public, anon, authenticated;
revoke all on function public.send_delivery_confirm_otp(text, text, text) from public, anon, authenticated;
grant execute on function public.send_invoice_confirm_otp(text, text, text) to service_role;
grant execute on function public.send_delivery_confirm_otp(text, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- 2) Tenant RLS policies: remove every fail-open branch
-- -----------------------------------------------------------------------------
drop policy if exists p_billboards_org_all on public.billboards;
create policy p_billboards_org_all on public.billboards
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_journal_entry_links_org_all on public.journal_entry_links;
create policy p_journal_entry_links_org_all on public.journal_entry_links
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_journal_lines_org_all on public.journal_lines;
create policy p_journal_lines_org_all on public.journal_lines
  for all to authenticated
  using (
    exists (
      select 1
      from public.journal_entries e
      where e.id = journal_lines.entry_id
        and e.org_id = public.current_org_id()
    )
  )
  with check (
    exists (
      select 1
      from public.journal_entries e
      where e.id = journal_lines.entry_id
        and e.org_id = public.current_org_id()
    )
  );

drop policy if exists p_phone_number_links_org_all on public.phone_number_links;
create policy p_phone_number_links_org_all on public.phone_number_links
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_phone_numbers_org_all on public.phone_numbers;
create policy p_phone_numbers_org_all on public.phone_numbers
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_phone_signup_invites_org_all on public.phone_signup_invites;
create policy p_phone_signup_invites_org_all on public.phone_signup_invites
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_portal_roles_org_all on public.portal_roles;
create policy p_portal_roles_org_all on public.portal_roles
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_record_files_org_all on public.record_files;
create policy p_record_files_org_all on public.record_files
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_recycle_bin_records_org_all on public.recycle_bin_records;
create policy p_recycle_bin_records_org_all on public.recycle_bin_records
  for all to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop policy if exists p_taxpayer_invoice_submissions_select on public.taxpayer_invoice_submissions;
create policy p_taxpayer_invoice_submissions_select on public.taxpayer_invoice_submissions
  for select to authenticated
  using (org_id = public.current_org_id());

notify pgrst, 'reload schema';

commit;
