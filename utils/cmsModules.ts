import {
  FieldLocation,
  FieldType,
  ModuleDefinition,
  ModuleNature,
  ViewMode,
} from '../types';

const buildModule = (
  id: string,
  titleFa: string,
  fields: ModuleDefinition['fields'],
  extra?: Partial<ModuleDefinition>,
): ModuleDefinition => ({
  id,
  table: id,
  titles: {
    fa: titleFa,
    faSingular: titleFa,
  },
  nature: ModuleNature.STANDARD,
  fields,
  blocks: [],
  defaultViewMode: ViewMode.LIST,
  supportedViewModes: [ViewMode.LIST],
  ...extra,
});

export const cmsBlogPostsConfig: ModuleDefinition = buildModule('cms_blog_posts', 'پست‌های بلاگ', [
  { key: 'title', type: FieldType.TEXT, labels: { fa: 'عنوان' }, isKey: true, location: FieldLocation.HEADER },
  { key: 'slug', type: FieldType.TEXT, labels: { fa: 'Slug' }, location: FieldLocation.HEADER },
  {
    key: 'status',
    type: FieldType.SELECT,
    labels: { fa: 'وضعیت' },
    location: FieldLocation.HEADER,
    options: [
      { value: 'draft', label: 'پیش‌نویس' },
      { value: 'published', label: 'منتشرشده' },
      { value: 'archived', label: 'آرشیو' },
    ],
  },
  { key: 'is_featured', type: FieldType.CHECKBOX, labels: { fa: 'ویژه' }, location: FieldLocation.HEADER },
  { key: 'published_at', type: FieldType.DATETIME, labels: { fa: 'تاریخ انتشار' }, location: FieldLocation.HEADER },
  { key: 'reading_time_minutes', type: FieldType.NUMBER, labels: { fa: 'زمان مطالعه (دقیقه)' }, location: FieldLocation.BLOCK },
  { key: 'excerpt', type: FieldType.LONG_TEXT, labels: { fa: 'خلاصه' }, location: FieldLocation.BLOCK },
  { key: 'cover_image_url', type: FieldType.TEXT, labels: { fa: 'تصویر کاور' }, location: FieldLocation.BLOCK },
  { key: 'seo_title', type: FieldType.TEXT, labels: { fa: 'عنوان SEO' }, location: FieldLocation.BLOCK },
  { key: 'seo_description', type: FieldType.LONG_TEXT, labels: { fa: 'توضیح SEO' }, location: FieldLocation.BLOCK },
  { key: 'focus_keyword', type: FieldType.TEXT, labels: { fa: 'کلمه کلیدی' }, location: FieldLocation.BLOCK },
]);

export const cmsTutorialPostsConfig: ModuleDefinition = buildModule('cms_tutorial_posts', 'آموزش‌ها', [
  { key: 'title', type: FieldType.TEXT, labels: { fa: 'عنوان' }, isKey: true, location: FieldLocation.HEADER },
  { key: 'slug', type: FieldType.TEXT, labels: { fa: 'Slug' }, location: FieldLocation.HEADER },
  {
    key: 'status',
    type: FieldType.SELECT,
    labels: { fa: 'وضعیت' },
    location: FieldLocation.HEADER,
    options: [
      { value: 'draft', label: 'پیش‌نویس' },
      { value: 'published', label: 'منتشرشده' },
      { value: 'archived', label: 'آرشیو' },
    ],
  },
  {
    key: 'difficulty_level',
    type: FieldType.SELECT,
    labels: { fa: 'سطح' },
    location: FieldLocation.HEADER,
    options: [
      { value: 'beginner', label: 'مبتدی' },
      { value: 'intermediate', label: 'متوسط' },
      { value: 'advanced', label: 'پیشرفته' },
      { value: 'expert', label: 'حرفه‌ای' },
    ],
  },
  { key: 'is_featured', type: FieldType.CHECKBOX, labels: { fa: 'ویژه' }, location: FieldLocation.HEADER },
  { key: 'published_at', type: FieldType.DATETIME, labels: { fa: 'تاریخ انتشار' }, location: FieldLocation.HEADER },
  { key: 'duration_minutes', type: FieldType.NUMBER, labels: { fa: 'مدت (دقیقه)' }, location: FieldLocation.BLOCK },
  { key: 'series_order', type: FieldType.NUMBER, labels: { fa: 'ترتیب در دوره' }, location: FieldLocation.BLOCK },
  { key: 'excerpt', type: FieldType.LONG_TEXT, labels: { fa: 'خلاصه' }, location: FieldLocation.BLOCK },
  { key: 'cover_image_url', type: FieldType.TEXT, labels: { fa: 'تصویر کاور' }, location: FieldLocation.BLOCK },
  { key: 'seo_title', type: FieldType.TEXT, labels: { fa: 'عنوان SEO' }, location: FieldLocation.BLOCK },
  { key: 'focus_keyword', type: FieldType.TEXT, labels: { fa: 'کلمه کلیدی' }, location: FieldLocation.BLOCK },
]);

