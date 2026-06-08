-- ============================================================
-- Phase 164: CMS — Blog Posts, Tutorials, Categories, Tags
-- ============================================================
-- Global content (no org_id): managed by SaaS admins
-- Public READ for published content, authenticated write for saas_admin
-- ============================================================

-- ──────────────────────────────────────────────────
-- 1. Tutorial Series (دوره‌های آموزشی)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cms_tutorial_series (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  slug              text NOT NULL UNIQUE,
  description       text,
  cover_image_url   text,
  is_featured       boolean NOT NULL DEFAULT false,
  sort_order        int NOT NULL DEFAULT 0,
  seo_title         text,
  seo_description   text,
  og_image_url      text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cms_tutorial_series ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "cms_tutorial_series_public_read"
  ON public.cms_tutorial_series FOR SELECT
  USING (true);

-- SaaS admin write
CREATE POLICY "cms_tutorial_series_saas_admin_all"
  ON public.cms_tutorial_series FOR ALL
  USING (public.current_user_has_saas_admin_permission())
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

CREATE INDEX IF NOT EXISTS idx_cms_tutorial_series_slug ON public.cms_tutorial_series (slug);
CREATE INDEX IF NOT EXISTS idx_cms_tutorial_series_featured ON public.cms_tutorial_series (is_featured) WHERE is_featured = true;

-- ──────────────────────────────────────────────────
-- 2. Blog Posts (مقالات بلاگ)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cms_blog_posts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  slug                  text NOT NULL UNIQUE,
  excerpt               text,
  content_blocks        jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_image_url       text,
  author_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'published', 'archived')),
  is_featured           boolean NOT NULL DEFAULT false,
  published_at          timestamptz,
  reading_time_minutes  int,
  -- SEO
  seo_title             text,
  seo_description       text,
  og_image_url          text,
  canonical_url         text,
  focus_keyword         text,
  schema_extra          jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cms_blog_posts ENABLE ROW LEVEL SECURITY;

-- Public read only published
CREATE POLICY "cms_blog_posts_public_read"
  ON public.cms_blog_posts FOR SELECT
  USING (status = 'published');

-- SaaS admin full access (including drafts)
CREATE POLICY "cms_blog_posts_saas_admin_all"
  ON public.cms_blog_posts FOR ALL
  USING (public.current_user_has_saas_admin_permission())
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

CREATE INDEX IF NOT EXISTS idx_cms_blog_posts_slug ON public.cms_blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_cms_blog_posts_status ON public.cms_blog_posts (status);
CREATE INDEX IF NOT EXISTS idx_cms_blog_posts_featured ON public.cms_blog_posts (is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_cms_blog_posts_published_at ON public.cms_blog_posts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_cms_blog_posts_author ON public.cms_blog_posts (author_id);

-- ──────────────────────────────────────────────────
-- 3. Tutorial Posts (آموزش‌ها)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cms_tutorial_posts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                 text NOT NULL,
  slug                  text NOT NULL UNIQUE,
  excerpt               text,
  content_blocks        jsonb NOT NULL DEFAULT '[]'::jsonb,
  cover_image_url       text,
  author_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'published', 'archived')),
  is_featured           boolean NOT NULL DEFAULT false,
  published_at          timestamptz,
  reading_time_minutes  int,
  -- Tutorial-specific
  difficulty_level      text CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced', 'expert')),
  duration_minutes      int,
  series_id             uuid REFERENCES public.cms_tutorial_series(id) ON DELETE SET NULL,
  series_order          int,
  -- SEO
  seo_title             text,
  seo_description       text,
  og_image_url          text,
  canonical_url         text,
  focus_keyword         text,
  schema_extra          jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cms_tutorial_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_tutorial_posts_public_read"
  ON public.cms_tutorial_posts FOR SELECT
  USING (status = 'published');

CREATE POLICY "cms_tutorial_posts_saas_admin_all"
  ON public.cms_tutorial_posts FOR ALL
  USING (public.current_user_has_saas_admin_permission())
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

