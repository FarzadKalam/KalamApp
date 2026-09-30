-- TazeSystem - Phase 531
-- نگهداری سروری و tenant-safe انتخاب فیلدهای قابل چاپ

begin;

create table if not exists public.print_field_preferences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  module_id text not null,
  template_id text not null,
  scope text not null check (scope in ('record', 'list')),
  selected_field_keys jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_field_keys) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, module_id, template_id, scope)
);

create index if not exists idx_print_field_preferences_org_lookup
  on public.print_field_preferences(org_id, module_id, template_id, scope);

alter table public.print_field_preferences enable row level security;

drop policy if exists p_print_field_preferences_org_all on public.print_field_preferences;
create policy p_print_field_preferences_org_all
  on public.print_field_preferences
  for all
  to authenticated
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

drop trigger if exists trg_print_field_preferences_updated_at on public.print_field_preferences;
create trigger trg_print_field_preferences_updated_at
  before update on public.print_field_preferences
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on public.print_field_preferences to authenticated;

commit;
