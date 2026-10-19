/** Published product documentation is SaaS-owned public content, shared across tenants. */
export const TUTORIAL_SURFACES = [
  { value: 'list', label: 'فهرست رکوردها' },
  { value: 'show', label: 'جزئیات رکورد' },
  { value: 'form', label: 'فرم ایجاد و ویرایش' },
];

export const TUTORIAL_PAGES = [
  { value: 'page:dashboard', label: 'داشبورد' },
  { value: 'page:reports', label: 'گزارش‌ها و گزارش‌ساز' },
  { value: 'page:ai', label: 'هوش مصنوعی' },
  { value: 'page:settings', label: 'تنظیمات' },
  { value: 'page:hr', label: 'منابع انسانی' },
  { value: 'page:accounting', label: 'حسابداری' },
  { value: 'page:web_forms', label: 'وب‌فرم‌ها' },
  { value: 'page:customer-club', label: 'باشگاه مشتریان' },
  { value: 'page:gallery', label: 'مدیریت فایل‌ها' },
];

export function getTutorialContexts(pathname: string, moduleIds: readonly string[]): string[] {
  const [section, record, action] = pathname.split('/').filter(Boolean);
  if (!section) return ['page:dashboard'];
  if (section === 'taze-system' || section.startsWith('cms_') || section.startsWith('saas_')) return [];
  if (moduleIds.includes(section)) {
    const surface = record === 'create' || action === 'edit' ? 'form' : record ? 'show' : 'list';
    return [`module:${section}`, `surface:${surface}`, `module:${section}:${surface}`];
  }
  return [`page:${section}`];
}

export function getFormTutorialContexts(moduleId: string): string[] {
  if (moduleId.startsWith('cms_') || moduleId.startsWith('saas_')) return [];
  return [`module:${moduleId}`, 'surface:form', `module:${moduleId}:form`];
}
