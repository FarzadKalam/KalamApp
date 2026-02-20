import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Modal, Select, Spin } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import EditableTable from '../EditableTable';
import SmartFieldRenderer from '../SmartFieldRenderer';
import { MODULES } from '../../moduleRegistry';
import { FieldLocation, FieldNature, FieldType, LogicOperator, ModuleField } from '../../types';
import { supabase } from '../../supabaseClient';
import { applyInventoryDeltas, syncMultipleProductsStock } from '../../utils/inventoryTransactions';
import { convertArea, HARD_CODED_UNIT_OPTIONS, type UnitValue } from '../../utils/unitConversions';

interface BulkProductsCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (count: number) => void;
}

type DynamicOption = { label: string; value: string };
type RelationOption = { label: string; value: string };
type BulkRow = Record<string, unknown> & { key: string };

const PRODUCTS_MODULE = MODULES.products;
const SHARED_KEYS = new Set(['status', 'main_unit', 'sub_unit', 'buy_price', 'sell_price', 'brand_name']);
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
  const [productType, setProductType] = useState<string>('raw');
  const [rawCategory, setRawCategory] = useState<string>('');
  const [productCategory, setProductCategory] = useState<string>('');
  const [sharedValues, setSharedValues] = useState<Record<string, unknown>>({});
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [relationOptions, setRelationOptions] = useState<Record<string, RelationOption[]>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, DynamicOption[]>>({});
  const [productCategoryOptions, setProductCategoryOptions] = useState<DynamicOption[]>([]);
  const initializedRef = useRef(false);

  const productTypeField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'product_type'), []);
  const rawCategoryField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'category'), []);
  const brandField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'brand_name'), []);
  const nameField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'name'), []);
  const manualCodeField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'manual_code'), []);
  const imageField = useMemo(() => PRODUCTS_MODULE.fields.find((f) => f.key === 'image_url'), []);

  const visibility = useMemo(() => ({ product_type: productType, category: rawCategory, product_category: productCategory }), [productType, rawCategory, productCategory]);

  const sharedFields = useMemo(() => PRODUCTS_MODULE.fields
    .filter((f) => SHARED_KEYS.has(f.key))
    .filter((f) => f.nature !== FieldNature.SYSTEM && f.readonly !== true)
    .sort((a, b) => (a.order || 0) - (b.order || 0)), []);

  const rowFields = useMemo(() => PRODUCTS_MODULE.fields
    .filter((f) => (f.location === FieldLocation.HEADER || f.location === FieldLocation.BLOCK))
    .filter((f) => f.nature !== FieldNature.SYSTEM && f.readonly !== true)
    .filter((f) => !UNSUPPORTED_TYPES.has(f.type))
    .filter((f) => !EXCLUDED_KEYS.has(f.key) && !SHARED_KEYS.has(f.key))
    .filter((f) => checkVisible(f.logic, visibility))
    .filter((f) => {
      const rule = extractRule(f.logic);
      const logicBound = !!rule && ['category', 'product_type', 'product_category'].includes(rule.field);
      const blockBound = typeof f.blockId === 'string' && SPEC_BLOCKS.has(f.blockId);
      return logicBound || blockBound;
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0)), [visibility]);

  const createEmptyRow = useCallback((): BulkRow => {
    const r: BulkRow = { key: makeKey(), auto_name_enabled: true, name: '', manual_code: '', image_url: '', opening_stock: 0, opening_shelf_id: null };
    rowFields.forEach((f) => { if (f.defaultValue !== undefined) r[f.key] = f.defaultValue; });
    return r;
  }, [rowFields]);

  const refreshOptions = useCallback(async () => {
    setLoading(true);
    try {
      const [productCategoriesRes] = await Promise.all([
        supabase.from('dynamic_options').select('label,value').eq('category', 'product_categories').eq('is_active', true).order('display_order', { ascending: true }),
      ]);
      if (productCategoriesRes.error) throw productCategoriesRes.error;
      setProductCategoryOptions((productCategoriesRes.data || []) as DynamicOption[]);

      const dynCats = new Set<string>();
      [...sharedFields, ...rowFields].forEach((f) => { if (f.dynamicOptionsCategory) dynCats.add(f.dynamicOptionsCategory); });
      const dynMap: Record<string, DynamicOption[]> = {};
      for (const cat of Array.from(dynCats)) {
        const { data, error } = await supabase.from('dynamic_options').select('label,value').eq('category', cat).eq('is_active', true).order('display_order', { ascending: true });
        if (!error) dynMap[cat] = (data || []) as DynamicOption[];
      }
      setDynamicOptions(dynMap);

      const relMap: Record<string, RelationOption[]> = {};
      const relFields = [...rowFields, { key: 'opening_shelf_id', type: FieldType.RELATION, relationConfig: { targetModule: 'shelves', targetField: 'name' } as any } as ModuleField]
        .filter((f) => f.type === FieldType.RELATION && f.relationConfig?.targetModule);
      for (const field of relFields) {
        const target = field.relationConfig?.targetModule;
        const targetField = field.relationConfig?.targetField || 'name';
        if (!target) continue;
        const { data, error } = await supabase.from(target).select(`id,${targetField},system_code,shelf_number`).limit(400);
        if (error) continue;
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
  }, [msg, rowFields, sharedFields]);

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    const defaultType = String(productTypeField?.defaultValue || productTypeField?.options?.[0]?.value || 'raw');
    const defaultRaw = String(rawCategoryField?.options?.[0]?.value || '');
    const sharedDefaults: Record<string, unknown> = {};
    sharedFields.forEach((f) => {
      if (f.defaultValue !== undefined) sharedDefaults[f.key] = f.defaultValue;
      else if (f.key === 'status' && f.options?.[0]) sharedDefaults[f.key] = f.options[0].value;
    });
    setProductType(defaultType);
    setRawCategory(defaultRaw);
    setProductCategory('');
    setSharedValues(sharedDefaults);
    setRows([createEmptyRow()]);
  }, [createEmptyRow, open, productTypeField?.defaultValue, productTypeField?.options, rawCategoryField?.options, sharedFields]);

  useEffect(() => {
    if (!open) return;
    void refreshOptions();
  }, [open, refreshOptions]);

  const resolveLabel = useCallback((field: ModuleField, value: unknown) => {
    if (isEmpty(value)) return '';
    if (field.type === FieldType.RELATION) return (relationOptions[field.key] || []).find((o) => o.value === String(value))?.label || String(value);
    if (field.dynamicOptionsCategory) return (dynamicOptions[field.dynamicOptionsCategory] || []).find((o) => o.value === String(value) || o.label === String(value))?.label || String(value);
    return (field.options || []).find((o) => String(o.value) === String(value))?.label || String(value);
  }, [dynamicOptions, relationOptions]);

  const buildName = useCallback((row: BulkRow, index: number) => {
    const parts: string[] = [];
    const rawLabel = rawCategoryField?.options?.find((o) => String(o.value) === rawCategory)?.label || rawCategory;
    const prodLabel = productCategoryOptions.find((o) => o.value === productCategory)?.label || productCategory;
    if (productType === 'raw' && rawLabel) parts.push(rawLabel);
    if (productType !== 'raw' && prodLabel) parts.push(prodLabel);
    rowFields.forEach((f) => { const label = resolveLabel(f, row[f.key]); if (label) parts.push(label); });
    if (brandField) {
      const brandLabel = resolveLabel(brandField, sharedValues.brand_name);
      if (brandLabel) parts.push(brandLabel);
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim() || `محصول جدید ${index + 1}`;
  }, [brandField, productCategory, productCategoryOptions, productType, rawCategory, rawCategoryField?.options, resolveLabel, rowFields, sharedValues.brand_name]);

  const validate = useCallback(() => {
    if (!rows.length) return 'حداقل یک ردیف لازم است.';
    if (productType === 'raw' && !rawCategory) return 'دسته‌بندی مواد اولیه انتخاب نشده است.';
    if (productType !== 'raw' && !productCategory) return 'دسته‌بندی محصول انتخاب نشده است.';
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      for (const field of rowFields) {
        if (field.validation?.required && isEmpty(row[field.key])) return `ردیف ${i + 1}: فیلد «${field.labels?.fa || field.key}» الزامی است.`;
      }
      if (row.auto_name_enabled === false && isEmpty(row.name)) return `ردیف ${i + 1}: نام محصول را وارد کنید.`;
      if (toNum(row.opening_stock) > 0 && isEmpty(row.opening_shelf_id)) return `ردیف ${i + 1}: برای موجودی اول دوره، قفسه نگهداری را انتخاب کنید.`;
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
      const deltas: Array<{ productId: string; shelfId: string; delta: number }> = [];
      const transfers: Record<string, unknown>[] = [];
      const changelogs: Record<string, unknown>[] = [];

      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const payload: Record<string, unknown> = { product_type: productType };
        payload.category = productType === 'raw' ? rawCategory : null;
        payload.product_category = productType === 'raw' ? null : productCategory;
        sharedFields.forEach((f) => { const v = norm(sharedValues[f.key]); if (v !== undefined) payload[f.key] = v; });
        rowFields.forEach((f) => { const v = norm(row[f.key]); if (v !== undefined) payload[f.key] = v; });
        payload.manual_code = norm(row.manual_code);
        payload.image_url = norm(row.image_url);
        payload.auto_name_enabled = row.auto_name_enabled !== false;
        payload.name = row.auto_name_enabled === false ? norm(row.name) : buildName(row, i);
        if (isEmpty(payload.name)) throw new Error(`ردیف ${i + 1}: نام محصول نامعتبر است.`);

        const { data: inserted, error: insertError } = await supabase.from('products').insert([payload]).select('id,name,system_code,main_unit,sub_unit').single();
        if (insertError || !inserted?.id) throw new Error(`ردیف ${i + 1}: ${insertError?.message || 'ثبت محصول ناموفق بود.'}`);
        const pid = String(inserted.id);
        productIds.push(pid);
        changelogs.push({ module_id: 'products', record_id: pid, action: 'create', user_id: userId, record_title: inserted.name || inserted.system_code || null });

        const q = toNum(row.opening_stock);
        const shelf = row.opening_shelf_id ? String(row.opening_shelf_id) : null;
        if (q > 0 && shelf) {
          deltas.push({ productId: pid, shelfId: shelf, delta: q });
          const subQty = isUnitValue(inserted.main_unit) && isUnitValue(inserted.sub_unit) ? convertArea(q, inserted.main_unit, inserted.sub_unit) : 0;
          transfers.push({
            transfer_type: 'opening_balance',
            product_id: pid,
            delivered_qty: q,
            required_qty: Number.isFinite(subQty) ? subQty : 0,
            invoice_id: null,
            production_order_id: null,
            from_shelf_id: null,
            to_shelf_id: shelf,
            sender_id: userId,
            receiver_id: userId,
          });
        }
      }

      if (deltas.length) await applyInventoryDeltas(supabase as never, deltas);
      if (transfers.length) { const { error: tErr } = await supabase.from('stock_transfers').insert(transfers); if (tErr) throw tErr; }
      if (productIds.length) await syncMultipleProductsStock(supabase as never, productIds);
      if (changelogs.length) await supabase.from('changelogs').insert(changelogs);
      msg.success(`${productIds.length} محصول با موفقیت ایجاد شد.`);
      onCreated?.(productIds.length);
      onClose();
    } catch (e: any) {
      msg.error(e?.message || 'خطا در ایجاد گروهی محصولات');
    } finally {
      setSaving(false);
    }
  }, [buildName, msg, onClose, onCreated, productCategory, productType, rawCategory, rowFields, rows, sharedFields, sharedValues, validate]);

  const tableColumns = useMemo(() => [
    { key: 'image_url', title: <PaperClipOutlined />, type: imageField?.type || FieldType.IMAGE, width: 76 },
    { key: 'manual_code', title: manualCodeField?.labels?.fa || 'کد دستی', type: manualCodeField?.type || FieldType.TEXT, width: 150 },
    ...rowFields.map((f) => ({ key: f.key, title: f.labels?.fa || f.key, type: f.type, options: f.options, relationConfig: f.relationConfig, dynamicOptionsCategory: f.dynamicOptionsCategory, defaultValue: f.defaultValue })),
    { key: 'opening_stock', title: 'موجودی اول دوره', type: FieldType.NUMBER, width: 140, defaultValue: 0 },
    { key: 'opening_shelf_id', title: 'قفسه نگهداری', type: FieldType.RELATION, width: 220, relationConfig: { targetModule: 'shelves', targetField: 'name' } },
    { key: 'auto_name_enabled', title: 'نامگذاری خودکار', type: FieldType.CHECKBOX, width: 140, defaultValue: true },
    { key: 'name', title: nameField?.labels?.fa || 'نام محصول', type: nameField?.type || FieldType.TEXT, width: 240, readonlyWhen: { field: 'auto_name_enabled', equals: true } },
  ], [imageField?.type, manualCodeField?.labels?.fa, manualCodeField?.type, nameField?.labels?.fa, nameField?.type, rowFields]);

  const tableBlock = useMemo(() => ({
    id: 'bulk_products_table',
    titles: { fa: 'فیلدهای محصول', en: 'Product Rows' },
    tableColumns,
    allowRowCopy: true,
  }), [tableColumns]);

  const typeOptions = useMemo(() => (productTypeField?.options || []).map((o) => ({ label: o.label, value: String(o.value) })), [productTypeField?.options]);
  const rawOptions = useMemo(() => (rawCategoryField?.options || []).map((o) => ({ label: o.label, value: String(o.value) })), [rawCategoryField?.options]);

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
      zIndex={2600}
      destroyOnClose
      styles={{ body: { maxHeight: '74vh', overflowY: 'auto', paddingTop: 12 } }}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">نوع محصول</div>
            <Select
              value={productType}
              options={typeOptions}
              onChange={(v) => setProductType(String(v))}
              className="w-full"
              getPopupContainer={() => document.body}
              dropdownStyle={{ zIndex: 3000 }}
            />
          </div>
          {productType === 'raw' ? (
            <div>
              <div className="text-xs text-gray-500 mb-1">دسته‌بندی مواد اولیه</div>
              <Select
                value={rawCategory || undefined}
                options={rawOptions}
                onChange={(v) => setRawCategory(String(v))}
                className="w-full"
                getPopupContainer={() => document.body}
                dropdownStyle={{ zIndex: 3000 }}
              />
            </div>
          ) : (
            <div>
              <div className="text-xs text-gray-500 mb-1">دسته‌بندی محصول</div>
              <Select
                value={productCategory || undefined}
                options={productCategoryOptions}
                onChange={(v) => setProductCategory(String(v))}
                className="w-full"
                showSearch
                optionFilterProp="label"
                getPopupContainer={() => document.body}
                dropdownStyle={{ zIndex: 3000 }}
              />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-3 md:p-4">
          <div className="text-sm font-bold text-gray-700 mb-3">فیلدهای مشترک</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {sharedFields.map((f) => (
              <div key={f.key} className="text-xs [&_.ant-input]:!h-8 [&_.ant-input-number]:!h-8 [&_.ant-input-number-input]:!h-8 [&_.ant-select-selector]:!min-h-8 [&_.ant-select-selector]:!h-8 [&_.ant-select-selection-item]:!text-xs [&_.ant-input]:!text-xs [&_.ant-input-number-input]:!text-xs">
                <div className="text-xs text-gray-500 mb-1">{f.labels?.fa || f.key}</div>
                <SmartFieldRenderer
                  field={f}
                  value={sharedValues[f.key]}
                  options={f.dynamicOptionsCategory ? (dynamicOptions[f.dynamicOptionsCategory] || []) : f.options}
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
    </Modal>
  );
};

export default BulkProductsCreateModal;
