-- Phase 311: active profile recipient lookup indexes

create index if not exists idx_profiles_org_active_full_name
on public.profiles (org_id, is_active, full_name);

create index if not exists idx_profiles_org_role_active
on public.profiles (org_id, role_id, is_active)
where role_id is not null;

create index if not exists idx_profiles_active_id
on public.profiles (id, is_active);
