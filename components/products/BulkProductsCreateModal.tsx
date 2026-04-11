import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Modal, Select, Spin } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import EditableTable from '../EditableTable';
import SmartFieldRenderer from '../SmartFieldRenderer';
import { MODULES } from '../../moduleRegistry';
import { FieldLocation, FieldNature, FieldType, LogicOperator, ModuleField } from '../../types';
import { supabase } from '../../supabaseClient';
import { convertArea, HARD_CODED_UNIT_OPTIONS, type UnitValue } from '../../utils/unitConversions';
import { supportsSystemCode } from '../../utils/systemCode';
import { getPreferredRelationTargetField } from '../../utils/relationTargetField';
import { isAutoNameEnabled, normalizeAutoNameEnabled } from '../../utils/autoName';

interface BulkProductsCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (count: number) => void;
}

type DynamicOption = { label: string; value: string };
type RelationOption = { label: string; value: string };
type AssigneeOption = { label: string; value: string; group: 'user' | 'role' };
type BulkRow = Record<string, unknown> & { key: string };

const PRODUCTS_MODULE = MODULES.products;
const TOP_FIELD_KEYS = new Set(['product_type', 'assignee_id', 'status']);
const SHARED_KEYS = new Set(['category', 'goods_subgroup', 'product_category', 'service_subgroup', 'cost_center_id']);
const EXCLUDED_KEYS = new Set([
  'id',
  'system_code',
  'stock',
  'sub_stock',
  'production_cost',
  'grid_materials',
  'product_inventory',
  'product_stock_movements',
  'assignee_id',
  'assignee_type',
  'product_type',
  'category',
  'product_category',
  'name',
  'manual_code',
  'image_url',
  'auto_name_enabled',
  'tags',
]);
const ROW_INCLUDED_KEYS = new Set([
  'material_type',
  'brand_name',
  'color_name',
  'feature_name',
  'size_value',
  'quality_level',
  'length_value',
  'width_value',
  'buy_price',
  'sell_price',
  'main_unit',
  'sub_unit',
  'related_supplier',
]);
const SPEC_BLOCKS = new Set(['leatherSpec', 'liningSpec', 'kharjkarSpec', 'yaraghSpec']);
const UNSUPPORTED_TYPES = new Set<FieldType>([
  FieldType.TAGS,
  FieldType.PROGRESS_STAGES,
  FieldType.JSON,
  FieldType.READONLY_LOOKUP,
  FieldType.CHECKLIST,
  FieldType.LINK,
  FieldType.LOCATION,
]);

