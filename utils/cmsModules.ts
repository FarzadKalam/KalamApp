import type { ModuleDefinition } from '../types';

// ──────────────────────────────────────────────────
// Blog Posts — list/meta only (editor is custom)
// ──────────────────────────────────────────────────
export const cmsBlogPostsConfig: ModuleDefinition = {
  id: 'cms_blog_posts',
  label: { fa: 'پست‌های بلاگ' },
  nature: 'STANDARD',
  fields: [
    { key: 'title', type: 'TEXT', labels: { fa: 'عنوان' }, isKey: true, location: 'HEADER' },
    { key: 'slug', type: 'TEXT', labels: { fa: 'Slug' }, location: 'HEADER' },
    {
      key: 'status', type: 'SELECT', labels: { fa: 'وضعیت' }, location: 'HEADER',
      options: [
        { value: 'draft', label: 'پیش‌نویس' },
        { value: 'published', label: 'منتشرشده' },
        { value: 'archived', label: 'آرشیو' },
      ],
    },
    { key: 'is_featured', type: 'CHECKBOX', labels: { fa: 'ویژه' }, location: 'HEADER' },
    { key: 'published_at', type: 'DATETIME', labels: { fa: 'تاریخ انتشار' }, location: 'HEADER' },
    { key: 'reading_time_minutes', type: 'NUMBER', labels: { fa: 'زمان مطالعه (دقیقه)' }, location: 'SIDEBAR' },
    { key: 'excerpt', type: 'LONG_TEXT', labels: { fa: 'خلاصه' }, location: 'BODY' },
    { key: 'cover_image_url', type: 'TEXT', labels: { fa: 'تصویر کاور' }, location: 'SIDEBAR' },
    { key: 'seo_title', type: 'TEXT', labels: { fa: 'عنوان SEO' }, location: 'SIDEBAR' },
    { key: 'seo_description', type: 'LONG_TEXT', labels: { fa: 'توضیح SEO' }, location: 'SIDEBAR' },
    { key: 'focus_keyword', type: 'TEXT', labels: { fa: 'کلمه کلیدی' }, location: 'SIDEBAR' },
  ],
  defaultView: 'table',
  views: [
    {
      id: 'default',
      label: { fa: 'همه پست‌ها' },
      type: 'table',
      columns: ['title', 'status', 'is_featured', 'published_at'],
      sort: [{ field: 'published_at', direction: 'desc' }],
    },
  ],
};

// ──────────────────────────────────────────────────
// Tutorial Posts
// ──────────────────────────────────────────────────
export const cmsTutorialPostsConfig: ModuleDefinition = {
  id: 'cms_tutorial_posts',
  label: { fa: 'آموزش‌ها' },
  nature: 'STANDARD',
  fields: [
    { key: 'title', type: 'TEXT', labels: { fa: 'عنوان' }, isKey: true, location: 'HEADER' },
    { key: 'slug', type: 'TEXT', labels: { fa: 'Slug' }, location: 'HEADER' },
    {
      key: 'status', type: 'SELECT', labels: { fa: 'وضعیت' }, location: 'HEADER',
      options: [
        { value: 'draft', label: 'پیش‌نویس' },
        { value: 'published', label: 'منتشرشده' },
        { value: 'archived', label: 'آرشیو' },
      ],
    },
    {
      key: 'difficulty_level', type: 'SELECT', labels: { fa: 'سطح' }, location: 'HEADER',
      options: [
        { value: 'beginner', label: 'مبتدی' },
        { value: 'intermediate', label: 'متوسط' },
        { value: 'advanced', label: 'پیشرفته' },
        { value: 'expert', label: 'حرفه‌ای' },
      ],
    },
    { key: 'is_featured', type: 'CHECKBOX', labels: { fa: 'ویژه' }, location: 'HEADER' },
    { key: 'published_at', type: 'DATETIME', labels: { fa: 'تاریخ انتشار' }, location: 'HEADER' },
    { key: 'duration_minutes', type: 'NUMBER', labels: { fa: 'مدت (دقیقه)' }, location: 'SIDEBAR' },
    { key: 'series_order', type: 'NUMBER', labels: { fa: 'ترتیب در دوره' }, location: 'SIDEBAR' },
    { key: 'excerpt', type: 'LONG_TEXT', labels: { fa: 'خلاصه' }, location: 'BODY' },
    { key: 'cover_image_url', type: 'TEXT', labels: { fa: 'تصویر کاور' }, location: 'SIDEBAR' },
    { key: 'seo_title', type: 'TEXT', labels: { fa: 'عنوان SEO' }, location: 'SIDEBAR' },
    { key: 'focus_keyword', type: 'TEXT', labels: { fa: 'کلمه کلیدی' }, location: 'SIDEBAR' },
  ],
  defaultView: 'table',
  views: [
    {
      id: 'default',
      label: { fa: 'همه آموزش‌ها' },
      type: 'table',
      columns: ['title', 'difficulty_level', 'status', 'published_at'],
      sort: [{ field: 'published_at', direction: 'desc' }],
    },
  ],
};

