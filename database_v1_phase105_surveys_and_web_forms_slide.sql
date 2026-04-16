-- =====================================================
-- KalamApp - Phase 105
-- Web forms: slide mode + location/multi-select support
-- Surveys module + default public survey form
-- =====================================================

begin;

create extension if not exists pgcrypto;

alter table if exists public.web_form_fields drop constraint if exists chk_web_form_fields_type;
alter table if exists public.web_form_fields
  add constraint chk_web_form_fields_type check (
    field_type in ('text', 'long_text', 'number', 'phone', 'date', 'time', 'datetime', 'image', 'file', 'multi_select', 'location', 'checkbox', 'select', 'relation')
  );

create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  title text not null,
  status text not null default 'new',
  survey_type text not null default 'general',
  respondent_name text,
  respondent_phone text,
  respondent_email text,
  channel text not null default 'web_form',
  overall_experience text,
  recommendation_score numeric,
  favorite_aspects jsonb not null default '[]'::jsonb,
  improvement_areas jsonb not null default '[]'::jsonb,
  visit_datetime timestamptz,
  branch_location text,
  follow_up_consent boolean not null default false,
  comments text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.surveys
  add column if not exists org_id uuid references public.organizations(id) on delete cascade default public.current_org_id(),
  add column if not exists title text,
  add column if not exists status text default 'new',
  add column if not exists survey_type text default 'general',
  add column if not exists respondent_name text,
  add column if not exists respondent_phone text,
  add column if not exists respondent_email text,
  add column if not exists channel text default 'web_form',
  add column if not exists overall_experience text,
  add column if not exists recommendation_score numeric,
  add column if not exists favorite_aspects jsonb not null default '[]'::jsonb,
  add column if not exists improvement_areas jsonb not null default '[]'::jsonb,
  add column if not exists visit_datetime timestamptz,
  add column if not exists branch_location text,
  add column if not exists follow_up_consent boolean not null default false,
  add column if not exists comments text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.surveys