export const cmsTutorialSeriesConfig: ModuleDefinition = buildModule('cms_tutorial_series', 'دوره‌های آموزشی', [
  { key: 'title', type: FieldType.TEXT, labels: { fa: 'نام دوره' }, isKey: true, location: FieldLocation.HEADER },
  { key: 'slug', type: FieldType.TEXT, labels: { fa: 'Slug' }, location: FieldLocation.HEADER },
  { key: 'is_featured', type: FieldType.CHECKBOX, labels: { fa: 'ویژه' }, location: FieldLocation.HEADER },
  { key: 'sort_order', type: FieldType.NUMBER, labels: { fa: 'ترتیب نمایش' }, location: FieldLocation.HEADER },
  { key: 'description', type: FieldType.LONG_TEXT, labels: { fa: 'توضیح' }, location: FieldLocation.BLOCK },
  { key: 'cover_image_url', type: FieldType.TEXT, labels: { fa: 'تصویر کاور' }, location: FieldLocation.BLOCK },
  { key: 'seo_title', type: FieldType.TEXT, labels: { fa: 'عنوان SEO' }, location: FieldLocation.BLOCK },
  { key: 'seo_description', type: FieldType.LONG_TEXT, labels: { fa: 'توضیح SEO' }, location: FieldLocation.BLOCK },
]);

export const cmsCategoriesConfig: ModuleDefinition = buildModule('cms_categories', 'دسته‌بندی‌ها', [
  { key: 'name', type: FieldType.TEXT, labels: { fa: 'نام' }, isKey: true, location: FieldLocation.HEADER },
  { key: 'slug', type: FieldType.TEXT, labels: { fa: 'Slug' }, location: FieldLocation.HEADER },
  {
    key: 'type',
    type: FieldType.SELECT,
    labels: { fa: 'نوع' },
    location: FieldLocation.HEADER,
    options: [
      { value: 'blog', label: 'فقط بلاگ' },
      { value: 'tutorial', label: 'فقط آموزش' },
      { value: 'both', label: 'هر دو' },
    ],
  },
  { key: 'sort_order', type: FieldType.NUMBER, labels: { fa: 'ترتیب' }, location: FieldLocation.HEADER },
  { key: 'description', type: FieldType.LONG_TEXT, labels: { fa: 'توضیح' }, location: FieldLocation.BLOCK },
  { key: 'cover_image_url', type: FieldType.TEXT, labels: { fa: 'تصویر' }, location: FieldLocation.BLOCK },
  { key: 'seo_title', type: FieldType.TEXT, labels: { fa: 'عنوان SEO' }, location: FieldLocation.BLOCK },
  { key: 'seo_description', type: FieldType.LONG_TEXT, labels: { fa: 'توضیح SEO' }, location: FieldLocation.BLOCK },
]);

export const cmsTagsConfig: ModuleDefinition = buildModule('cms_tags', 'برچسب‌ها', [
  { key: 'name', type: FieldType.TEXT, labels: { fa: 'نام' }, isKey: true, location: FieldLocation.HEADER },
  { key: 'slug', type: FieldType.TEXT, labels: { fa: 'Slug' }, location: FieldLocation.HEADER },
  {
    key: 'type',
    type: FieldType.SELECT,
    labels: { fa: 'نوع' },
    location: FieldLocation.HEADER,
    options: [
      { value: 'blog', label: 'بلاگ' },
      { value: 'tutorial', label: 'آموزش' },
      { value: 'both', label: 'هر دو' },
    ],
  },
]);

export const CMS_MODULES = [
  cmsBlogPostsConfig,
  cmsTutorialPostsConfig,
  cmsTutorialSeriesConfig,
  cmsCategoriesConfig,
  cmsTagsConfig,
];
