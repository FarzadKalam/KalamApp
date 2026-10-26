export const MODULE_LIST_CREATE_SHORTCUT = 'Alt+Shift+N';
export const isModuleListCreateShortcut = (event: KeyboardEvent) => {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || !event.altKey || !event.shiftKey) return false;
  if (event.code !== 'KeyN' && event.key.toLowerCase() !== 'n') return false;
  const target = event.target as HTMLElement | null;
  return !target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]');
};
