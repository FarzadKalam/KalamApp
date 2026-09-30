import { BlockType } from '../../types';
import { getFieldLabelFa } from '../fieldLabel';
import { hasMeaningfulPrintValue, isPrintableModuleField } from './printableFields';

export type PrintCatalogFieldKind = 'record' | 'table' | 'system' | 'company';

export type PrintCatalogField = {
  key: string;
  labels: { fa: string };
  label: string;
  group: string;
  kind: PrintCatalogFieldKind;
  type?: unknown;
  blockId?: string;
  parentKey?: string;
  hasValue: boolean;
  defaultSelected?: boolean;
  value?: unknown;
};

const normalizeText = (value: unknown) => String(value || '').trim();

export const isPrintableTableBlock = (block: any) => {
  const type = String(block?.type || '').trim();
  return Boolean(
    block?.id
    && block?.printable !== false
    && (type === BlockType.TABLE || type === BlockType.GRID_TABLE),
  );
};

/**
 * The effective module schema is already tenant-aware when this function is
 * called. Keeping this catalog schema-driven prevents print from falling back
 * to static module definitions after an administrator changes field labels,
 * order, or visibility in module settings.
 */
export const buildModulePrintFieldCatalog = ({
  moduleConfig,
  record,
  canViewField,
}: {
  moduleConfig: any;
  record?: any;
  canViewField?: (fieldKey: string) => boolean;
}): PrintCatalogField[] => {
  const fields = Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [];
  const blocks = Array.isArray(moduleConfig?.blocks) ? moduleConfig.blocks : [];
  const blockById = new Map(
    blocks.map((block: any) => [normalizeText(block?.id), block] as const),
  );
  const result: PrintCatalogField[] = [];

  fields
    .filter((field: any) => isPrintableModuleField(moduleConfig, field))
    .filter((field: any) => canViewField?.(normalizeText(field?.key)) !== false)
    .sort((a: any, b: any) => Number(a?.order || 0) - Number(b?.order || 0))
    .forEach((field: any) => {
      const key = normalizeText(field?.key);
      if (!key) return;
      const blockId = normalizeText(field?.blockId);
      const block = blockId ? blockById.get(blockId) : null;
      const isBlockField = String(field?.location || '').toLowerCase() === 'block' && Boolean(blockId);
      if (isBlockField && block?.printable === false) return;
      const label = getFieldLabelFa(field, { moduleId: moduleConfig?.id, fallback: key });
      const value = record?.[key];
      result.push({
        key: `record.${key}`,
        labels: { fa: label },
        label,
        group: isBlockField ? `بخش: ${normalizeText(block?.titles?.fa) || blockId}` : 'فیلدهای عمومی',
        kind: 'record',
        type: field?.type,
        hasValue: hasMeaningfulPrintValue(value, key),
        value,
      });
    });

  blocks
    .filter(isPrintableTableBlock)
    .sort((a: any, b: any) => Number(a?.order || 0) - Number(b?.order || 0))
    .forEach((block: any) => {
      const blockId = normalizeText(block.id);
      const blockLabel = normalizeText(block?.titles?.fa) || blockId;
      const parentKey = `block.${blockId}`;
      const rows = Array.isArray(record?.[blockId]) ? record[blockId] : [];
      if (canViewField?.(blockId) === false) return;
      result.push({
        key: parentKey,
        labels: { fa: blockLabel },
        label: blockLabel,
        group: `جدول: ${blockLabel}`,
        kind: 'table',
        blockId,
        hasValue: rows.length > 0,
      });
      (Array.isArray(block?.tableColumns) ? block.tableColumns : []).forEach((column: any) => {
        const columnKey = normalizeText(column?.key);
        if (!columnKey) return;
        if (canViewField?.(`${blockId}.${columnKey}`) === false || canViewField?.(columnKey) === false) return;
        const label = getFieldLabelFa(
          { ...column, key: columnKey, labels: column?.labels || { fa: column?.title || columnKey } },
          { moduleId: moduleConfig?.id, fallback: columnKey },
        );
        result.push({
          key: `${parentKey}.${columnKey}`,
          labels: { fa: label },
          label,
          group: `جدول: ${blockLabel}`,
          kind: 'table',
          blockId,
          parentKey,
          type: column?.type,
          hasValue: rows.some((row: any) => hasMeaningfulPrintValue(row?.[columnKey], columnKey)),
        });
      });
    });

  return result;
};

/** Converts the historical parent-only table selection into explicit columns. */
export const expandLegacyTableSelection = (
  selectedKeys: Iterable<unknown> | null | undefined,
  catalog: Array<Pick<PrintCatalogField, 'key' | 'parentKey'>>,
) => {
  const selected = Array.from(new Set(Array.from(selectedKeys || []).map(normalizeText).filter(Boolean)));
  const selectedSet = new Set(selected);
  const expanded = [...selected];
  catalog
    .filter((item) => item.parentKey)
    .forEach((item) => {
      const parentKey = String(item.parentKey);
      const hasExplicitChild = catalog.some(
        (candidate) => candidate.parentKey === parentKey && selectedSet.has(candidate.key),
      );
      if (selectedSet.has(parentKey) && !hasExplicitChild) expanded.push(item.key);
    });
  return Array.from(new Set(expanded));
};

export const getSelectedPrintTableColumns = ({
  block,
  blockId,
  selectedFieldKeys,
  hasExplicitSelection,
}: {
  block: any;
  blockId: string;
  selectedFieldKeys: Iterable<string>;
  hasExplicitSelection: boolean;
}) => {
  const parentKey = `block.${blockId}`;
  const selected = new Set(Array.from(selectedFieldKeys || []).map(normalizeText));
  const columns = Array.isArray(block?.tableColumns) ? block.tableColumns : [];
  const selectedChildren = columns.filter((column: any) => selected.has(`${parentKey}.${normalizeText(column?.key)}`));
  if (!hasExplicitSelection) return columns;
  // An explicit empty selection is meaningful: it must not restore every
  // column through the old automatic compact-table fallback. Parent-only
  // legacy selections are expanded before this resolver is called.
  if (!selected.has(parentKey) && selectedChildren.length === 0) return [];
  if (selectedChildren.length === 0) return columns;
  return selectedChildren;
};