// ──────────────────────────────────────────────────
// Tutorial Series
// ──────────────────────────────────────────────────
export const cmsTutorialSeriesConfig: ModuleDefinition = {
  id: 'cms_tutorial_series',
  label: { fa: 'دوره‌های آموزشی' },
  nature: 'STANDARD',
  fields: [
    { key: 'title', type: 'TEXT', labels: { fa: 'نام دوره' }, isKey: true, location: 'HEADER' },
    { key: 'slug', type: 'TEXT', labels: { fa: 'Slug' }, location: 'HEADER' },
    { key: 'is_featured', type: 'CHECKBOX', labels: { fa: 'ویژه' }, location: 'HEADER' },
    { key: 'sort_order', type: 'NUMBER', labels: { fa: 'ترتیب نمایش' }, location: 'HEADER' },
    { key: 'description', type: 'LONG_TEXT', labels: { fa: 'توضیح' }, location: 'BODY' },
    { key: 'cover_image_url', type: 'TEXT', labels: { fa: 'تصویر کاور' }, location: 'SIDEBAR' },
    { key: 'seo_title', type: 'TEXT', labels: { fa: 'عنوان SEO' }, location: 'SIDEBAR' },
    { key: 'seo_description', type: 'LONG_TEXT', labels: { fa: 'توضیح SEO' }, location: 'SIDEBAR' },
  ],
  defaultView: 'table',
};

// ──────────────────────────────────────────────────
// Categories
// ──────────────────────────────────────────────────
export const cmsCategoriesConfig: ModuleDefinition = {
  id: 'cms_categories',
  label: { fa: 'دسته‌بندی‌ها' },
  nature: 'STANDARD',
  fields: [
    { key: 'name', type: 'TEXT', labels: { fa: 'نام' }, isKey: true, location: 'HEADER' },
    { key: 'slug', type: 'TEXT', labels: { fa: 'Slug' }, location: 'HEADER' },
    {
      key: 'type', type: 'SELECT', labels: { fa: 'نوع' }, location: 'HEADER',
      options: [
        { value: 'blog', label: 'فقط بلاگ' },
        { value: 'tutorial', label: 'فقط آموزش' },
        { value: 'both', label: 'هر دو' },
      ],
    },
    { key: 'sort_order', type: 'NUMBER', labels: { fa: 'ترتیب' }, location: 'HEADER' },
    { key: 'description', type: 'LONG_TEXT', labels: { fa: 'توضیح' }, location: 'BODY' },
    { key: 'cover_image_url', type: 'TEXT', labels: { fa: 'تصویر' }, location: 'SIDEBAR' },
    { key: 'seo_title', type: 'TEXT', labels: { fa: 'عنوان SEO' }, location: 'SIDEBAR' },
    { key: 'seo_description', type: 'LONG_TEXT', labels: { fa: 'توضیح SEO' }, location: 'SIDEBAR' },
  ],
  defaultView: 'table',
};

// ──────────────────────────────────────────────────
// Tags
// ──────────────────────────────────────────────────
export const cmsTagsConfig: ModuleDefinition = {
  id: 'cms_tags',
  label: { fa: 'برچسب‌ها' },
  nature: 'STANDARD',
  fields: [
    { key: 'name', type: 'TEXT', labels: { fa: 'نام' }, isKey: true, location: 'HEADER' },
    { key: 'slug', type: 'TEXT', labels: { fa: 'Slug' }, location: 'HEADER' },
    {
      key: 'type', type: 'SELECT', labels: { fa: 'نوع' }, location: 'HEADER',
      options: [
        { value: 'blog', label: 'بلاگ' },
        { value: 'tutorial', label: 'آموزش' },
        { value: 'both', label: 'هر دو' },
      ],
    },
  ],
  defaultView: 'table',
};

export const CMS_MODULES = [
  cmsBlogPostsConfig,
  cmsTutorialPostsConfig,
  cmsTutorialSeriesConfig,
  cmsCategoriesConfig,
  cmsTagsConfig,
];
