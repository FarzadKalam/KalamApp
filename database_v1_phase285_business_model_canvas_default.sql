-- KalamApp - Phase 285: Default business model canvas for organization knowledge
-- Adds one system knowledge document per org with the standard BMC layout.

begin;

with target_orgs as (
  select id as org_id
  from public.organizations
),
inserted_docs as (
  insert into public.org_documents (
    org_id,
    title,
    body,
    body_html,
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
    'بوم کسب و کار',
    E'بوم کسب و کار\n\nاین بوم کسب و کار هنوز تکمیل نشده است و فعلاً فقط قالب استاندارد آن برای سازمان ثبت شده است.\n\nشرکای کلیدی\n- تکمیل نشده\n\nفعالیت‌های کلیدی\n- تکمیل نشده\n\nمنابع کلیدی\n- تکمیل نشده\n\nارزش‌های پیشنهادی\n- تکمیل نشده\n\nارتباط با مشتری\n- تکمیل نشده\n\nکانال‌ها\n- تکمیل نشده\n\nبخش‌های مشتریان\n- تکمیل نشده\n\nساختار هزینه‌ها\n- تکمیل نشده\n\nجریان‌های درآمدی\n- تکمیل نشده',
    '<div dir="rtl" data-system-key="business_model_canvas"><h1>بوم کسب و کار</h1><p>این بوم کسب و کار هنوز تکمیل نشده است و فعلاً فقط قالب استاندارد آن برای سازمان ثبت شده است.</p><section><h2>شرکای کلیدی</h2><ul><li>تکمیل نشده</li></ul></section><section><h2>فعالیت‌های کلیدی</h2><ul><li>تکمیل نشده</li></ul></section><section><h2>منابع کلیدی</h2><ul><li>تکمیل نشده</li></ul></section><section><h2>ارزش‌های پیشنهادی</h2><ul><li>تکمیل نشده</li></ul></section><section><h2>ارتباط با مشتری</h2><ul><li>تکمیل نشده</li></ul></section><section><h2>کانال‌ها</h2><ul><li>تکمیل نشده</li></ul></section><section><h2>بخش‌های مشتریان</h2><ul><li>تکمیل نشده</li></ul></section><section><h2>ساختار هزینه‌ها</h2><ul><li>تکمیل نشده</li></ul></section><section><h2>جریان‌های درآمدی</h2><ul><li>تکمیل نشده</li></ul></section></div>',
    'business_model_canvas',
    'active',
    true,
    jsonb_build_object(
      'system_key', 'business_model_canvas',
      'is_system_default', true,
      'canvas_layout', 'osterwalder_standard',
      'canvas_version', 1,
      'completion_ratio', 0,
      'default_template', true,
      'sections', jsonb_build_object(
        'key_partners', '[]'::jsonb,
        'key_activities', '[]'::jsonb,
        'key_resources', '[]'::jsonb,
        'value_propositions', '[]'::jsonb,
        'customer_relationships', '[]'::jsonb,
        'channels', '[]'::jsonb,
        'customer_segments', '[]'::jsonb,
        'cost_structure', '[]'::jsonb,
        'revenue_streams', '[]'::jsonb
      )
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
      and (
        d.document_type = 'business_model_canvas'
        or d.metadata ->> 'system_key' = 'business_model_canvas'
      )
  )
  returning id, org_id, title, body, document_type, metadata
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
    'system_key', d.metadata ->> 'system_key'
  ),
  '{}'::uuid[],
  '{}'::uuid[],
  now(),
  now()
from inserted_docs d
where not exists (
  select 1
  from public.document_chunks c
  where c.document_id = d.id
    and c.chunk_index = 0
);

commit;
