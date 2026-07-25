-- =====================================================
-- TazeSystem - Phase 380
-- MBTI-style self-assessment records for Human Resources
-- =====================================================

begin;

create extension if not exists pgcrypto;

create table if not exists public.mbti_assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade default public.current_org_id(),
  title text not null default 'تست شخصیت‌شناسی',
  respondent_name text not null,
  respondent_phone text,
  respondent_email text,
  related_employee_id uuid references public.employees(id) on delete set null,
  related_applicant_id uuid references public.recruitment_applicants(id) on delete set null,
  related_job_description_id uuid references public.job_descriptions(id) on delete set null,
  position_title text,
  consent_given boolean not null default false,
  consent_at timestamptz,
  ei_01 text, ei_02 text, ei_03 text, ei_04 text, ei_05 text, ei_06 text, ei_07 text, ei_08 text,
  sn_01 text, sn_02 text, sn_03 text, sn_04 text, sn_05 text, sn_06 text, sn_07 text, sn_08 text,
  tf_01 text, tf_02 text, tf_03 text, tf_04 text, tf_05 text, tf_06 text, tf_07 text, tf_08 text,
  jp_01 text, jp_02 text, jp_03 text, jp_04 text, jp_05 text, jp_06 text, jp_07 text, jp_08 text,
  ei_score_e smallint not null default 0,
  ei_score_i smallint not null default 0,
  sn_score_s smallint not null default 0,
  sn_score_n smallint not null default 0,
  tf_score_t smallint not null default 0,
  tf_score_f smallint not null default 0,
  jp_score_j smallint not null default 0,
  jp_score_p smallint not null default 0,
  mbti_type text,
  result_status text not null default 'incomplete',
  ai_analysis text,
  ai_analysis_status text not null default 'not_requested',
  ai_analysis_error text,
  ai_analysis_at timestamptz,
  ai_analysis_model text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_mbti_assessments_result_status check (result_status in ('incomplete', 'ready')),
  constraint chk_mbti_assessments_ai_status check (ai_analysis_status in ('not_requested', 'processing', 'ready', 'failed')),
  constraint chk_mbti_assessments_ei_answers check (coalesce(ei_01 in ('e', 'i'), true) and coalesce(ei_02 in ('e', 'i'), true) and coalesce(ei_03 in ('e', 'i'), true) and coalesce(ei_04 in ('e', 'i'), true) and coalesce(ei_05 in ('e', 'i'), true) and coalesce(ei_06 in ('e', 'i'), true) and coalesce(ei_07 in ('e', 'i'), true) and coalesce(ei_08 in ('e', 'i'), true)),
  constraint chk_mbti_assessments_sn_answers check (coalesce(sn_01 in ('s', 'n'), true) and coalesce(sn_02 in ('s', 'n'), true) and coalesce(sn_03 in ('s', 'n'), true) and coalesce(sn_04 in ('s', 'n'), true) and coalesce(sn_05 in ('s', 'n'), true) and coalesce(sn_06 in ('s', 'n'), true) and coalesce(sn_07 in ('s', 'n'), true) and coalesce(sn_08 in ('s', 'n'), true)),
  constraint chk_mbti_assessments_tf_answers check (coalesce(tf_01 in ('t', 'f'), true) and coalesce(tf_02 in ('t', 'f'), true) and coalesce(tf_03 in ('t', 'f'), true) and coalesce(tf_04 in ('t', 'f'), true) and coalesce(tf_05 in ('t', 'f'), true) and coalesce(tf_06 in ('t', 'f'), true) and coalesce(tf_07 in ('t', 'f'), true) and coalesce(tf_08 in ('t', 'f'), true)),
  constraint chk_mbti_assessments_jp_answers check (coalesce(jp_01 in ('j', 'p'), true) and coalesce(jp_02 in ('j', 'p'), true) and coalesce(jp_03 in ('j', 'p'), true) and coalesce(jp_04 in ('j', 'p'), true) and coalesce(jp_05 in ('j', 'p'), true) and coalesce(jp_06 in ('j', 'p'), true) and coalesce(jp_07 in ('j', 'p'), true) and coalesce(jp_08 in ('j', 'p'), true))
);

