create table if not exists public.instructions (
  id uuid primary key default gen_random_uuid()
);

alter table public.instructions
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists image_url text,
  add column if not exists name text not null default '',
  add column if not exists system_code text,
  add column if not exists status text not null default 'draft',
  add column if not exists department text,
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null,
  add column if not exists assignee_role_id uuid references public.org_roles(id) on delete set null,
  add column if not exists assignee_type text,
  add column if not exists module_ids text[] not null default '{}'::text[],
  add column if not exists visible_to_user_ids uuid[] not null default '{}'::uuid[],
  add column if not exists visible_to_role_ids uuid[] not null default '{}'::uuid[],
  add column if not exists goal text,
  add column if not exists body text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'instructions_status_check') then
    alter table public.instructions
      add constraint instructions_status_check
      check (status in ('draft', 'approved', 'published', 'expired'));
  end if;
end $$;

create index if not exists idx_instructions_org_status
  on public.instructions(org_id, status, updated_at desc);

create index if not exists idx_instructions_module_ids
  on public.instructions using gin(module_ids);

create index if not exists idx_instructions_visible_users
  on public.instructions using gin(visible_to_user_ids);

create index if not exists idx_instructions_visible_roles
  on public.instructions using gin(visible_to_role_ids);

create table if not exists public.process_template_stage_instructions (
  id uuid primary key default gen_random_uuid()
);

alter table public.process_template_stage_instructions
  add column if not exists template_id uuid references public.process_templates(id) on delete cascade,
  add column if not exists template_stage_id uuid references public.process_template_stages(id) on delete cascade,
  add column if not exists instruction_id uuid references public.instructions(id) on delete cascade,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists idx_process_template_stage_instruction_unique
  on public.process_template_stage_instructions(template_stage_id, instruction_id);

create index if not exists idx_process_template_stage_instruction_template
  on public.process_template_stage_instructions(template_id, sort_order);

alter table public.instructions enable row level security;
drop policy if exists p_instructions_auth_all on public.instructions;
create policy p_instructions_auth_all
on public.instructions
for all
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

alter table public.process_template_stage_instructions enable row level security;
drop policy if exists p_process_template_stage_instructions_auth_all on public.process_template_stage_instructions;
create policy p_process_template_stage_instructions_auth_all
on public.process_template_stage_instructions
for all
using (
  exists (
    select 1
    from public.process_templates t
    where t.id = process_template_stage_instructions.template_id
      and t.org_id = public.current_org_id()
  )
)
with check (
  exists (
    select 1
    from public.process_templates t
    where t.id = process_template_stage_instructions.template_id
      and t.org_id = public.current_org_id()
  )
);