set
  title = coalesce(nullif(trim(title), ''), 'نظرسنجی ' || to_char(coalesce(created_at, now()), 'YYYYMMDDHH24MISS')),
  status = coalesce(nullif(trim(status), ''), 'new'),
  survey_type = coalesce(nullif(trim(survey_type), ''), 'general'),
  channel = coalesce(nullif(trim(channel), ''), 'web_form'),
  favorite_aspects = coalesce(favorite_aspects, '[]'::jsonb),
  improvement_areas = coalesce(improvement_areas, '[]'::jsonb),
  follow_up_consent = coalesce(follow_up_consent, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where
  title is null
  or trim(title) = ''
  or
  status is null
  or trim(status) = ''
  or survey_type is null
  or trim(survey_type) = ''
  or channel is null
  or trim(channel) = ''
  or favorite_aspects is null
  or improvement_areas is null
  or follow_up_consent is null
  or created_at is null
  or updated_at is null;

alter table public.surveys alter column title set not null;
alter table public.surveys alter column status set default 'new';
alter table public.surveys alter column status set not null;
alter table public.surveys alter column survey_type set default 'general';
alter table public.surveys alter column survey_type set not null;
alter table public.surveys alter column channel set default 'web_form';
alter table public.surveys alter column channel set not null;
alter table public.surveys alter column favorite_aspects set default '[]'::jsonb;
alter table public.surveys alter column favorite_aspects set not null;
alter table public.surveys alter column improvement_areas set default '[]'::jsonb;
alter table public.surveys alter column improvement_areas set not null;
alter table public.surveys alter column follow_up_consent set default false;
alter table public.surveys alter column follow_up_consent set not null;
alter table public.surveys alter column created_at set default now();
alter table public.surveys alter column created_at set not null;
alter table public.surveys alter column updated_at set default now();
alter table public.surveys alter column updated_at set not null;

create index if not exists idx_surveys_org_updated_at
  on public.surveys(org_id, updated_at desc, created_at desc);

create index if not exists idx_surveys_org_status
  on public.surveys(org_id, status);

grant select, insert, update, delete on public.surveys to authenticated, service_role;

alter table public.surveys enable row level security;

drop policy if exists p_surveys_org_all on public.surveys;
create policy p_surveys_org_all on public.surveys
for all
to authenticated
using (org_id = public.current_org_id())
with check (org_id = public.current_org_id());

drop trigger if exists trg_surveys_updated_at on public.surveys;
create trigger trg_surveys_updated_at
before update on public.surveys
for each row execute function public.set_updated_at();

with inserted_forms as (
  insert into public.web_forms (
    org_id,
    name,
    description,
    route_slug,
    target_module_id,
    access_scope,
    form_type,
    config,
    is_active
  )
  select
    org.id,
    'نظرسنجی تجربه مشتری',
    'فرم پیش‌فرض اسلایدی برای جمع‌آوری بازخورد عمومی مشتریان',
    'survey',
    'surveys',
    'public',
    'record_create',
    jsonb_build_object(
      'header_title', 'نظرسنجی تجربه شما',
      'header_subtitle', 'چند سؤال کوتاه برای بهبود تجربه شما',
      'submit_label', 'ثبت نظرسنجی',
      'success_message', 'نظر شما با موفقیت ثبت شد. سپاس از همراهی شما.',
      'display_mode', 'slide',
      'slide_show_progress', true,
      'slide_allow_back', true,
      'slide_auto_advance', true,
      'default_record_values', jsonb_build_object(
        'status', 'new',
        'channel', 'web_form',
        'survey_type', 'general'
      )
    ),
    true
  from public.organizations org
  where not exists (
    select 1
    from public.web_forms wf
    where wf.org_id = org.id
      and lower(wf.route_slug) = 'survey'
  )
  returning id, org_id
)
insert into public.web_form_fields (
  org_id,
  web_form_id,
  field_key,
  label,
  target_field_key,
  field_type,
  placeholder,
  help_text,
  default_value,
  config,
  sort_order,
  is_required,
  is_hidden,
  is_active
)
select
  f.org_id,
  f.id,
  item.field_key,
  item.label,
  item.target_field_key,
  item.field_type,
  item.placeholder,
  item.help_text,
  item.default_value,
  coalesce(item.config, '{}'::jsonb),
  item.sort_order,
  item.is_required,
  false,
  true
from inserted_forms f
cross join (
  values
    ('title', 'عنوان کوتاه تجربه شما', 'title', 'text', 'مثال: تجربه خرید امروز', 'اگر بخواهید این تجربه را در یک جمله خلاصه کنید، چه می‌گویید؟', null::jsonb, '{}'::jsonb, 10, true),
    ('respondent_name', 'نام شما', 'respondent_name', 'text', 'نام و نام خانوادگی', 'در صورت تمایل نام خود را وارد کنید.', null::jsonb, '{}'::jsonb, 20, false),
    ('respondent_phone', 'شماره تماس', 'respondent_phone', 'phone', 'مثال: 09123456789', 'اگر بخواهیم نتیجه پیگیری را اطلاع دهیم از این شماره استفاده می‌کنیم.', null::jsonb, '{}'::jsonb, 30, false),
    ('overall_experience', 'ارزیابی کلی شما', 'overall_experience', 'select', 'انتخاب کنید', 'تجربه کلی خود را از خیلی ضعیف تا عالی مشخص کنید.', null::jsonb, '{}'::jsonb, 40, true),
    ('recommendation_score', 'امتیاز معرفی به دیگران', 'recommendation_score', 'number', 'عددی بین 0 تا 10', 'اگر بخواهید ما را به دیگران معرفی کنید چه امتیازی می‌دهید؟', null::jsonb, '{}'::jsonb, 50, false),
    ('favorite_aspects', 'چه چیزهایی برای شما ارزشمند بود؟', 'favorite_aspects', 'multi_select', 'انتخاب چند مورد', 'می‌توانید چند گزینه را انتخاب کنید.', '[]'::jsonb, '{}'::jsonb, 60, false),
    ('improvement_areas', 'چه چیزهایی نیاز به بهبود دارد؟', 'improvement_areas', 'multi_select', 'انتخاب چند مورد', 'اگر بخواهید به ما کمک کنید بهتر شویم، کدام بخش‌ها مهم‌ترند؟', '[]'::jsonb, '{}'::jsonb, 70, false),
    ('visit_datetime', 'تاریخ و زمان تجربه', 'visit_datetime', 'datetime', 'انتخاب تاریخ و زمان', 'اگر بازخورد شما مربوط به تجربه خاصی است زمان آن را ثبت کنید.', null::jsonb, '{}'::jsonb, 80, false),
    ('branch_location', 'محل تجربه روی نقشه', 'branch_location', 'location', 'مثال: 35.6892, 51.3890', 'در صورت نیاز موقعیت را روی نقشه یا به‌صورت مختصات ثبت کنید.', null::jsonb, '{}'::jsonb, 90, false),
    ('follow_up_consent', 'مایل به پیگیری هستم', 'follow_up_consent', 'checkbox', '', 'اگر مایل هستید درباره این بازخورد با شما تماس بگیریم این گزینه را فعال کنید.', 'false'::jsonb, '{}'::jsonb, 100, false),
    ('comments', 'نظر و توضیحات تکمیلی', 'comments', 'long_text', 'هر نکته‌ای که لازم می‌دانید بنویسید', 'جزئیات بیشتر، پیشنهاد، انتقاد یا تجربه خاص خود را بنویسید.', null::jsonb, '{}'::jsonb, 110, false)
) as item(field_key, label, target_field_key, field_type, placeholder, help_text, default_value, config, sort_order, is_required);

notify pgrst, 'reload schema';

commit;