const UNIT_VALUES = new Set<UnitValue>(HARD_CODED_UNIT_OPTIONS.map((u) => u.value));
const BULK_PRODUCTS_DRAFT_KEY = 'kalamapp.bulk_products_create_draft_v1';
const isUnitValue = (v: unknown): v is UnitValue => typeof v === 'string' && UNIT_VALUES.has(v as UnitValue);
const makeKey = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
const toNum = (v: unknown) => {
  const s = String(v ?? '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/,/g, '')
    .trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};
const norm = (v: unknown) => {
  if (v === undefined) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (Array.isArray(v)) return v.length ? v : null;
  return v;
};

const extractRule = (logic: ModuleField['logic']) => {
  if (!logic || typeof logic !== 'object') return null;
  const anyRule = logic as any;
  if (anyRule.visibleIf?.field && anyRule.visibleIf?.operator) return anyRule.visibleIf as { field: string; operator: LogicOperator; value?: unknown };
  if (anyRule.field && anyRule.operator) return { field: anyRule.field, operator: anyRule.operator, value: anyRule.value };
  return null;
};

const loadBulkProductsDraft = () => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(BULK_PRODUCTS_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const persistBulkProductsDraft = (draft: Record<string, unknown>) => {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(BULK_PRODUCTS_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore draft persistence errors
  }
};

const clearBulkProductsDraft = () => {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(BULK_PRODUCTS_DRAFT_KEY);
  } catch {
    // ignore draft cleanup errors
  }
};

const checkVisible = (logic: ModuleField['logic'], values: Record<string, unknown>) => {
  const rule = extractRule(logic);
  if (!rule) return true;
  const fieldValue = values[rule.field];
  switch (rule.operator) {
    case LogicOperator.EQUALS: return fieldValue === rule.value;
    case LogicOperator.NOT_EQUALS: return fieldValue !== rule.value;
    case LogicOperator.CONTAINS: return Array.isArray(fieldValue) ? fieldValue.includes(rule.value) : false;
    case LogicOperator.GREATER_THAN: return Number(fieldValue) > Number(rule.value);
    case LogicOperator.LESS_THAN: return Number(fieldValue) < Number(rule.value);
    default: return true;
  }
};

const BulkProductsCreateModal: React.FC<BulkProductsCreateModalProps> = ({ open, onClose, onCreated }) => {
  const { message: msg } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [productType, setProductType] = useState<string>('goods');
  const [rawCategory, setRawCategory] = useState<string>('');
  const [productCategory, setProductCategory] = useState<string>('');
  const [sharedValues, setSharedValues] = useState<Record<string, unknown>>({});
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [relationOptions, setRelationOptions] = useState<Record<string, RelationOption[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, DynamicOption[]>>({});
  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([]);
  const initializedRef = useRef(false);

  const productTypeField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'product_type'), []);
  const rawCategoryField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'category'), []);
  const serviceCategoryField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'product_category'), []);
  const goodsSubgroupField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'goods_subgroup'), []);
  const serviceSubgroupField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'service_subgroup'), []);
  const costCenterField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'cost_center_id'), []);
  const statusField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'status'), []);
  const assigneeField = useMemo<ModuleField>(() => {
    const existing = PRODUCTS_MODULE.fields.find((f) => f.key === 'assignee_id');
    if (existing) return existing;
    return {
      key: 'assignee_id',
      labels: { fa: 'نام مسئول', en: 'Assignee' },
      type: FieldType.RELATION,
      location: FieldLocation.HEADER,
      relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
      nature: FieldNature.STANDARD,
    } as ModuleField;
  }, []);
  const brandField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'brand_name'), []);
  const nameField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'name'), []);
  const manualCodeField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'manual_code'), []);
  const imageField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'image_url'), []);

  const visibility = useMemo(() => ({ product_type: productType, category: rawCategory, product_category: productCategory }), [productType, rawCategory, productCategory]);
  const currentAssigneeOption = useMemo<AssigneeOption | null>(() => {
    const assigneeId = String(sharedValues.assignee_id || '').trim();
    if (!assigneeId) return null;
    const assigneeType = String(sharedValues.assignee_type || 'user').trim() === 'role' ? 'role' : 'user';
    const currentValue = `${assigneeType}_${assigneeId}`;
    const matched = assigneeOptions.find((item) => item.value === currentValue);
    if (matched) return matched;
    return {
      value: currentValue,
      label: assigneeType === 'role' ? 'در حال بارگذاری نام تیم...' : 'در حال بارگذاری نام مسئول...',
      group: assigneeType,
    };
  }, [assigneeOptions, sharedValues.assignee_id, sharedValues.assignee_type]);
  const groupedAssigneeOptions = useMemo(() => {
    const userOptions = assigneeOptions
      .filter((item) => item.group === 'user')
      .map((item) => ({ label: item.label, value: item.value }));
    const roleOptions = assigneeOptions
      .filter((item) => item.group === 'role')
      .map((item) => ({ label: item.label, value: item.value }));
    const hasCurrentUser = currentAssigneeOption?.group === 'user' && userOptions.some((item) => item.value === currentAssigneeOption.value);
    const hasCurrentRole = currentAssigneeOption?.group === 'role' && roleOptions.some((item) => item.value === currentAssigneeOption.value);
    return [
      {
        label: 'پرسنل',
        options: currentAssigneeOption?.group === 'user' && !hasCurrentUser
          ? [{ label: currentAssigneeOption.label, value: currentAssigneeOption.value }, ...userOptions]
          : userOptions,
      },
      {
        label: 'تیم‌ها',
        options: currentAssigneeOption?.group === 'role' && !hasCurrentRole
          ? [{ label: currentAssigneeOption.label, value: currentAssigneeOption.value }, ...roleOptions]
          : roleOptions,
      },
    ];
  }, [assigneeOptions, currentAssigneeOption]);

  const topFields = useMemo(
    () => [productTypeField, assigneeField, statusField]
      .filter((field): field is ModuleField => Boolean(field))
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [assigneeField, productTypeField, statusField]
  );

  const sharedFields = useMemo(
    () => (productType === 'goods'
      ? [rawCategoryField, goodsSubgroupField, costCenterField]
      : [serviceCategoryField, serviceSubgroupField, costCenterField]
    )
      .filter((field): field is ModuleField => Boolean(field))
      .filter((f) => f.nature !== FieldNature.SYSTEM && f.readonly !== true)
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [costCenterField, goodsSubgroupField, productType, rawCategoryField, serviceCategoryField, serviceSubgroupField]
  );

  const rowFields = useMemo(() => PRODUCTS_MODULE.fields
    .filter((f) => (f.location === FieldLocation.HEADER || f.location === FieldLocation.BLOCK))
    .filter((f) => f.nature !== FieldNature.SYSTEM && f.readonly !== true)
    .filter((f) => !UNSUPPORTED_TYPES.has(f.type))
    .filter((f) => !EXCLUDED_KEYS.has(f.key) && !TOP_FIELD_KEYS.has(f.key) && !SHARED_KEYS.has(f.key))
    .filter((f) => checkVisible(f.logic, visibility))
    .filter((f) => {
      const rule = extractRule(f.logic);
      const logicBound = !!rule && ['category', 'product_type', 'product_category'].includes(rule.field);
      const blockBound = typeof f.blockId === 'string' && SPEC_BLOCKS.has(f.blockId);
      return ROW_INCLUDED_KEYS.has(f.key) || logicBound || blockBound;
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0)), [visibility]);

  const createEmptyRow = useCallback((): BulkRow => {
    const r: BulkRow = { key: makeKey(), auto_name_enabled: true, name: '', manual_code: '', image_url: '', opening_stock: 0 };
    rowFields.forEach((f) => { if (f.defaultValue !== undefined) r[f.key] = f.defaultValue; });
    return r;
  }, [rowFields]);

  const refreshOptions = useCallback(async () => {
    setLoading(true);
    try {
      const dynCats = new Set<string>();
      [...sharedFields, ...rowFields].forEach((f) => { if (f.dynamicOptionsCategory) dynCats.add(f.dynamicOptionsCategory); });
      if (rawCategoryField?.dynamicOptionsCategory) dynCats.add(rawCategoryField.dynamicOptionsCategory);
      if (serviceCategoryField?.dynamicOptionsCategory) dynCats.add(serviceCategoryField.dynamicOptionsCategory);
      const dynMap: Record<string, DynamicOption[]> = {};
      const dynResults = await Promise.all(
        Array.from(dynCats).map((cat) =>
          supabase
            .from('dynamic_options')
            .select('label,value')
            .eq('category', cat)
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .then((result) => ({ cat, ...result }))
        )
      );
      dynResults.forEach(({ cat, data, error }) => {
        if (!error) dynMap[cat] = (data || []) as DynamicOption[];
      });
      setDynamicOptions(dynMap);

      const fetchRoles = async () => {
        const primary = await supabase.from('org_roles').select('id, title').limit(400);
        if (!primary.error) return primary.data || [];
        const fallback = await supabase.from('org_roles').select('*').limit(400);
        if (!fallback.error) return fallback.data || [];
        return [] as any[];
      };
      const [{ data: users }, roles] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, mobile_1').limit(400),
        fetchRoles(),
      ]);
      setAssigneeOptions([
        ...((users || []).map((user: any) => ({
          value: `user_${String(user?.id || '')}`,
          label:
            String(user?.full_name || '').trim() ||
            String(user?.email || '').trim() ||
            String(user?.mobile_1 || '').trim() ||
            `کاربر ${String(user?.id || '').slice(0, 8)}`,
          group: 'user' as const,
        })).filter((item) => item.value !== 'user_')),
        ...((roles || []).map((role: any) => ({
          value: `role_${String(role?.id || '')}`,
          label: String(role?.title || role?.name || role?.id || '').trim(),
          group: 'role' as const,
        })).filter((item) => item.value !== 'role_' && item.label)),
      ]);

      const relMap: Record<string, RelationOption[]> = {};
      const relFields = [...topFields, ...sharedFields, ...rowFields]
        .filter((f) => f.type === FieldType.RELATION && f.relationConfig?.targetModule);
      for (const field of relFields) {
        const target = field.relationConfig?.targetModule;
        const targetField = getPreferredRelationTargetField(target, field.relationConfig?.targetField);
        if (!target) continue;
        const extraFields = target === 'shelves' ? ',shelf_number' : '';
        const selectVariants = [
          `id,${targetField}${supportsSystemCode(target) ? ',system_code' : ''}${extraFields}`,
          `id,${targetField}${extraFields}`,
          `id,${targetField}`,
        ];
        let data: any[] = [];
        for (const selectExpr of selectVariants) {
          const result = await supabase.from(target).select(selectExpr.replace(/,\s*,/g, ',')).limit(400);
          if (!result.error) {
            data = result.data || [];
            break;
          }
          const errorCode = String((result.error as any)?.code || '').toUpperCase();
          const errorText = String((result.error as any)?.message || (result.error as any)?.details || '').toLowerCase();
          const isMissingColumn = errorCode === '42703' || errorCode === 'PGRST204' || errorText.includes('column');
          if (!isMissingColumn) throw result.error;
        }
        relMap[field.key] = (data || []).map((r: any) => ({
          value: String(r.id),
          label: `${r[targetField] || r.shelf_number || r.system_code || r.id}${r.system_code ? ` (${r.system_code})` : ''}`,
        }));
      }
      setRelationOptions(relMap);
    } catch (e) {
      console.error(e);
      msg.error('خطا در دریافت گزینه‌های فرم');
    } finally {
      setLoading(false);
    }
  }, [msg, rowFields, sharedFields, topFields]);

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    const defaultType = String(productTypeField?.defaultValue || productTypeField?.options?.[0]?.value || 'goods');
    const defaultRaw = '';
    const sharedDefaults: Record<string, unknown> = {};
    [...topFields, ...sharedFields].forEach((f) => {
      if (f.defaultValue !== undefined) sharedDefaults[f.key] = f.defaultValue;
      else if (f.key === 'status' && f.options?.[0]) sharedDefaults[f.key] = f.options[0].value;
    });
    const draft = loadBulkProductsDraft();
    const draftRows = Array.isArray(draft?.rows) ? draft.rows : [];
    const hydratedRows = draftRows.length
      ? draftRows.map((row: any) => ({
          ...row,
          key: String(row?.key || makeKey()),
          auto_name_enabled: normalizeAutoNameEnabled(row?.auto_name_enabled, false),
        }))
      : [createEmptyRow()];
    setProductType(String(draft?.productType || defaultType));
    setRawCategory(String(draft?.rawCategory || defaultRaw));
    setProductCategory(String(draft?.productCategory || ''));
    setSharedValues({
      ...sharedDefaults,
      ...((draft?.sharedValues && typeof draft.sharedValues === 'object') ? draft.sharedValues as Record<string, unknown> : {}),
    });
    setRows(hydratedRows);
  }, [createEmptyRow, open, productTypeField?.defaultValue, productTypeField?.options, sharedFields, topFields]);

  useEffect(() => {
    if (!open) return;
    void refreshOptions();
  }, [open, refreshOptions]);

  useEffect(() => {
    if (!open || !initializedRef.current) return;
    persistBulkProductsDraft({
      productType,
      rawCategory,
      productCategory,
      sharedValues,
      rows,
    });
  }, [open, productCategory, productType, rawCategory, rows, sharedValues]);

  const resolveLabel = useCallback((field: ModuleField, value: unknown) => {
    if (isEmpty(value)) return '';
    if (field.type === FieldType.RELATION) return (relationOptions[field.key] || []).find((o) => o.value === String(value))?.label || String(value);
    if (field.dynamicOptionsCategory) return (dynamicOptions[field.dynamicOptionsCategory] || []).find((o) => o.value === String(value) || o.label === String(value))?.label || String(value);
    return (field.options || []).find((o) => String(o.value) === String(value))?.label || String(value);
  }, [dynamicOptions, relationOptions]);

  const buildName = useCallback((row: BulkRow, index: number) => {
    const parts: string[] = [];
    const addPart = (part?: string) => {
      const trimmed = String(part || '').trim();
      if (trimmed) parts.push(trimmed);
    };
    const normalizeDimension = (raw: unknown) => {
      const txt = String(raw ?? '').trim();
      if (!txt) return '';
      const num = parseFloat(txt);
      if (!Number.isFinite(num)) return txt;
      return String(num).replace(/\\.0+$/, '');
    };
    const rawLabel = rawCategoryField?.dynamicOptionsCategory
      ? (dynamicOptions[rawCategoryField.dynamicOptionsCategory] || []).find((o) => o.value === rawCategory)?.label || rawCategory
      : rawCategory;
    const serviceLabel = serviceCategoryField?.dynamicOptionsCategory
      ? (dynamicOptions[serviceCategoryField.dynamicOptionsCategory] || []).find((o) => o.value === productCategory)?.label || productCategory
      : productCategory;

    if (productType === 'goods') {
      addPart(rawLabel);
      addPart(String((sharedValues.goods_subgroup ?? row.goods_subgroup) || ''));
    } else if (productType === 'service') {
      addPart(serviceLabel);
      addPart(String((sharedValues.service_subgroup ?? row.service_subgroup) || ''));
    }

    addPart(String(row.material_type || ''));
    if (brandField) {
      addPart(resolveLabel(brandField, sharedValues.brand_name ?? row.brand_name));
    }
    addPart(String(row.color_name || ''));
    addPart(String(row.feature_name || ''));
    addPart(String(row.quality_level || ''));

    const explicitSize = String(row.size_value || '').trim();
    const lengthValue = normalizeDimension(row.length_value ?? row.length);
    const widthValue = normalizeDimension(row.width_value ?? row.width);
    if (lengthValue && widthValue) {
      addPart(`${lengthValue}X${widthValue}`);
    } else if (lengthValue) {
      addPart(`طول ${lengthValue}`);
    } else if (widthValue) {
      addPart(`عرض ${widthValue}`);
    } else {
      addPart(explicitSize);
    }

    if (!parts.length) {
      rowFields.forEach((f) => { const label = resolveLabel(f, row[f.key]); if (label) addPart(label); });
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim() || `محصول جدید ${index + 1}`;
  }, [brandField, dynamicOptions, productCategory, productType, rawCategory, rawCategoryField?.dynamicOptionsCategory, resolveLabel, rowFields, serviceCategoryField?.dynamicOptionsCategory, sharedValues.brand_name]);

  useEffect(() => {
    setRows((prev) => {
      let changed = false;
      const next = prev.map((row, index) => {
        if (!isAutoNameEnabled(row.auto_name_enabled)) return row;
        const computedName = buildName(row, index);
        if (String(row.name || '').trim() === computedName) return row;
        changed = true;
        return { ...row, name: computedName };
      });
      return changed ? next : prev;
    });
  }, [buildName]);

  const validate = useCallback(() => {
    if (!rows.length) return 'حداقل یک ردیف لازم است.';
    if (productType === 'goods' && !rawCategory) return 'دسته‌بندی کالا انتخاب نشده است.';
    if (productType === 'service' && !productCategory) return 'دسته‌بندی خدمات انتخاب نشده است.';
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      for (const field of rowFields) {
        if (field.validation?.required && isEmpty(row[field.key])) return `ردیف ${i + 1}: فیلد «${field.labels?.fa || field.key}» الزامی است.`;
      }
      if (!isAutoNameEnabled(row.auto_name_enabled) && isEmpty(row.name)) return `ردیف ${i + 1}: نام محصول را وارد کنید.`;
    }
    return null;
  }, [productCategory, productType, rawCategory, rowFields, rows]);

  const handleCreate = useCallback(async () => {
    const error = validate();
    if (error) { msg.error(error); return; }
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || null;
      const productIds: string[] = [];
      const changelogs: Record<string, unknown>[] = [];

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const autoNameEnabled = normalizeAutoNameEnabled(row.auto_name_enabled, false);
        const payload: Record<string, unknown> = { product_type: productType };
        payload.category = productType === 'goods' ? norm(rawCategory) : null;
        payload.product_category = productType === 'service' ? norm(productCategory) : null;
        [...topFields, ...sharedFields].forEach((f) => { const v = norm(sharedValues[f.key]); if (v !== undefined) payload[f.key] = v; });
        rowFields.forEach((f) => { const v = norm(row[f.key]); if (v !== undefined) payload[f.key] = v; });
        payload.manual_code = norm(row.manual_code);
        payload.image_url = norm(row.image_url);
        payload.auto_name_enabled = autoNameEnabled;
        payload.name = autoNameEnabled ? buildName(row, i) : norm(row.name);
        if (userId) {
          payload.created_by = payload.created_by ?? userId;
          payload.updated_by = payload.updated_by ?? userId;
        }
        if (payload.assignee_type === 'role') {
          payload.assignee_role_id = payload.assignee_id;
          payload.assignee_id = null;
        } else if (payload.assignee_role_id !== undefined) {
          payload.assignee_role_id = null;
        }
        if (payload.assignee_id && !payload.assignee_type) {
          payload.assignee_type = 'user';
        }
        const openingStock = toNum(row.opening_stock);
        if (productType === 'goods' && openingStock > 0) {
          payload.stock = openingStock;
          const mainUnit = String(payload.main_unit || '');
          const subUnit = String(payload.sub_unit || '');
          const converted = mainUnit && subUnit && isUnitValue(mainUnit) && isUnitValue(subUnit)
            ? convertArea(openingStock, mainUnit, subUnit)
            : 0;
          payload.sub_stock = Number.isFinite(converted) ? converted : 0;
        }
        if (isEmpty(payload.name)) throw new Error(`ردیف ${i + 1}: نام محصول نامعتبر است.`);

        const { data: inserted, error: insertError } = await supabase.from('products').insert([payload]).select('id,name,system_code,main_unit,sub_unit').single();
        if (insertError || !inserted?.id) throw new Error(`ردیف ${i + 1}: ${insertError?.message || 'ثبت محصول ناموفق بود.'}`);
        const pid = String(inserted.id);
        productIds.push(pid);
        changelogs.push({ module_id: 'products', record_id: pid, action: 'create', user_id: userId, record_title: inserted.name || inserted.system_code || null });
      }

      if (changelogs.length) await supabase.from('changelogs').insert(changelogs);
      clearBulkProductsDraft();
      msg.success(`${productIds.length} محصول با موفقیت ایجاد شد.`);
      onCreated?.(productIds.length);
      onClose();
    } catch (e: any) {
      msg.error(e?.message || 'خطا در ایجاد گروهی محصولات');
    } finally {
      setSaving(false);
    }
  }, [buildName, msg, onClose, onCreated, productCategory, productType, rawCategory, rowFields, rows, sharedFields, sharedValues, topFields, validate]);

  const tableColumns = useMemo(() => [
    { key: 'image_url', title: <PaperClipOutlined />, type: imageField?.type || FieldType.IMAGE, width: 76 },
    { key: 'manual_code', title: manualCodeField?.labels?.fa || 'کد دستی', type: manualCodeField?.type || FieldType.TEXT, width: 150 },
    ...rowFields.map((f) => ({ key: f.key, title: f.labels?.fa || f.key, type: f.type, options: f.options, relationConfig: f.relationConfig, dynamicOptionsCategory: f.dynamicOptionsCategory, defaultValue: f.defaultValue })),
    ...(productType === 'goods'
      ? [{ key: 'opening_stock', title: 'موجودی اول دوره', type: FieldType.NUMBER, width: 140, defaultValue: 0 }]
      : []),
    { key: 'auto_name_enabled', title: 'نامگذاری خودکار', type: FieldType.CHECKBOX, width: 140, defaultValue: false },
    { key: 'name', title: nameField?.labels?.fa || 'نام', type: nameField?.type || FieldType.TEXT, width: 260, readonlyWhen: { field: 'auto_name_enabled', equals: true } },
  ], [imageField?.type, manualCodeField?.labels?.fa, manualCodeField?.type, nameField?.labels?.fa, nameField?.type, productType, rowFields]);

  const tableBlock = useMemo(() => ({
    id: 'bulk_products_table',
    titles: { fa: 'فیلدهای محصول', en: 'Product Rows' },
    tableColumns,
    allowRowCopy: true,
  }), [tableColumns]);

  const typeOptions = useMemo(() => (productTypeField?.options || []).map((o) => ({ label: o.label, value: String(o.value) })), [productTypeField?.options]);
  const rawOptions = useMemo(
    () =>
      rawCategoryField?.dynamicOptionsCategory
        ? (dynamicOptions[rawCategoryField.dynamicOptionsCategory] || []).map((o) => ({ label: o.label, value: String(o.value) }))
        : [],
    [dynamicOptions, rawCategoryField?.dynamicOptionsCategory]
  );
  const serviceOptions = useMemo(
    () =>
      serviceCategoryField?.dynamicOptionsCategory
        ? (dynamicOptions[serviceCategoryField.dynamicOptionsCategory] || []).map((o) => ({ label: o.label, value: String(o.value) }))
        : [],
    [dynamicOptions, serviceCategoryField?.dynamicOptionsCategory]
  );

  return (
    <Modal
      title="افزودن گروهی محصولات"
      open={open}
      onCancel={onClose}
      onOk={handleCreate}
      okText="ثبت گروهی"
      cancelText="انصراف"
      confirmLoading={saving}
      width={1320}
      zIndex={1080}
      destroyOnHidden
      styles={{ body: { maxHeight: '74vh', overflowY: 'auto', paddingTop: 12 } }}
    >
      <Spin spinning={loading}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">نوع محصول</div>
            <Select
              value={productType}
              options={typeOptions}
              onChange={(v) => {
                const nextType = String(v);
                setProductType(nextType);
                setRawCategory('');
                setProductCategory('');
              }}
              className="w-full"
              getPopupContainer={(node) => node?.parentElement || document.body}
              styles={{ popup: { root: { zIndex: 1100 } } }}
            />
          </div>
          <div className="text-xs [&_.ant-input]:!h-8 [&_.ant-input-number]:!h-8 [&_.ant-input-number-input]:!h-8 [&_.ant-select-selector]:!min-h-8 [&_.ant-select-selector]:!h-8 [&_.ant-select-selection-item]:!text-xs [&_.ant-input]:!text-xs [&_.ant-input-number-input]:!text-xs">
            <div className="text-xs text-gray-500 mb-1">{assigneeField.labels?.fa || 'نام مسئول'}</div>
            <Select
              value={
                sharedValues.assignee_id
                  ? `${String(sharedValues.assignee_type || 'user')}_${String(sharedValues.assignee_id || '')}`
                  : undefined
              }
              options={groupedAssigneeOptions}
              loading={loading}
              showSearch
              optionFilterProp="label"
              allowClear
              placeholder="انتخاب کنید"
              className="w-full"
              getPopupContainer={(node) => node?.parentElement || document.body}
              styles={{ popup: { root: { zIndex: 1100 } } }}
              onChange={(val) => {
                const raw = String(val || '').trim();
                if (!raw) {
                  setSharedValues((prev) => ({ ...prev, assignee_id: null, assignee_type: null }));
                  return;
                }
                const [nextType, nextId] = raw.split('_');
                setSharedValues((prev) => ({
                  ...prev,
                  assignee_id: nextId || null,
                  assignee_type: nextType === 'role' ? 'role' : 'user',
                }));
              }}
            />
          </div>
          <div className="text-xs [&_.ant-input]:!h-8 [&_.ant-input-number]:!h-8 [&_.ant-input-number-input]:!h-8 [&_.ant-select-selector]:!min-h-8 [&_.ant-select-selector]:!h-8 [&_.ant-select-selection-item]:!text-xs [&_.ant-input]:!text-xs [&_.ant-input-number-input]:!text-xs">
            <div className="text-xs text-gray-500 mb-1">{statusField?.labels?.fa || 'وضعیت'}</div>
            {statusField && (
              <SmartFieldRenderer
                field={statusField}
                value={sharedValues.status}
                options={statusField.options}
                compactMode
                forceEditMode
                moduleId="products"
                allValues={visibility}
                onChange={(v) => setSharedValues((prev) => ({ ...prev, status: v }))}
              />
            )}
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-3 md:p-4">
          <div className="text-sm font-bold text-gray-700 mb-3">فیلدهای مشترک</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {productType === 'goods' ? (
              <div className="text-xs [&_.ant-input]:!h-8 [&_.ant-input-number]:!h-8 [&_.ant-input-number-input]:!h-8 [&_.ant-select-selector]:!min-h-8 [&_.ant-select-selector]:!h-8 [&_.ant-select-selection-item]:!text-xs [&_.ant-input]:!text-xs [&_.ant-input-number-input]:!text-xs">
                <div className="text-xs text-gray-500 mb-1">گروه کالا</div>
                {rawCategoryField && (
                  <SmartFieldRenderer
                    field={rawCategoryField}
                    value={rawCategory}
                    options={rawOptions}
                    compactMode
                    forceEditMode
                    moduleId="products"
                    allValues={visibility}
                    onChange={(v) => setRawCategory(String(v || ''))}
                    onOptionsUpdate={refreshOptions}
                  />
                )}
              </div>
            ) : (
              <div className="text-xs [&_.ant-input]:!h-8 [&_.ant-input-number]:!h-8 [&_.ant-input-number-input]:!h-8 [&_.ant-select-selector]:!min-h-8 [&_.ant-select-selector]:!h-8 [&_.ant-select-selection-item]:!text-xs [&_.ant-input]:!text-xs [&_.ant-input-number-input]:!text-xs">
                <div className="text-xs text-gray-500 mb-1">گروه خدمات</div>
                {serviceCategoryField && (
                  <SmartFieldRenderer
                    field={serviceCategoryField}
                    value={productCategory}
                    options={serviceOptions}
                    compactMode
                    forceEditMode
                    moduleId="products"
                    allValues={visibility}
                    onChange={(v) => setProductCategory(String(v || ''))}
                    onOptionsUpdate={refreshOptions}
                  />
                )}
              </div>
            )}
            {sharedFields
              .filter((field) => field.key !== 'category' && field.key !== 'product_category')
              .map((f) => (
                <div key={f.key} className="text-xs [&_.ant-input]:!h-8 [&_.ant-input-number]:!h-8 [&_.ant-input-number-input]:!h-8 [&_.ant-select-selector]:!min-h-8 [&_.ant-select-selector]:!h-8 [&_.ant-select-selection-item]:!text-xs [&_.ant-input]:!text-xs [&_.ant-input-number-input]:!text-xs">
                  <div className="text-xs text-gray-500 mb-1">{f.labels?.fa || f.key}</div>
                  <SmartFieldRenderer
                    field={f}
                    value={sharedValues[f.key]}
                    options={
                      f.type === FieldType.RELATION
                        ? (relationOptions[f.key] || [])
                        : (f.dynamicOptionsCategory ? (dynamicOptions[f.dynamicOptionsCategory] || []) : f.options)
                    }
                    compactMode
                    forceEditMode
                    moduleId="products"
                    allValues={visibility}
                    onChange={(v) => setSharedValues((prev) => ({ ...prev, [f.key]: v }))}
                    onOptionsUpdate={refreshOptions}
                  />
                </div>
              ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center"><Spin /></div>
        ) : (
          <EditableTable
            mode="local"
            moduleId="products"
            block={tableBlock}
            initialData={rows}
            relationOptions={relationOptions}
            dynamicOptions={dynamicOptions}
            onChange={(nextRows) => setRows((nextRows || []).map((r: any) => ({ ...r, key: String(r?.key || makeKey()) })))}
            readOnly={false}
          />
        )}
      </div>
      </Spin>
    </Modal>
  );
};

export default BulkProductsCreateModal;
