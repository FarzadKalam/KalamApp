begin;

-- Public CMS tables intentionally stay private. This narrow RPC exposes only
-- published tutorial content that is explicitly linked to the current screen.
create or replace function public.get_cms_contextual_tutorial_posts(
  p_contexts text[],
  p_limit integer default 100
)
returns table (
  id uuid,
  title text,
  slug text,
  excerpt text,
  help_group text,
  help_order integer,
  content_blocks jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.slug,
    p.excerpt,
    coalesce(nullif(trim(p.help_group), ''), 'راهنما') as help_group,
    coalesce(p.help_order, 0) as help_order,
    p.content_blocks
  from public.cms_tutorial_posts p
  where p.status = 'published'
    and coalesce(p.help_contexts, '{}'::text[]) && coalesce(p_contexts, '{}'::text[])
  order by coalesce(nullif(trim(p.help_group), ''), 'راهنما'), coalesce(p.help_order, 0), p.title
  limit greatest(least(coalesce(p_limit, 100), 100), 1)
$$;

revoke all on function public.get_cms_contextual_tutorial_posts(text[], integer) from public;
grant execute on function public.get_cms_contextual_tutorial_posts(text[], integer) to anon, authenticated;

-- Add useful, non-sensitive interface screenshots to the public tutorial cards.
-- Existing editorial covers are preserved.
with covers(slug, image_url) as (
  values
    ('working-with-records', '/assets/tutorials/customers-list.png'),
    ('customers-and-leads', '/assets/tutorials/marketing_leads-list.png'),
    ('products-and-prices', '/assets/tutorials/products-list.png'),
    ('sales-invoice', '/assets/tutorials/invoices-list.png'),
    ('purchase-invoice', '/assets/tutorials/purchase_invoices-list.png'),
    ('expense-document', '/assets/tutorials/expense_documents-list.png'),
    ('process-templates', '/assets/tutorials/process_templates-list.png'),
    ('projects-and-tasks', '/assets/tutorials/projects-list.png'),
    ('reservations', '/assets/tutorials/reservations-list.png'),
    ('human-resources', '/assets/tutorials/employees-list.png'),
    ('report-builder', '/assets/tutorials/reports-list.png'),
    ('ai-assistant', '/assets/tutorials/ai-list.png'),
    ('workflow-first-steps', '/assets/tutorials/workflows-list.png'),
    ('demo-data-cleanup', '/assets/tutorials/demo-list.png')
)
update public.cms_tutorial_posts p
set
  cover_image_url = coalesce(nullif(trim(p.cover_image_url), ''), covers.image_url),
  og_image_url = coalesce(nullif(trim(p.og_image_url), ''), covers.image_url)
from covers
where p.slug = covers.slug;

notify pgrst, 'reload schema';

commit;
