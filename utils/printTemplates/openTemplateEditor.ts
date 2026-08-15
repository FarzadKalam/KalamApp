/** Opens a custom print template in the settings editor without exposing ids in UI. */
export const openPrintTemplateEditor = (moduleId: string, templateId: string) => {
  if (typeof window === 'undefined') return;
  const storedTemplateId = String(templateId || '').replace(/^custom:/, '').trim();
  const normalizedModuleId = String(moduleId || '').trim();
  if (!storedTemplateId || !normalizedModuleId) return;

  const target = new URL('/settings', window.location.origin);
  target.searchParams.set('tab', 'print_templates');
  target.searchParams.set('moduleId', normalizedModuleId);
  target.searchParams.set('templateId', storedTemplateId);
  window.open(`${target.pathname}${target.search}`, '_blank', 'noopener,noreferrer');
};
