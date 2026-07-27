import { hasMeaningfulRichTextContent } from '../richText';

/** Shared, renderer-agnostic rules for fields available to print. */
export const isPrintableModuleField = (moduleConfig: any, field: any): boolean => {
  const fieldKey = String(field?.key || '').trim();
  if (!fieldKey || field?.printable === false) return false;

  const blockId = String(field?.blockId || '').trim();
  const isBlockField = String(field?.location || '').trim().toLowerCase() === 'block' && Boolean(blockId);
  if (!isBlockField) return true;

  const block = (Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : []).find(
    (item: any) => String(item?.id || '').trim() === blockId,
  );
  return block?.printable !== false;
};

const toComparableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value)
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/,/g, '')
    .trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const hasMeaningfulPrintValue = (value: unknown, fieldKey = ''): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && !hasMeaningfulRichTextContent(value)) return false;
  if (Array.isArray(value)) return value.length > 0;

  // Zero is a storage default for financial discounts, but is visually empty.
  if (/discount/i.test(String(fieldKey || '').trim())) {
    const numericValue = toComparableNumber(value);
    if (numericValue === 0) return false;
  }

  return true;
};

const normalizePrintFieldKeys = (keys: Iterable<unknown>, allowedKeys: Set<string>) =>
  Array.from(
    new Set(
      Array.from(keys)
        .map((key) => String(key || '').trim())
        .filter((key) => key && allowedKeys.has(key)),
    ),
  );

/**
 * A single selection contract for record, list, and system-template printers.
 * An absent selection uses value-aware defaults; an explicit empty selection
 * means that the user selected nothing and must never fall back to "all".
 */
export const resolveEffectivePrintFieldKeys = ({
  fields,
  selectedKeys,
  hasExplicitSelection,
}: {
  fields: Array<{ key?: unknown; hasValue?: boolean; defaultSelected?: boolean }>;
  selectedKeys?: Iterable<unknown> | null;
  hasExplicitSelection: boolean;
}): string[] => {
  const allowedKeys = new Set(
    (fields || [])
      .map((field) => String(field?.key || '').trim())
      .filter(Boolean),
  );

  if (hasExplicitSelection) {
    return normalizePrintFieldKeys(selectedKeys || [], allowedKeys);
  }

  return (fields || [])
    .filter((field) => field?.defaultSelected !== false && field?.hasValue !== false)
    .map((field) => String(field?.key || '').trim())
    .filter(Boolean);
};

export const getPrintFieldSelectionCandidates = (fieldPath: string): string[] => {
  const normalizedPath = String(fieldPath || '').trim();
  if (!normalizedPath) return [];

  // Manual templates use bare record keys; system templates use `record.*`.
  if (normalizedPath.startsWith('record.')) {
    const fieldKey = normalizedPath.replace(/^record\./, '').trim();
    return [normalizedPath, ...(fieldKey ? [fieldKey] : [])];
  }
  return [normalizedPath];
};

export const isPrintFieldKnownToTemplate = (fieldPath: string, knownKeys: Iterable<string>): boolean => {
  const knownKeySet = new Set(Array.from(knownKeys).map((key) => String(key || '').trim()).filter(Boolean));
  return getPrintFieldSelectionCandidates(fieldPath).some((candidate) => knownKeySet.has(candidate));
};

export const isPrintFieldSelected = (fieldPath: string, selectedKeys: Iterable<string>): boolean => {
  const selectedKeySet = new Set(Array.from(selectedKeys).map((key) => String(key || '').trim()).filter(Boolean));
  const normalizedPath = String(fieldPath || '').trim();

  if (normalizedPath.startsWith('block.')) {
    const [, blockId, ...columnPath] = normalizedPath.split('.');
    const blockPath = blockId ? `block.${blockId}` : '';
    if (blockPath) {
      // A selected column keeps its parent table visible even when the parent
      // row was not explicitly retained by an older preference. The reverse
      // is intentionally not true: selecting a table must not revive empty
      // columns that are unchecked by default.
      if (columnPath.length === 0) {
        return selectedKeySet.has(blockPath) || Array.from(selectedKeySet).some((key) => key.startsWith(`${blockPath}.`));
      }
      return selectedKeySet.has(normalizedPath);
    }
  }

  return getPrintFieldSelectionCandidates(fieldPath).some((candidate) => selectedKeySet.has(candidate));
};

/** Shared visibility contract for record variables and optional system-template cells. */
export const isPrintTemplateFieldVisible = ({
  fieldPath,
  canView,
  controlsSelection,
  knownFieldKeys,
  selectedFieldKeys,
}: {
  fieldPath: string;
  canView: boolean;
  controlsSelection: boolean;
  knownFieldKeys: Iterable<string>;
  selectedFieldKeys: Iterable<string>;
}) => {
  if (!canView) return false;
  if (!controlsSelection) return true;
  if (!isPrintFieldKnownToTemplate(fieldPath, knownFieldKeys)) return true;
  return isPrintFieldSelected(fieldPath, selectedFieldKeys);
};
