begin;

-- SaaS-owned public product documentation, intentionally shared across organizations.
-- Existing CMS policies restrict writing to SaaS administrators; only published articles are public.
alter table public.cms_tutorial_posts
  add column if not exists help_contexts text[] not null default '{}',
  add column if not exists help_group text not null default 'راهنما',
  add column if not exists help_order integer not null default 0;

create index if not exists idx_cms_tutorial_posts_help_contexts
  on public.cms_tutorial_posts using gin(help_contexts) where status = 'published';

commit;
