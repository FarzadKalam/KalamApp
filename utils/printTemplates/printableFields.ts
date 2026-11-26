import { hasMeaningfulRichTextContent } from '../richText';

const UNPRINTABLE_FIELD_TYPES = new Set([
  'json',
  'progress_stages',
  'readonly_lookup',
]);

/** Shared, renderer-agnostic rules for fields available to print. */
export const isPrintableModuleField = (moduleConfig: any, field: any): boolean => {
  const fieldKey = String(field?.key || '').trim();
  if (!fieldKey || field?.isActive === false || field?.disabled === true || field?.printable === false) {
    return false;
  }

  const fieldType = String(field?.type || '').trim().toLowerCase();
  if (UNPRINTABLE_FIELD_TYPES.has(fieldType)) {
    return false;
  }

  const blockId = String(field?.blockId || '').trim();
  const isBlockField = Boolean(blockId) && String(field?.location || '').trim().toLowerCase() !== 'header';
  if (!isBlockField) return true;

  const blocks = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : [];
  const block = blocks.find((item: any) => String(item?.id || '').trim() === blockId);
  if (!block) {
    return blocks.length === 0;
  }
  return block?.isActive !== false && block?.disabled !== true && block?.printable !== false;
};

const PAYROLL_EMPLOYEE_FIELD_SUFFIXES = new Set([
  'job_title',
  'national_code',
  'father_name',
  'marital_status',
  'military_service_status',
  'children_count',
  'insurance_number',
]);

export const isPathAllowedByModulePrintSettings = ({
  moduleConfig,
  baseModuleConfig,
  fieldPath,
}: {
  moduleConfig: any;
  baseModuleConfig?: any;
  fieldPath: string;
}): boolean => {
  const rawPath = String(fieldPath || '').trim();
  if (!rawPath) return false;
  const normalizedPath = !rawPath.includes('.') ? `record.${rawPath}` : rawPath;
  const moduleId = String(moduleConfig?.id || '').trim();

  if (moduleId === 'payroll_slips' && normalizedPath.startsWith('employee.')) {
    const suffix = normalizedPath.slice('employee.'.length).trim();
    if (PAYROLL_EMPLOYEE_FIELD_SUFFIXES.has(suffix)) {
      return isPathAllowedByModulePrintSettings({
        moduleConfig,
        baseModuleConfig,
        fieldPath: `record.employee_${suffix}`,
      });
    }
  }

  if (normalizedPath.startsWith('record.')) {
    const fieldKey = normalizedPath.slice('record.'.length).trim();
    if (!fieldKey) return true;
    if (moduleId === 'payroll_slips' && fieldKey === 'employee_job_title') {
      const blocks = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : [];
      const identityBlock = blocks.find((item: any) => String(item?.id || '').trim() === 'employee_identity');
      if (identityBlock) {
        return identityBlock?.isActive !== false && identityBlock?.disabled !== true && identityBlock?.printable !== false;
      }
      const baseBlocks = Array.isArray(baseModuleConfig?.blocks) ? baseModuleConfig.blocks : [];
      if (baseBlocks.some((item: any) => String(item?.id || '').trim() === 'employee_identity')) {
        return false;
      }
      return true;
    }
    const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
    const matched = fields.find((item: any) => String(item?.key || '').trim() === fieldKey);
    if (matched) {
      return isPrintableModuleField(moduleConfig, matched);
    }
    const baseFields = Array.isArray(baseModuleConfig?.fields) ? baseModuleConfig.fields : [];
    const existedInBase = baseFields.some((item: any) => String(item?.key || '').trim() === fieldKey);
    if (existedInBase) return false;
    return true;
  }

  if (normalizedPath.startsWith('block.')) {
    const [, blockId, ...rest] = normalizedPath.split('.');
    const normalizedBlockId = String(blockId || '').trim();
    if (!normalizedBlockId) return true;
    const blocks = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : [];
    const block = blocks.find((item: any) => String(item?.id || '').trim() === normalizedBlockId);
    if (!block) {
      const baseBlocks = Array.isArray(baseModuleConfig?.blocks) ? baseModuleConfig.blocks : [];
      const existedInBase = baseBlocks.some((item: any) => String(item?.id || '').trim() === normalizedBlockId);
      return !existedInBase && blocks.length === 0;
    }
    if (block?.isActive === false || block?.disabled === true || block?.printable === false) {
      return false;
    }
    const columnKey = rest.join('.').trim();
    if (!columnKey) return true;
    const cols = Array.isArray(block?.tableColumns) ? block.tableColumns : [];
    const matchedCol = cols.find((col: any) => String(col?.key || '').trim() === columnKey);
    if (!matchedCol) {
      return cols.length === 0;
    }
    return matchedCol?.isActive !== false && matchedCol?.disabled !== true && matchedCol?.printable !== false;
  }

  return true;
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

export const normalizeSelectionKeysToAllowed = (
  selectedKeys: Iterable<unknown> | null | undefined,
  allowedKeys: Iterable<unknown>,
): string[] => {
  const allowedSet = new Set(
    Array.from(allowedKeys || [])
      .map((key) => String(key || '').trim())
      .filter(Boolean),
  );
  const mapped = Array.from(selectedKeys || []).map((raw) => {
    const key = String(raw || '').trim();
    if (!key) return '';
    if (allowedSet.has(key)) return key;
    if (!key.includes('.') && allowedSet.has(`record.${key}`)) return `record.${key}`;
    if (key.startsWith('record.')) {
      const bare = key.slice('record.'.length).trim();
      if (bare && allowedSet.has(bare)) return bare;
    }
    return key;
  });
  return normalizePrintFieldKeys(mapped, allowedSet);
};

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
    return normalizeSelectionKeysToAllowed(selectedKeys || [], allowedKeys);
  }

  return (fields || [])
    .filter((field) => field?.defaultSelected !== false && field?.hasValue !== false)
    .map((field) => String(field?.key || '').trim())
    .filter(Boolean);
};

/**
 * An empty saved preference is intentional; an empty value-aware default can
 * merely mean that asynchronous list rows have not arrived yet.
 */
export const shouldInitializePrintFieldSelection = ({
  persistedKeys,
  defaultKeys,
}: {
  persistedKeys: Iterable<unknown> | null | undefined;
  defaultKeys: Iterable<unknown>;
}) => Array.isArray(persistedKeys) || Array.from(defaultKeys).length > 0;

export const getPrintFieldSelectionCandidates = (fieldPath: string): string[] => {
  const normalizedPath = String(fieldPath || '').trim();
  if (!normalizedPath) return [];

  // Manual templates may use bare record keys; system templates use `record.*`.
  if (normalizedPath.startsWith('record.')) {
    const fieldKey = normalizedPath.replace(/^record\./, '').trim();
    return [normalizedPath, ...(fieldKey ? [fieldKey] : [])];
  }
  if (!normalizedPath.includes('.')) {
    return [normalizedPath, `record.${normalizedPath}`];
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
