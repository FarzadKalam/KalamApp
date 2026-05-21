-- =====================================================
-- KalamApp - Phase 171: Fix STABLE SECURITY DEFINER inlining
-- Date: 2026-05-21
-- Type: Security / Bug fix
-- Problem:
--   user_belongs_to_org() and current_org_id() are declared as
--   "language sql STABLE SECURITY DEFINER". PostgreSQL is allowed to
--   inline STABLE SQL functions into the surrounding query. When inlined,
--   the SECURITY DEFINER context is lost and the function body runs as
--   the calling authenticated user — subject to RLS on profiles/org_roles.
--   This causes user_belongs_to_org() to systematically return false for
--   all users inside the org_stories INSERT WITH CHECK policy → 403.
--
-- Fix:
--   Convert both functions to "language plpgsql VOLATILE".
--   VOLATILE plpgsql functions are never inlined by PostgreSQL, so
--   SECURITY DEFINER is always preserved and RLS is bypassed correctly.
-- =====================================================

begin;

-- ─────────────────────────────────────────────
-- ۱. current_org_id — از sql STABLE به plpgsql VOLATILE
-- ─────────────────────────────────────────────
create or replace function public.current_org_id()
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select coalesce(p.org_id, r.org_id)
    into v_org_id
  from public.profiles p
  left join public.org_roles r on r.id = p.role_id
  where p.id = auth.uid()
  limit 1;
  return v_org_id;
end;
$$;

-- ─────────────────────────────────────────────
-- ۲. user_belongs_to_org — از sql STABLE به plpgsql VOLATILE
-- ─────────────────────────────────────────────
create or replace function public.user_belongs_to_org(p_org_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_exists boolean;
begin
  if p_org_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.profiles p
    left join public.org_roles r on r.id = p.role_id
    where p.id = auth.uid()
      and coalesce(p.org_id, r.org_id) = p_org_id
  ) into v_exists;

  return coalesce(v_exists, false);
end;
$$;

grant execute on function public.current_org_id() to authenticated;
grant execute on function public.user_belongs_to_org(uuid) to authenticated;

-- ─────────────────────────────────────────────
-- ۳. set_current_org_id_if_missing — هم volatile کن
-- ─────────────────────────────────────────────
create or replace function public.set_current_org_id_if_missing()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if new.org_id is null then
    new.org_id := public.current_org_id();
  end if;
  return new;
end;
$$;

do $$
begin
  raise notice 'Phase 171: current_org_id, user_belongs_to_org, set_current_org_id_if_missing converted to plpgsql VOLATILE.';
  raise notice 'PostgreSQL will no longer inline these functions → SECURITY DEFINER always preserved.';
end;
$$;

notify pgrst, 'reload schema';

commit;