alter table if exists public.mbti_assessments
  add column if not exists respondent_name text,
  add column if not exists respondent_phone text,
  add column if not exists respondent_email text,
  add column if not exists related_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists related_applicant_id uuid references public.recruitment_applicants(id) on delete set null,
  add column if not exists related_job_description_id uuid references public.job_descriptions(id) on delete set null,
  add column if not exists position_title text,
  add column if not exists consent_given boolean not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists ei_01 text, add column if not exists ei_02 text, add column if not exists ei_03 text, add column if not exists ei_04 text,
  add column if not exists ei_05 text, add column if not exists ei_06 text, add column if not exists ei_07 text, add column if not exists ei_08 text,
  add column if not exists sn_01 text, add column if not exists sn_02 text, add column if not exists sn_03 text, add column if not exists sn_04 text,
  add column if not exists sn_05 text, add column if not exists sn_06 text, add column if not exists sn_07 text, add column if not exists sn_08 text,
  add column if not exists tf_01 text, add column if not exists tf_02 text, add column if not exists tf_03 text, add column if not exists tf_04 text,
  add column if not exists tf_05 text, add column if not exists tf_06 text, add column if not exists tf_07 text, add column if not exists tf_08 text,
  add column if not exists jp_01 text, add column if not exists jp_02 text, add column if not exists jp_03 text, add column if not exists jp_04 text,
  add column if not exists jp_05 text, add column if not exists jp_06 text, add column if not exists jp_07 text, add column if not exists jp_08 text,
  add column if not exists ei_score_e smallint not null default 0,
  add column if not exists ei_score_i smallint not null default 0,
  add column if not exists sn_score_s smallint not null default 0,
  add column if not exists sn_score_n smallint not null default 0,
  add column if not exists tf_score_t smallint not null default 0,
  add column if not exists tf_score_f smallint not null default 0,
  add column if not exists jp_score_j smallint not null default 0,
  add column if not exists jp_score_p smallint not null default 0,
  add column if not exists mbti_type text,
  add column if not exists result_status text not null default 'incomplete',
  add column if not exists ai_analysis text,
  add column if not exists ai_analysis_status text not null default 'not_requested',
  add column if not exists ai_analysis_error text,
  add column if not exists ai_analysis_at timestamptz,
  add column if not exists ai_analysis_model text;

create index if not exists idx_mbti_assessments_org_created_at
  on public.mbti_assessments(org_id, created_at desc);
create index if not exists idx_mbti_assessments_org_employee
  on public.mbti_assessments(org_id, related_employee_id) where related_employee_id is not null;
create index if not exists idx_mbti_assessments_org_applicant
  on public.mbti_assessments(org_id, related_applicant_id) where related_applicant_id is not null;
create index if not exists idx_mbti_assessments_org_job_description
  on public.mbti_assessments(org_id, related_job_description_id) where related_job_description_id is not null;

create or replace function public.normalize_mbti_assessment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_questions_changed boolean := tg_op = 'INSERT';
  v_complete boolean;
