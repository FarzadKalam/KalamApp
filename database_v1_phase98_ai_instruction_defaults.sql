-- KalamApp - Phase 98 AI instruction defaults
-- Adds a default editable system document for AI instructions and seeds one active chunk.

begin;

create index if not exists idx_org_documents_org_document_type
  on public.org_documents(org_id, document_type, updated_at desc);

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
    metadata,
    created_at,
    updated_at
  )
  select
    org_id,
    'دستورهای هوش مصنوعی',
    E'در این بخش، قواعد و ترجیحات پاسخ‌دهی هوش مصنوعی سازمان را بنویسید.\n\nنمونه مواردی که می‌توانید مشخص کنید:\n- لحن پاسخ‌ها\n- نحوه معرفی شرکت و خدمات\n- محدودیت‌ها و خط قرمزهای پاسخ‌دهی\n- ترجیح در کوتاهی یا جزئیات\n- شیوه برخورد با مشتری، تامین‌کننده و همکار\n\nاین متن پیش‌فرض است و بهتر است با دستورهای واقعی سازمان شما جایگزین شود.',
    'ai_instructions',
    'active',
    jsonb_build_object(
      'system_key', 'ai_instructions',
      'is_system_default', true,
      'default_template', true
    ),
    now(),
    now()
  from target_orgs t
  where not exists (
    select 1
    from public.org_documents d
    where d.org_id = t.org_id
      and d.document_type = 'ai_instructions'
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
    'system_key', 'ai_instructions'
  ),
  now(),
  now()
from inserted_docs d;

commit;
