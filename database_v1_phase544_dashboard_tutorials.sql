begin;

drop function if exists public.get_cms_contextual_tutorial_posts(text[], integer);

create function public.get_cms_contextual_tutorial_posts(
  p_contexts text[],
  p_limit integer default 100
)
returns table (
  id uuid,
  title text,
  slug text,
  excerpt text,
  cover_image_url text,
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
    p.cover_image_url,
    coalesce(nullif(trim(p.help_group), ''), 'راهنما') as help_group,
    coalesce(p.help_order, 0) as help_order,
    p.content_blocks
  from public.cms_tutorial_posts p
  where p.status = 'published'
    and coalesce(p.help_contexts, '{}'::text[]) && coalesce(p_contexts, '{}'::text[])
  order by coalesce(p.help_order, 0), p.title
  limit greatest(least(coalesce(p_limit, 100), 100), 1)
$$;

revoke all on function public.get_cms_contextual_tutorial_posts(text[], integer) from public;
grant execute on function public.get_cms_contextual_tutorial_posts(text[], integer) to anon, authenticated;

-- These general guides appear both in the dashboard cards and in the dashboard
-- header help drawer. Future editorial changes remain manageable through CMS.
update public.cms_tutorial_posts
set help_contexts = array(
  select distinct context_name
  from unnest(coalesce(help_contexts, '{}'::text[]) || array['page:dashboard']) as context_name
)
where slug in (
  'working-with-records',
  'customers-and-leads',
  'products-and-prices',
  'process-templates',
  'report-builder',
  'ai-assistant'
);

notify pgrst, 'reload schema';

commit;
