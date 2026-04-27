import type { PrintTemplateVariableOption, SystemTemplateFieldOption } from './store';

type CanViewField = ((fieldKey: string) => boolean) | undefined;

const toPath = (value: unknown) => String(value || '').trim();

export const canViewPrintTemplateFieldPath = (
  fieldPath: string,
  canViewField?: CanViewField,
): boolean => {
  const normalizedPath = toPath(fieldPath);
  if (!normalizedPath) return false;
  if (!canViewField) return true;

  if (normalizedPath === 'responsible.name') {
    return canViewField('assignee_id') !== false;
  }

  if (normalizedPath.startsWith('record.')) {
    const recordFieldKey = toPath(normalizedPath.replace(/^record\./, ''));
    if (!recordFieldKey) return true;
    return canViewField(recordFieldKey) !== false;
  }

  if (normalizedPath.startsWith('block.')) {
    const [, rawBlockId, ...rest] = normalizedPath.split('.');
    const blockId = toPath(rawBlockId);
    if (!blockId) return true;
    if (canViewField(blockId) === false) return false;

    const columnKey = toPath(rest.join('.'));
    if (!columnKey) return true;

    return canViewField(columnKey) !== false && canViewField(`${blockId}.${columnKey}`) !== false;
  }

  return true;
};

export const filterPrintTemplateVariableOptions = (
  options: PrintTemplateVariableOption[],
  canViewField?: CanViewField,
): PrintTemplateVariableOption[] =>
  (options || []).filter((item) => canViewPrintTemplateFieldPath(String(item?.value || ''), canViewField));

export const filterSystemTemplateFieldOptions = (
  options: SystemTemplateFieldOption[],
  canViewField?: CanViewField,
): SystemTemplateFieldOption[] =>
  (options || []).filter((item) => canViewPrintTemplateFieldPath(String(item?.key || ''), canViewField));

export const sanitizeSelectedPrintFieldKeys = (
  selectedKeys: string[] | null | undefined,
  allowedKeys: Iterable<string>,
): string[] => {
  const allowedKeySet = new Set(Array.from(allowedKeys).map((value) => toPath(value)).filter(Boolean));
  const sourceKeys = Array.isArray(selectedKeys) ? selectedKeys : [];

  return Array.from(
    new Set(
      sourceKeys
        .map((value) => toPath(value))
        .filter((value) => value && allowedKeySet.has(value)),
    ),
  );
};