CREATE INDEX IF NOT EXISTS idx_cms_tutorial_posts_slug ON public.cms_tutorial_posts (slug);
CREATE INDEX IF NOT EXISTS idx_cms_tutorial_posts_status ON public.cms_tutorial_posts (status);
CREATE INDEX IF NOT EXISTS idx_cms_tutorial_posts_featured ON public.cms_tutorial_posts (is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_cms_tutorial_posts_published_at ON public.cms_tutorial_posts (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_cms_tutorial_posts_series ON public.cms_tutorial_posts (series_id, series_order);
CREATE INDEX IF NOT EXISTS idx_cms_tutorial_posts_difficulty ON public.cms_tutorial_posts (difficulty_level);

-- ──────────────────────────────────────────────────
-- 4. Categories (دسته‌بندی‌ها)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cms_categories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text NOT NULL UNIQUE,
  description       text,
  type              text NOT NULL DEFAULT 'both'
                      CHECK (type IN ('blog', 'tutorial', 'both')),
  parent_id         uuid REFERENCES public.cms_categories(id) ON DELETE SET NULL,
  sort_order        int NOT NULL DEFAULT 0,
  cover_image_url   text,
  seo_title         text,
  seo_description   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cms_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_categories_public_read"
  ON public.cms_categories FOR SELECT
  USING (true);

CREATE POLICY "cms_categories_saas_admin_all"
  ON public.cms_categories FOR ALL
  USING (public.current_user_has_saas_admin_permission())
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

CREATE INDEX IF NOT EXISTS idx_cms_categories_slug ON public.cms_categories (slug);
CREATE INDEX IF NOT EXISTS idx_cms_categories_type ON public.cms_categories (type);
CREATE INDEX IF NOT EXISTS idx_cms_categories_parent ON public.cms_categories (parent_id);

-- ──────────────────────────────────────────────────
-- 5. Tags (برچسب‌ها)
-- ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cms_tags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  type        text NOT NULL DEFAULT 'both'
                CHECK (type IN ('blog', 'tutorial', 'both')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cms_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_tags_public_read"
  ON public.cms_tags FOR SELECT
  USING (true);

CREATE POLICY "cms_tags_saas_admin_all"
  ON public.cms_tags FOR ALL
  USING (public.current_user_has_saas_admin_permission())
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

CREATE INDEX IF NOT EXISTS idx_cms_tags_slug ON public.cms_tags (slug);
CREATE INDEX IF NOT EXISTS idx_cms_tags_type ON public.cms_tags (type);

-- ──────────────────────────────────────────────────
-- 6. Junction Tables (جداول رابط)
-- ──────────────────────────────────────────────────

-- Blog ↔ Categories
CREATE TABLE IF NOT EXISTS public.cms_blog_post_categories (
  post_id       uuid NOT NULL REFERENCES public.cms_blog_posts(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES public.cms_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

ALTER TABLE public.cms_blog_post_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_blog_post_categories_public_read"
  ON public.cms_blog_post_categories FOR SELECT USING (true);

CREATE POLICY "cms_blog_post_categories_saas_admin_all"
  ON public.cms_blog_post_categories FOR ALL
  USING (public.current_user_has_saas_admin_permission('edit'))
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

-- Blog ↔ Tags
CREATE TABLE IF NOT EXISTS public.cms_blog_post_tags (
  post_id   uuid NOT NULL REFERENCES public.cms_blog_posts(id) ON DELETE CASCADE,
  tag_id    uuid NOT NULL REFERENCES public.cms_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

ALTER TABLE public.cms_blog_post_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_blog_post_tags_public_read"
  ON public.cms_blog_post_tags FOR SELECT USING (true);

CREATE POLICY "cms_blog_post_tags_saas_admin_all"
  ON public.cms_blog_post_tags FOR ALL
  USING (public.current_user_has_saas_admin_permission('edit'))
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

-- Tutorial ↔ Categories
CREATE TABLE IF NOT EXISTS public.cms_tutorial_post_categories (
  post_id       uuid NOT NULL REFERENCES public.cms_tutorial_posts(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES public.cms_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

ALTER TABLE public.cms_tutorial_post_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_tutorial_post_categories_public_read"
  ON public.cms_tutorial_post_categories FOR SELECT USING (true);

CREATE POLICY "cms_tutorial_post_categories_saas_admin_all"
  ON public.cms_tutorial_post_categories FOR ALL
  USING (public.current_user_has_saas_admin_permission('edit'))
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

-- Tutorial ↔ Tags
CREATE TABLE IF NOT EXISTS public.cms_tutorial_post_tags (
  post_id   uuid NOT NULL REFERENCES public.cms_tutorial_posts(id) ON DELETE CASCADE,
  tag_id    uuid NOT NULL REFERENCES public.cms_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

ALTER TABLE public.cms_tutorial_post_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cms_tutorial_post_tags_public_read"
  ON public.cms_tutorial_post_tags FOR SELECT USING (true);

CREATE POLICY "cms_tutorial_post_tags_saas_admin_all"
  ON public.cms_tutorial_post_tags FOR ALL
  USING (public.current_user_has_saas_admin_permission('edit'))
  WITH CHECK (public.current_user_has_saas_admin_permission('edit'));

-- ──────────────────────────────────────────────────
-- 7. updated_at trigger
-- ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cms_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER cms_blog_posts_updated_at
  BEFORE UPDATE ON public.cms_blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.cms_set_updated_at();

CREATE TRIGGER cms_tutorial_posts_updated_at
  BEFORE UPDATE ON public.cms_tutorial_posts
  FOR EACH ROW EXECUTE FUNCTION public.cms_set_updated_at();

CREATE TRIGGER cms_tutorial_series_updated_at
  BEFORE UPDATE ON public.cms_tutorial_series
  FOR EACH ROW EXECUTE FUNCTION public.cms_set_updated_at();

CREATE TRIGGER cms_categories_updated_at
  BEFORE UPDATE ON public.cms_categories
  FOR EACH ROW EXECUTE FUNCTION public.cms_set_updated_at();

-- ──────────────────────────────────────────────────
-- 8. Public RPC: get published posts (with joins)
-- ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cms_blog_posts(
  p_status    text DEFAULT 'published',
  p_featured  boolean DEFAULT NULL,
  p_limit     int DEFAULT 20,
  p_offset    int DEFAULT 0,
  p_category  text DEFAULT NULL,
  p_tag       text DEFAULT NULL
)
RETURNS TABLE (
  id                    uuid,
  title                 text,
  slug                  text,
  excerpt               text,
  cover_image_url       text,
  author_name           text,
  author_avatar         text,
  status                text,
  is_featured           boolean,
  published_at          timestamptz,
  reading_time_minutes  int,
  seo_title             text,
  seo_description       text,
  og_image_url          text,
  created_at            timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id, p.title, p.slug, p.excerpt,
    p.cover_image_url,
    pr.full_name AS author_name,
    pr.avatar_url AS author_avatar,
    p.status, p.is_featured, p.published_at,
    p.reading_time_minutes, p.seo_title, p.seo_description,
    p.og_image_url, p.created_at
  FROM public.cms_blog_posts p
  LEFT JOIN public.profiles pr ON pr.id = p.author_id
  WHERE
    (p_status IS NULL OR p.status = p_status)
    AND (p_featured IS NULL OR p.is_featured = p_featured)
    AND (p_category IS NULL OR EXISTS (
      SELECT 1 FROM public.cms_blog_post_categories bpc
      JOIN public.cms_categories c ON c.id = bpc.category_id
      WHERE bpc.post_id = p.id AND c.slug = p_category
    ))
    AND (p_tag IS NULL OR EXISTS (
      SELECT 1 FROM public.cms_blog_post_tags bpt
      JOIN public.cms_tags t ON t.id = bpt.tag_id
      WHERE bpt.post_id = p.id AND t.slug = p_tag
    ))
  ORDER BY p.published_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.get_cms_tutorial_posts(
  p_status          text DEFAULT 'published',
  p_featured        boolean DEFAULT NULL,
  p_limit           int DEFAULT 20,
  p_offset          int DEFAULT 0,
  p_category        text DEFAULT NULL,
  p_tag             text DEFAULT NULL,
  p_series_id       uuid DEFAULT NULL,
  p_difficulty      text DEFAULT NULL
)
RETURNS TABLE (
  id                    uuid,
  title                 text,
  slug                  text,
  excerpt               text,
  cover_image_url       text,
  author_name           text,
  author_avatar         text,
  status                text,
  is_featured           boolean,
  published_at          timestamptz,
  reading_time_minutes  int,
  difficulty_level      text,
  duration_minutes      int,
  series_id             uuid,
  series_order          int,
  seo_title             text,
  seo_description       text,
  og_image_url          text,
  created_at            timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    p.id, p.title, p.slug, p.excerpt,
    p.cover_image_url,
    pr.full_name AS author_name,
    pr.avatar_url AS author_avatar,
    p.status, p.is_featured, p.published_at,
    p.reading_time_minutes, p.difficulty_level, p.duration_minutes,
    p.series_id, p.series_order,
    p.seo_title, p.seo_description, p.og_image_url, p.created_at
  FROM public.cms_tutorial_posts p
  LEFT JOIN public.profiles pr ON pr.id = p.author_id
  WHERE
    (p_status IS NULL OR p.status = p_status)
    AND (p_featured IS NULL OR p.is_featured = p_featured)
    AND (p_series_id IS NULL OR p.series_id = p_series_id)
    AND (p_difficulty IS NULL OR p.difficulty_level = p_difficulty)
    AND (p_category IS NULL OR EXISTS (
      SELECT 1 FROM public.cms_tutorial_post_categories tpc
      JOIN public.cms_categories c ON c.id = tpc.category_id
      WHERE tpc.post_id = p.id AND c.slug = p_category
    ))
    AND (p_tag IS NULL OR EXISTS (
      SELECT 1 FROM public.cms_tutorial_post_tags tpt
      JOIN public.cms_tags t ON t.id = tpt.tag_id
      WHERE tpt.post_id = p.id AND t.slug = p_tag
    ))
  ORDER BY
    CASE WHEN p_series_id IS NOT NULL THEN p.series_order ELSE 0 END,
    p.published_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$$;

-- ──────────────────────────────────────────────────
-- 9. Get single post with full data
-- ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_cms_blog_post_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_post jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'slug', p.slug,
    'excerpt', p.excerpt,
    'content_blocks', p.content_blocks,
    'cover_image_url', p.cover_image_url,
    'author_id', p.author_id,
    'author_name', pr.full_name,
    'author_avatar', pr.avatar_url,
    'status', p.status,
    'is_featured', p.is_featured,
    'published_at', p.published_at,
    'reading_time_minutes', p.reading_time_minutes,
    'seo_title', p.seo_title,
    'seo_description', p.seo_description,
    'og_image_url', p.og_image_url,
    'canonical_url', p.canonical_url,
    'focus_keyword', p.focus_keyword,
    'schema_extra', p.schema_extra,
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug))
      FROM public.cms_blog_post_categories bpc
      JOIN public.cms_categories c ON c.id = bpc.category_id
      WHERE bpc.post_id = p.id
    ), '[]'::jsonb),
    'tags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug))
      FROM public.cms_blog_post_tags bpt
      JOIN public.cms_tags t ON t.id = bpt.tag_id
      WHERE bpt.post_id = p.id
    ), '[]'::jsonb),
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) INTO v_post
  FROM public.cms_blog_posts p
  LEFT JOIN public.profiles pr ON pr.id = p.author_id
  WHERE p.slug = p_slug AND p.status = 'published';

  RETURN v_post;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cms_tutorial_post_by_slug(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_post jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'slug', p.slug,
    'excerpt', p.excerpt,
    'content_blocks', p.content_blocks,
    'cover_image_url', p.cover_image_url,
    'author_id', p.author_id,
    'author_name', pr.full_name,
    'author_avatar', pr.avatar_url,
    'status', p.status,
    'is_featured', p.is_featured,
    'published_at', p.published_at,
    'reading_time_minutes', p.reading_time_minutes,
    'difficulty_level', p.difficulty_level,
    'duration_minutes', p.duration_minutes,
    'series_id', p.series_id,
    'series_order', p.series_order,
    'series', CASE WHEN p.series_id IS NOT NULL THEN (
      SELECT jsonb_build_object(
        'id', s.id, 'title', s.title, 'slug', s.slug,
        'posts', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', sp.id, 'title', sp.title, 'slug', sp.slug,
            'series_order', sp.series_order, 'status', sp.status
          ) ORDER BY sp.series_order)
          FROM public.cms_tutorial_posts sp
          WHERE sp.series_id = p.series_id AND sp.status = 'published'
        ), '[]'::jsonb)
      )
      FROM public.cms_tutorial_series s WHERE s.id = p.series_id
    ) ELSE NULL END,
    'seo_title', p.seo_title,
    'seo_description', p.seo_description,
    'og_image_url', p.og_image_url,
    'canonical_url', p.canonical_url,
    'focus_keyword', p.focus_keyword,
    'schema_extra', p.schema_extra,
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug))
      FROM public.cms_tutorial_post_categories tpc
      JOIN public.cms_categories c ON c.id = tpc.category_id
      WHERE tpc.post_id = p.id
    ), '[]'::jsonb),
    'tags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug))
      FROM public.cms_tutorial_post_tags tpt
      JOIN public.cms_tags t ON t.id = tpt.tag_id
      WHERE tpt.post_id = p.id
    ), '[]'::jsonb),
    'created_at', p.created_at,
    'updated_at', p.updated_at
  ) INTO v_post
  FROM public.cms_tutorial_posts p
  LEFT JOIN public.profiles pr ON pr.id = p.author_id
  WHERE p.slug = p_slug AND p.status = 'published';

  RETURN v_post;
END;
$$;

-- ──────────────────────────────────────────────────
-- 10. Grant permissions
-- ──────────────────────────────────────────────────
GRANT SELECT ON public.cms_blog_posts TO anon, authenticated;
GRANT SELECT ON public.cms_tutorial_posts TO anon, authenticated;
GRANT SELECT ON public.cms_tutorial_series TO anon, authenticated;
GRANT SELECT ON public.cms_categories TO anon, authenticated;
GRANT SELECT ON public.cms_tags TO anon, authenticated;
GRANT SELECT ON public.cms_blog_post_categories TO anon, authenticated;
GRANT SELECT ON public.cms_blog_post_tags TO anon, authenticated;
GRANT SELECT ON public.cms_tutorial_post_categories TO anon, authenticated;
GRANT SELECT ON public.cms_tutorial_post_tags TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.cms_blog_posts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_tutorial_posts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_tutorial_series TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_tags TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_blog_post_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_blog_post_tags TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_tutorial_post_categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.cms_tutorial_post_tags TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_cms_blog_posts TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cms_tutorial_posts TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cms_blog_post_by_slug TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cms_tutorial_post_by_slug TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cms_set_updated_at TO authenticated;