begin
  if tg_op = 'UPDATE' then
    v_questions_changed := old.ei_01 is distinct from new.ei_01 or old.ei_02 is distinct from new.ei_02
      or old.ei_03 is distinct from new.ei_03 or old.ei_04 is distinct from new.ei_04
      or old.ei_05 is distinct from new.ei_05 or old.ei_06 is distinct from new.ei_06
      or old.ei_07 is distinct from new.ei_07 or old.ei_08 is distinct from new.ei_08
      or old.sn_01 is distinct from new.sn_01 or old.sn_02 is distinct from new.sn_02
      or old.sn_03 is distinct from new.sn_03 or old.sn_04 is distinct from new.sn_04
      or old.sn_05 is distinct from new.sn_05 or old.sn_06 is distinct from new.sn_06
      or old.sn_07 is distinct from new.sn_07 or old.sn_08 is distinct from new.sn_08
      or old.tf_01 is distinct from new.tf_01 or old.tf_02 is distinct from new.tf_02
      or old.tf_03 is distinct from new.tf_03 or old.tf_04 is distinct from new.tf_04
      or old.tf_05 is distinct from new.tf_05 or old.tf_06 is distinct from new.tf_06
      or old.tf_07 is distinct from new.tf_07 or old.tf_08 is distinct from new.tf_08
      or old.jp_01 is distinct from new.jp_01 or old.jp_02 is distinct from new.jp_02
      or old.jp_03 is distinct from new.jp_03 or old.jp_04 is distinct from new.jp_04
      or old.jp_05 is distinct from new.jp_05 or old.jp_06 is distinct from new.jp_06
      or old.jp_07 is distinct from new.jp_07 or old.jp_08 is distinct from new.jp_08;
  end if;
  if new.org_id is null then
    new.org_id := public.current_org_id();
  end if;
  if new.org_id is null then
    raise exception 'MBTI_ASSESSMENT_ORG_REQUIRED';
  end if;

  if new.related_employee_id is not null and not exists (
    select 1 from public.employees where id = new.related_employee_id and org_id = new.org_id
  ) then
    raise exception 'MBTI_ASSESSMENT_EMPLOYEE_ORG_MISMATCH';
  end if;
  if new.related_applicant_id is not null and not exists (
    select 1 from public.recruitment_applicants where id = new.related_applicant_id and org_id = new.org_id
  ) then
    raise exception 'MBTI_ASSESSMENT_APPLICANT_ORG_MISMATCH';
  end if;
  if new.related_job_description_id is not null and not exists (
    select 1 from public.job_descriptions where id = new.related_job_description_id and org_id = new.org_id
  ) then
    raise exception 'MBTI_ASSESSMENT_JOB_ORG_MISMATCH';
  end if;

  new.ei_01 := lower(nullif(trim(new.ei_01), '')); new.ei_02 := lower(nullif(trim(new.ei_02), ''));
  new.ei_03 := lower(nullif(trim(new.ei_03), '')); new.ei_04 := lower(nullif(trim(new.ei_04), ''));
  new.ei_05 := lower(nullif(trim(new.ei_05), '')); new.ei_06 := lower(nullif(trim(new.ei_06), ''));
  new.ei_07 := lower(nullif(trim(new.ei_07), '')); new.ei_08 := lower(nullif(trim(new.ei_08), ''));
  new.sn_01 := lower(nullif(trim(new.sn_01), '')); new.sn_02 := lower(nullif(trim(new.sn_02), ''));
  new.sn_03 := lower(nullif(trim(new.sn_03), '')); new.sn_04 := lower(nullif(trim(new.sn_04), ''));
  new.sn_05 := lower(nullif(trim(new.sn_05), '')); new.sn_06 := lower(nullif(trim(new.sn_06), ''));
  new.sn_07 := lower(nullif(trim(new.sn_07), '')); new.sn_08 := lower(nullif(trim(new.sn_08), ''));
  new.tf_01 := lower(nullif(trim(new.tf_01), '')); new.tf_02 := lower(nullif(trim(new.tf_02), ''));
  new.tf_03 := lower(nullif(trim(new.tf_03), '')); new.tf_04 := lower(nullif(trim(new.tf_04), ''));
  new.tf_05 := lower(nullif(trim(new.tf_05), '')); new.tf_06 := lower(nullif(trim(new.tf_06), ''));
  new.tf_07 := lower(nullif(trim(new.tf_07), '')); new.tf_08 := lower(nullif(trim(new.tf_08), ''));
  new.jp_01 := lower(nullif(trim(new.jp_01), '')); new.jp_02 := lower(nullif(trim(new.jp_02), ''));
  new.jp_03 := lower(nullif(trim(new.jp_03), '')); new.jp_04 := lower(nullif(trim(new.jp_04), ''));
  new.jp_05 := lower(nullif(trim(new.jp_05), '')); new.jp_06 := lower(nullif(trim(new.jp_06), ''));
  new.jp_07 := lower(nullif(trim(new.jp_07), '')); new.jp_08 := lower(nullif(trim(new.jp_08), ''));

  new.ei_score_e := coalesce((new.ei_01 = 'e')::int, 0) + coalesce((new.ei_02 = 'e')::int, 0) + coalesce((new.ei_03 = 'e')::int, 0) + coalesce((new.ei_04 = 'e')::int, 0) + coalesce((new.ei_05 = 'e')::int, 0) + coalesce((new.ei_06 = 'e')::int, 0) + coalesce((new.ei_07 = 'e')::int, 0) + coalesce((new.ei_08 = 'e')::int, 0);
  new.ei_score_i := coalesce((new.ei_01 = 'i')::int, 0) + coalesce((new.ei_02 = 'i')::int, 0) + coalesce((new.ei_03 = 'i')::int, 0) + coalesce((new.ei_04 = 'i')::int, 0) + coalesce((new.ei_05 = 'i')::int, 0) + coalesce((new.ei_06 = 'i')::int, 0) + coalesce((new.ei_07 = 'i')::int, 0) + coalesce((new.ei_08 = 'i')::int, 0);
  new.sn_score_s := coalesce((new.sn_01 = 's')::int, 0) + coalesce((new.sn_02 = 's')::int, 0) + coalesce((new.sn_03 = 's')::int, 0) + coalesce((new.sn_04 = 's')::int, 0) + coalesce((new.sn_05 = 's')::int, 0) + coalesce((new.sn_06 = 's')::int, 0) + coalesce((new.sn_07 = 's')::int, 0) + coalesce((new.sn_08 = 's')::int, 0);
  new.sn_score_n := coalesce((new.sn_01 = 'n')::int, 0) + coalesce((new.sn_02 = 'n')::int, 0) + coalesce((new.sn_03 = 'n')::int, 0) + coalesce((new.sn_04 = 'n')::int, 0) + coalesce((new.sn_05 = 'n')::int, 0) + coalesce((new.sn_06 = 'n')::int, 0) + coalesce((new.sn_07 = 'n')::int, 0) + coalesce((new.sn_08 = 'n')::int, 0);
  new.tf_score_t := coalesce((new.tf_01 = 't')::int, 0) + coalesce((new.tf_02 = 't')::int, 0) + coalesce((new.tf_03 = 't')::int, 0) + coalesce((new.tf_04 = 't')::int, 0) + coalesce((new.tf_05 = 't')::int, 0) + coalesce((new.tf_06 = 't')::int, 0) + coalesce((new.tf_07 = 't')::int, 0) + coalesce((new.tf_08 = 't')::int, 0);
  new.tf_score_f := coalesce((new.tf_01 = 'f')::int, 0) + coalesce((new.tf_02 = 'f')::int, 0) + coalesce((new.tf_03 = 'f')::int, 0) + coalesce((new.tf_04 = 'f')::int, 0) + coalesce((new.tf_05 = 'f')::int, 0) + coalesce((new.tf_06 = 'f')::int, 0) + coalesce((new.tf_07 = 'f')::int, 0) + coalesce((new.tf_08 = 'f')::int, 0);
  new.jp_score_j := coalesce((new.jp_01 = 'j')::int, 0) + coalesce((new.jp_02 = 'j')::int, 0) + coalesce((new.jp_03 = 'j')::int, 0) + coalesce((new.jp_04 = 'j')::int, 0) + coalesce((new.jp_05 = 'j')::int, 0) + coalesce((new.jp_06 = 'j')::int, 0) + coalesce((new.jp_07 = 'j')::int, 0) + coalesce((new.jp_08 = 'j')::int, 0);
  new.jp_score_p := coalesce((new.jp_01 = 'p')::int, 0) + coalesce((new.jp_02 = 'p')::int, 0) + coalesce((new.jp_03 = 'p')::int, 0) + coalesce((new.jp_04 = 'p')::int, 0) + coalesce((new.jp_05 = 'p')::int, 0) + coalesce((new.jp_06 = 'p')::int, 0) + coalesce((new.jp_07 = 'p')::int, 0) + coalesce((new.jp_08 = 'p')::int, 0);

  v_complete := new.ei_01 is not null and new.ei_02 is not null and new.ei_03 is not null and new.ei_04 is not null and new.ei_05 is not null and new.ei_06 is not null and new.ei_07 is not null and new.ei_08 is not null
    and new.sn_01 is not null and new.sn_02 is not null and new.sn_03 is not null and new.sn_04 is not null and new.sn_05 is not null and new.sn_06 is not null and new.sn_07 is not null and new.sn_08 is not null
    and new.tf_01 is not null and new.tf_02 is not null and new.tf_03 is not null and new.tf_04 is not null and new.tf_05 is not null and new.tf_06 is not null and new.tf_07 is not null and new.tf_08 is not null
    and new.jp_01 is not null and new.jp_02 is not null and new.jp_03 is not null and new.jp_04 is not null and new.jp_05 is not null and new.jp_06 is not null and new.jp_07 is not null and new.jp_08 is not null;

  new.result_status := case when v_complete then 'ready' else 'incomplete' end;
  new.mbti_type := case
    when not v_complete or new.ei_score_e = new.ei_score_i or new.sn_score_s = new.sn_score_n or new.tf_score_t = new.tf_score_f or new.jp_score_j = new.jp_score_p then null
    else concat(case when new.ei_score_e > new.ei_score_i then 'E' else 'I' end, case when new.sn_score_s > new.sn_score_n then 'S' else 'N' end, case when new.tf_score_t > new.tf_score_f then 'T' else 'F' end, case when new.jp_score_j > new.jp_score_p then 'J' else 'P' end)
  end;
  if new.consent_given and new.consent_at is null then new.consent_at := now(); end if;
  if not new.consent_given then new.consent_at := null; end if;
  if tg_op = 'INSERT' or nullif(trim(coalesce(new.title, '')), '') is null then new.title := 'تست شخصیت‌شناسی - ' || coalesce(nullif(trim(new.respondent_name), ''), 'بدون نام'); end if;
  if v_questions_changed then
    new.ai_analysis := null;
    new.ai_analysis_status := 'not_requested';
    new.ai_analysis_error := null;
    new.ai_analysis_at := null;
    new.ai_analysis_model := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_normalize_mbti_assessment on public.mbti_assessments;
create trigger trg_normalize_mbti_assessment
before insert or update on public.mbti_assessments
for each row execute function public.normalize_mbti_assessment();

alter table public.mbti_assessments enable row level security;
drop policy if exists p_mbti_assessments_org_all on public.mbti_assessments;
create policy p_mbti_assessments_org_all on public.mbti_assessments
for all to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

grant select, insert, update, delete on public.mbti_assessments to authenticated, service_role;

-- قابلیت ماژول و تحلیل هوشمند، قابل مدیریت از ویژگی‌های پلن است.
update public.saas_plans
set enabled_modules = coalesce(enabled_modules, '{}'::jsonb) || jsonb_build_object('mbti_assessments', true),
    enabled_features = coalesce(enabled_features, '{}'::jsonb) || jsonb_build_object('mbti_ai_analysis', true)
where coalesce(enabled_modules ->> 'employees', 'false') in ('true', 'enabled');

notify pgrst, 'reload schema';

commit;
