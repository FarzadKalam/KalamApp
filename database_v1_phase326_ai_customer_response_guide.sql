-- KalamApp V1 Phase 326
-- Default AI customer response guide for targeted auto-reply retrieval.

begin;

create index if not exists idx_org_documents_org_customer_response_guide
  on public.org_documents(org_id, document_type, updated_at desc)
  where document_type = 'ai_customer_response_guide';

with target_orgs as (
  select id as org_id
  from public.organizations
),
inserted_docs as (
  insert into public.org_documents (
    org_id,
    title,
    body,
    document_type,
    status,
    use_for_ai,
    metadata,
    allowed_user_ids,
    allowed_role_ids,
    created_at,
    updated_at
  )
  select
    org_id,
    'راهنمای پاسخگویی هوش مصنوعی به مشتریان',
    E'این سند راهنمای پاسخگویی هوش مصنوعی به مشتریان، تامین‌کنندگان و مخاطبان بات است.\n\nقواعد پیش‌فرض:\n- قبل از پاسخ، پیام‌های اخیر گفتگو، راهنمای اختصاصی مخاطب، دستورالعمل‌های مرتبط و دانش سازمان را بررسی کن.\n- اگر دستورالعمل سازمان با پاسخ عمومی مدل تعارض داشت، دستورالعمل سازمان مقدم است.\n- پاسخ باید فارسی، کوتاه، روشن، محترمانه و قابل ارسال مستقیم به مخاطب باشد.\n- اگر درباره قیمت، زمان تحویل، طراحی، اجرا، مالی، تخفیف یا وضعیت پروژه سوال شد، فقط بر اساس داده‌ها و اسناد مجاز پاسخ بده.\n- اگر اطلاعات کافی نیست، به‌جای حدس زدن یک سوال کوتاه بپرس یا موضوع را برای مسئول داخلی مناسب آماده کن.\n- اطلاعات داخلی، حاشیه سود، جزئیات محرمانه مالی یا داده‌ای که برای مخاطب مجاز نیست را افشا نکن.\n\nاین متن پیش‌فرض است و هر سازمان می‌تواند آن را با سیاست فروش و پشتیبانی خودش جایگزین کند.',
    'ai_customer_response_guide',
    'active',
    true,
    jsonb_build_object(
      'system_key', 'ai_customer_response_guide',
      'is_system_default', true,
      'default_template', true
    ),
    '{}'::uuid[],
    '{}'::uuid[],
    now(),
    now()
  from target_orgs t
  where not exists (
    select 1
    from public.org_documents d
    where d.org_id = t.org_id
      and d.document_type = 'ai_customer_response_guide'
  )
  returning id, org_id, title, body, document_type
)
insert into public.document_chunks (
  org_id,
  document_id,
  chunk_index,
  content,
  content_hash,
  token_estimate,
  status,
  metadata,
  allowed_user_ids,
  allowed_role_ids,
  created_at,
  updated_at
)
select
  d.org_id,
  d.id,
  0,
  d.body,
  md5(d.body),
  greatest(1, ceil(length(d.body)::numeric / 4.0)::integer),
  'active',
  jsonb_build_object(
    'document_title', d.title,
    'document_type', d.document_type,
    'system_key', 'ai_customer_response_guide'
  ),
  '{}'::uuid[],
  '{}'::uuid[],
  now(),
  now()
from inserted_docs d;

insert into public.document_chunks (
  org_id,
  document_id,
  chunk_index,
  content,
  content_hash,
  token_estimate,
  status,
  metadata,
  allowed_user_ids,
  allowed_role_ids,
  created_at,
  updated_at
)
select
  d.org_id,
  d.id,
  0,
  d.body,
  md5(d.body),
  greatest(1, ceil(length(d.body)::numeric / 4.0)::integer),
  'active',
  jsonb_build_object(
    'document_title', d.title,
    'document_type', d.document_type,
    'system_key', 'ai_customer_response_guide'
  ),
  coalesce(d.allowed_user_ids, '{}'::uuid[]),
  coalesce(d.allowed_role_ids, '{}'::uuid[]),
  now(),
  now()
from public.org_documents d
where d.document_type = 'ai_customer_response_guide'
  and d.status = 'active'
  and coalesce(d.use_for_ai, true) = true
  and not exists (
    select 1
    from public.document_chunks c
    where c.org_id = d.org_id
      and c.document_id = d.id
      and c.chunk_index = 0
      and c.status = 'active'
  );

commit;
