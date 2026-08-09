import {
  getActivityActionLabel,
  getActivityFieldLabel,
  getActivityTableColumnLabel,
  sanitizeActivityText,
} from './recordActivity';

export type RecordActivityPresentation = {
  actionLabel: string;
  fieldLabel: string;
  blockLabel: string;
  summary: string;
};

/**
 * A single presentation contract for record history wherever it is shown.
 * Values are rendered by the caller with the appropriate ModuleField so
 * prices, dates and relations keep their native project renderers.
 */
export const getRecordActivityPresentation = (row: any): RecordActivityPresentation => {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const moduleId = String(row?.module_id || '').trim();
  const action = String(row?.action || 'update').trim();
  const blockLabel = getActivityFieldLabel(moduleId, row?.field_name, metadata?.blockLabel || row?.field_label);
  const isTableCell = action === 'table_cell_updated' || Boolean(metadata?.columnKey);
  const fieldLabel = isTableCell
    ? getActivityTableColumnLabel(moduleId, row?.field_name, metadata?.columnKey, metadata?.columnLabel)
    : getActivityFieldLabel(moduleId, metadata?.fieldKey || row?.field_name, metadata?.fieldLabel || row?.field_label);

  let summary = '';
  if (isTableCell) {
    const changeKind = String(metadata?.changeKind || '').trim();
    if (changeKind === 'row_added') summary = `«${fieldLabel}» در ردیف جدید جدول «${blockLabel}» ثبت شد`;
    else if (changeKind === 'row_removed') summary = `«${fieldLabel}» از ردیف حذف‌شدهٔ جدول «${blockLabel}» بود`;
    else summary = `«${fieldLabel}» در جدول «${blockLabel}» تغییر کرد`;
  } else if (action === 'update') {
    // Older rows contain the vague legacy summary «یکی از فیلدهای رکورد
    // تغییر کرد».  A field change must always be described from its modular
    // Persian label, regardless of when the row was written.
    summary = `فیلد «${fieldLabel}» تغییر کرد`;
  } else if (metadata?.summary) {
    summary = sanitizeActivityText(metadata.summary, 'تغییر ثبت شد');
  } else {
    summary = `${getActivityActionLabel(action)} ثبت شد`;
  }

  return {
    actionLabel: getActivityActionLabel(action),
    fieldLabel,
    blockLabel,
    summary,
  };
};
