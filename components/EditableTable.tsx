import React, { useEffect, useState } from 'react';
import { Table, Button, Space, message, Empty, Typography, Spin, Select } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, SaveOutlined, CloseOutlined, CloseCircleOutlined, RightOutlined, CopyOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { FieldType, ModuleField } from '../types';
import { calculateRow } from '../utils/calculations';
import { toPersianNumber } from '../utils/persianNumberFormatter';
import { convertArea } from '../utils/unitConversions';
import { applyInventoryDeltas, syncMultipleProductsStock } from '../utils/inventoryTransactions';
import SmartFieldRenderer from './SmartFieldRenderer';
import SmartTableRenderer from './SmartTableRenderer';
import QrScanPopover from './QrScanPopover';
import { dedupeOptionsByLabel } from './editableTable/tableUtils';
import { insertChangelog } from './editableTable/changelogHelpers';
import { getInvoiceAmounts } from './editableTable/invoiceHelpers';
import { fetchShelfOptions, updateProductStock } from './editableTable/inventoryHelpers';
import { buildProductFilters, runProductsQuery } from './editableTable/productionOrderHelpers';
import { MODULES } from '../moduleRegistry';

const { Text } = Typography;

const normalizeDigitsToEnglish = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
};

const normalizeNumericString = (raw: any): string => {
  if (raw === null || raw === undefined) return '';
  const englishDigits = normalizeDigitsToEnglish(raw)
    .replace(/[\u066C\u060C]/g, ',')
    .replace(/\s+/g, '')
    .replace(/,/g, '');
  const sign = englishDigits.startsWith('-') ? '-' : '';
  const unsigned = englishDigits.replace(/-/g, '');
  const cleaned = unsigned.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const integerPart = parts[0] ?? '';
  const decimalPart = parts.slice(1).join('');
  const hasDot = cleaned.includes('.');
  return `${sign}${integerPart}${hasDot ? `.${decimalPart}` : ''}`;
};

const toSafeNumber = (raw: any): number => {
  const normalized = normalizeNumericString(raw);
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface EditableTableProps {
  block: any;
  initialData: any[];
  moduleId?: string;
  recordId?: string;
  relationOptions: Record<string, any[]>;
  onSaveSuccess?: (newData: any[]) => void;
  onChange?: (newData: any[]) => void;
  mode?: 'db' | 'local' | 'external_view';
  dynamicOptions?: Record<string, any[]>;
  externalSource?: { moduleId?: string; recordId?: string; column?: string };
  populateSource?: { moduleId?: string; recordId?: string; column?: string };
  canEditModule?: boolean;
  canViewField?: (fieldKey: string) => boolean;
  isMobile?: boolean;
  readOnly?: boolean;
}

const EditableTable: React.FC<EditableTableProps> = ({
  block,
  initialData,
  moduleId,
  recordId,
  relationOptions,
  onSaveSuccess,
  onChange,
  mode = 'db',
  dynamicOptions = {},
  externalSource,
  populateSource,
  canEditModule,
  canViewField,
  readOnly,
}) => {
  const isReadOnly = block?.readonly === true || readOnly === true || canEditModule === false;
  const isProductInventory = moduleId === 'products' && block?.id === 'product_inventory';
  const isProductStockMovements = moduleId === 'products' && block?.id === 'product_stock_movements';
  const isShelfInventory = moduleId === 'shelves' && block?.id === 'shelf_inventory';
  const isProductionOrder = moduleId === 'production_orders';
  const isBomItemBlock = ['items_leather', 'items_lining', 'items_fitting', 'items_accessory'].includes(block?.id);
  const isInvoiceItems = moduleId === 'invoices' && block?.id === 'invoiceItems';
  const isPurchaseInvoiceItems = moduleId === 'purchase_invoices' && block?.id === 'invoiceItems';
  const isAnyInvoiceItems = isInvoiceItems || isPurchaseInvoiceItems;
  const isInvoicePayments = moduleId === 'invoices' && block?.id === 'payments';
  const isPurchaseInvoicePayments = moduleId === 'purchase_invoices' && block?.id === 'payments';
  const isAnyInvoicePayments = isInvoicePayments || isPurchaseInvoicePayments;
  const isShelfInventoryBlock = block?.id === 'product_inventory' || block?.id === 'shelf_inventory';

  const [isEditing, setIsEditing] = useState(mode === 'local' && !isReadOnly);
  const [data, setData] = useState<any[]>(initialData || []);
  const [tempData, setTempData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Record<string, { loading: boolean; data: any[] }>>({});
  const [shelfOptionsByRow, setShelfOptionsByRow] = useState<Record<string, { loading: boolean; options: { label: string; value: string }[] }>>({});
  const [localDynamicOptions, setLocalDynamicOptions] = useState<Record<string, any[]>>({});
  const [rowReloadVersion, setRowReloadVersion] = useState<Record<string, number>>({});
  const [currentProductUnits, setCurrentProductUnits] = useState<{ mainUnit: string | null; subUnit: string | null }>({ mainUnit: null, subUnit: null });
  const [currentProductStock, setCurrentProductStock] = useState<number>(0);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const empty = !Array.isArray(initialData) || initialData.length === 0;
    if (isAnyInvoiceItems || isShelfInventoryBlock || isProductStockMovements) return false;
    return empty;
  });
  const [userToggledCollapse, setUserToggledCollapse] = useState(false);

  useEffect(() => {
    if (userToggledCollapse) return;
    const source = isEditing ? tempData : data;
    const empty = !Array.isArray(source) || source.length === 0;
    if (isAnyInvoiceItems || isShelfInventoryBlock || isProductStockMovements) {
      setIsCollapsed(false);
      return;
    }
    setIsCollapsed(empty);
  }, [data, tempData, isEditing, isAnyInvoiceItems, isShelfInventoryBlock, isProductStockMovements, userToggledCollapse]);

  const productsModule = MODULES['products'];
  const editableAfterSelection = new Set(['buy_price', 'length', 'width', 'usage', 'waste_rate', 'main_unit']);
  const productFieldMap: Record<string, string> = {
    leather_colors: 'colors',
    fitting_colors: 'colors',
    lining_width: 'lining_dims',
  };

  // --- دریافت دیتای خارجی ---
  useEffect(() => {
    const fetchExternalData = async () => {
      if (mode === 'external_view' && externalSource?.moduleId && externalSource?.recordId) {
        setLoadingData(true);
        try {
          const { data: extData, error } = await supabase
            .from(externalSource.moduleId)
            .select(externalSource.column || 'items')
            .eq('id', externalSource.recordId)
            .single();
          if (error) throw error;
          const items = extData ? (extData as any)[externalSource.column || 'items'] : [];
          const dataWithKeys = Array.isArray(items)
            ? items.map((i: any, idx: number) => ({ ...i, key: i.key || idx }))
            : [];
          setData(dataWithKeys);
        } catch (err) {
          console.error(err);
          setData([]);
        } finally {
          setLoadingData(false);
        }
      }
    };
    fetchExternalData();
  }, [mode, externalSource?.recordId, externalSource?.moduleId, externalSource?.column]);

  // --- کپی دیتا (Populate) ---
  useEffect(() => {
    const fetchAndPopulate = async () => {
      if (populateSource?.moduleId && populateSource?.recordId) {
        setLoadingData(true);
        try {
          const { data: sourceData, error } = await supabase
            .from(populateSource.moduleId)
            .select(populateSource.column || 'items')
            .eq('id', populateSource.recordId)
            .single();
          if (error) throw error;
          const items = sourceData ? (sourceData as any)[populateSource.column || 'items'] : [];
          const populatedItems = (Array.isArray(items) ? items : []).map((item: any) => ({
            ...item,
            id: undefined,
            key: Date.now() + Math.random(),
          }));
          setTempData(populatedItems);
          if (onChange) onChange(populatedItems);
          setIsEditing(true);
          message.success('اقلام کپی شدند');
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingData(false);
        }
      }
    };
    if (populateSource?.recordId) fetchAndPopulate();
  }, [populateSource?.recordId, populateSource?.moduleId, populateSource?.column]);

  // --- مقداردهی اولیه ---
  useEffect(() => {
    if (mode !== 'external_view' && !populateSource?.recordId && !isProductInventory && !isShelfInventory && !isProductStockMovements) {
      const safeData = Array.isArray(initialData) ? initialData : [];
      const dataWithKey = safeData.map((item, index) => ({
        ...item,
        key: item.key || item.id || `${Date.now()}_${index}`,
      }));
      const lockedData = isProductionOrder && isBomItemBlock
        ? dataWithKey.map((row: any) => {
            if (!row?.selected_product_id) return row;
            const locked = new Set<string>(row?._lockedFields || []);
            (block.tableColumns || []).forEach((col: any) => {
              const key = col.key;
              if (!editableAfterSelection.has(key)) {
                locked.add(key);
              }
            });
            return { ...row, _lockedFields: Array.from(locked) };
          })
        : dataWithKey;
      setData(lockedData);
      if (mode === 'local') setTempData(lockedData);
    }
  }, [initialData, mode, isProductInventory, isShelfInventory, isProductStockMovements, populateSource?.recordId]);

  // --- دریافت موجودی از جدول product_inventory ---
  useEffect(() => {
    const fetchInventoryRows = async () => {
      if (mode !== 'db' || !recordId || (!isProductInventory && !isShelfInventory && !isProductStockMovements)) return;
      setLoadingData(true);
      try {
        if (isProductStockMovements) {
          const { data: productMeta } = await supabase
            .from('products')
            .select('main_unit, sub_unit, stock')
            .eq('id', recordId)
            .maybeSingle();

          const mainUnit = productMeta?.main_unit || null;
          const subUnit = productMeta?.sub_unit || null;
          const productStock = parseFloat(productMeta?.stock) || 0;
          setCurrentProductUnits({ mainUnit, subUnit });
          setCurrentProductStock(productStock);

          const { data: rows, error } = await supabase
            .from('stock_transfers')
            .select('id, transfer_type, delivered_qty, required_qty, invoice_id, production_order_id, from_shelf_id, to_shelf_id, sender_id, receiver_id, created_at')
            .eq('product_id', recordId)
            .order('created_at', { ascending: true });
          if (error) throw error;

          const userIds = Array.from(
            new Set((rows || []).flatMap((row: any) => [row?.sender_id, row?.receiver_id]).filter(Boolean))
          );
          let userMap = new Map<string, string>();
          if (userIds.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', userIds);
            userMap = new Map((profiles || []).map((item: any) => [String(item.id), item.full_name || String(item.id)]));
          }

          const mappedRows = (rows || []).map((row: any, index: number) => {
            const source = String(row?.transfer_type || '').trim() || 'inventory_count';
            const fromShelf = row?.from_shelf_id ? String(row.from_shelf_id) : null;
            const toShelf = row?.to_shelf_id ? String(row.to_shelf_id) : null;
            const voucherType = fromShelf && toShelf ? 'transfer' : toShelf ? 'incoming' : 'outgoing';
            const creatorId = row?.sender_id || row?.receiver_id || null;
            const autoSource = ['sales_invoice', 'purchase_invoice', 'production'].includes(source);
            const isPurchaseSource = source === 'purchase_invoice';
            return {
              id: row.id,
              key: row.id || `move_${index}`,
              voucher_type: voucherType,
              source,
              main_unit: mainUnit,
              main_quantity: Math.abs(parseFloat(row?.delivered_qty) || 0),
              sub_unit: subUnit,
              sub_quantity: Math.abs(parseFloat(row?.required_qty) || 0),
              from_shelf_id: fromShelf,
              to_shelf_id: toShelf,
              invoice_id: isPurchaseSource ? null : (row?.invoice_id || null),
              purchase_invoice_id: isPurchaseSource ? (row?.invoice_id || null) : null,
              production_order_id: row?.production_order_id || null,
              created_by_name: creatorId ? (userMap.get(String(creatorId)) || String(creatorId)) : '-',
              created_at: row?.created_at || null,
              _readonly: autoSource || !!row?.invoice_id || !!row?.production_order_id,
            };
          });
          setData(mappedRows);
          return;
        }

        let query = supabase
          .from('product_inventory')
          .select('id, product_id, shelf_id, warehouse_id, stock, created_at, products(main_unit,sub_unit), shelves(warehouse_id,system_code,shelf_number,name,warehouses(id,name))');
        if (isProductInventory) query = query.eq('product_id', recordId);
        if (isShelfInventory) query = query.eq('shelf_id', recordId);
        const { data: rows, error } = await query.order('created_at', { ascending: true });
        if (error) throw error;

        let productUnits: { mainUnit: string | null; subUnit: string | null } = { mainUnit: null, subUnit: null };
        if (isProductInventory) {
          try {
            const { data: productRow } = await supabase
              .from('products')
              .select('main_unit, sub_unit')
              .eq('id', recordId)
              .single();
            productUnits = {
              mainUnit: productRow?.main_unit || null,
              subUnit: productRow?.sub_unit || null,
            };
            setCurrentProductUnits(productUnits);
          } catch (e) {
            console.warn('Could not load product units', e);
          }
        }

        const dataWithKeys = (rows || []).map((row: any, idx: number) => {
          const mainUnit = row?.products?.main_unit ?? row.main_unit ?? productUnits.mainUnit ?? null;
          const subUnit = row?.products?.sub_unit ?? row.sub_unit ?? productUnits.subUnit ?? null;
          const shelfName = row?.shelves?.name || row?.shelves?.shelf_number || row?.shelf_id || '-';
          const shelfCode = row?.shelves?.system_code || '';
          const stockValue = parseFloat(row?.stock) || 0;
          const subStock = mainUnit && subUnit
            ? convertArea(stockValue, mainUnit as any, subUnit as any)
            : 0;
          return {
            ...row,
            warehouse_id:
              row?.warehouse_id ??
              row?.shelves?.warehouse_id ??
              row?.shelves?.warehouses?.id ??
              null,
            main_unit: mainUnit,
            sub_unit: subUnit,
            sub_stock: Number.isFinite(subStock) ? subStock : 0,
            shelf_display: shelfCode ? `${shelfName} (${shelfCode})` : shelfName,
            key: row.id || row.key || `inv_${idx}`,
          };
        });
        setData(dataWithKeys);
      } catch (err) {
        console.error(err);
        setData([]);
      } finally {
        setLoadingData(false);
      }
    };

    fetchInventoryRows();
  }, [mode, recordId, isProductInventory, isShelfInventory, isProductStockMovements]);

  useEffect(() => {
    const categories = new Set<string>();
    (block.tableColumns || []).forEach((col: any) => {
      if (col.dynamicOptionsCategory) categories.add(col.dynamicOptionsCategory);
    });

    const toFetch = Array.from(categories).filter(
      (cat) => !(dynamicOptions && dynamicOptions[cat]) && !(localDynamicOptions && localDynamicOptions[cat])
    );

    if (toFetch.length === 0) return;

    const load = async () => {
      const updates: Record<string, any[]> = {};
      for (const cat of toFetch) {
        try {
          const { data: rows } = await supabase
            .from('dynamic_options')
            .select('label, value')
            .eq('category', cat)
            .eq('is_active', true)
            .order('display_order', { ascending: true });
          if (rows) updates[cat] = rows.filter((i: any) => i.value !== null);
        } catch (err) {
          console.warn('Dynamic options load failed:', cat, err);
        }
      }
      if (Object.keys(updates).length > 0) {
        setLocalDynamicOptions((prev) => ({ ...prev, ...updates }));
      }
    };

    load();
  }, [block.tableColumns, dynamicOptions]);

  useEffect(() => {
    if (!isInvoiceItems) return;
    const sourceRows = isEditing ? tempData : data;
    sourceRows.forEach((row: any, index: number) => {
      const productId = row?.product_id ? String(row.product_id) : null;
      if (!productId) return;
      const rowKey = String(row?.key || row?.id || index);
      const existing = shelfOptionsByRow[rowKey];
      if (!existing || (!(existing.options || []).length && !existing.loading)) {
        loadShelvesForRow(rowKey, productId);
      }
    });
  }, [isInvoiceItems, isEditing, tempData, data, shelfOptionsByRow]);

  const updateRow = (index: number, key: string, value: any) => {
    const source = isEditing ? tempData : data;
    const newData = [...source];
    newData[index] = { ...newData[index], [key]: value };
    const row = newData[index] || {};

    if (isProductStockMovements) {
      if (key === 'voucher_type') {
        if (value === 'incoming') newData[index]['from_shelf_id'] = null;
        if (value === 'outgoing') newData[index]['to_shelf_id'] = null;
      }
      if (key === 'source' && value === 'waste') {
        newData[index]['voucher_type'] = 'outgoing';
        newData[index]['to_shelf_id'] = null;
      }
      if (['main_quantity', 'main_unit', 'sub_unit'].includes(key)) {
        const qtyMain = parseFloat(newData[index]?.main_quantity) || 0;
        const mainUnit = String(newData[index]?.main_unit || '');
        const subUnit = String(newData[index]?.sub_unit || '');
        const converted = mainUnit && subUnit
          ? convertArea(qtyMain, mainUnit as any, subUnit as any)
          : 0;
        newData[index]['sub_quantity'] = Number.isFinite(converted) ? converted : 0;
      }
    }

    if (isInvoiceItems && key === 'product_id') {
      newData[index]['source_shelf_id'] = null;
      const rowKey = String(row.key || row.id || index);
      if (value) {
        loadShelvesForRow(rowKey, String(value));
      }
    }

    if (isAnyInvoiceItems && ['quantity', 'main_unit', 'sub_unit'].includes(key)) {
      const qtyMain = toSafeNumber(newData[index]?.quantity);
      const mainUnit = String(newData[index]?.main_unit || '');
      const subUnit = String(newData[index]?.sub_unit || '');
      const converted = mainUnit && subUnit
        ? convertArea(qtyMain, mainUnit as any, subUnit as any)
        : 0;
      newData[index]['sub_quantity'] = Number.isFinite(converted) ? converted : 0;
    }

    if (key === 'selected_product_id' && !value) {
      newData[index]['selected_shelf_id'] = null;
      newData[index]['selected_product_name'] = null;
    }

    if (['length', 'width'].includes(key)) {
      const lengthVal = parseFloat(newData[index]?.length);
      const widthVal = parseFloat(newData[index]?.width);
      if (Number.isFinite(lengthVal) && Number.isFinite(widthVal)) {
        newData[index]['usage'] = lengthVal * widthVal;
      }
    }

    if (['quantity', 'qty', 'usage', 'stock', 'unit_price', 'price', 'buy_price', 'discount', 'vat', 'length', 'width', 'main_quantity', 'sub_quantity'].includes(key)) {
      newData[index]['total_price'] = calculateRow(newData[index], block.rowCalculationType);
    }

    if (isEditing) {
      setTempData(newData);
    } else {
      setData(newData);
    }
    if (mode === 'local' && onChange) onChange(newData);

    if (isProductionOrder && isBomItemBlock) {
      const filterableKeys = new Set((block.tableColumns || []).filter((c: any) => c.filterable).map((c: any) => c.key));
      const rowKey = getRowKey(newData[index]);
      const isExpanded = expandedRowKeys.some((k) => String(k) === String(rowKey));
      if (filterableKeys.has(key) && isExpanded) {
        loadProductsForRow(rowKey, newData[index], { resetPage: true });
      }
    }

    if (moduleId === 'production_orders' && isBomItemBlock && recordId && ['selected_product_id', 'selected_shelf_id', 'selected_product_name'].includes(key)) {
      const dataToSave = newData.map(({ key: rowKey, ...rest }) => ({
        ...rest,
        total_price: calculateRow(rest, block.rowCalculationType),
      }));
      supabase.from(moduleId).update({ [block.id]: dataToSave }).eq('id', recordId);
    }
  };

  const clearSelectedProduct = (rowIndex: number) => {
    const source = isEditing ? tempData : data;
    const baseRow = source[rowIndex] || {};
    const nextRow: any = { ...baseRow };
    nextRow.selected_product_id = null;
    nextRow.selected_product_name = null;
    nextRow.selected_shelf_id = null;

    const locked = new Set<string>((nextRow._lockedFields || []) as string[]);
    locked.forEach((key) => {
      if (key in nextRow) nextRow[key] = undefined;
    });
    nextRow._lockedFields = [];

    const newData = [...source];
    newData[rowIndex] = nextRow;
    if (isEditing) setTempData(newData);
    else setData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const handleRelationChange = async (index: number, key: string, value: any, relationConfig: any) => {
    updateRow(index, key, value);

    if (isAnyInvoicePayments && key === 'responsible_id') {
      return;
    }

    if (value && relationConfig?.targetModule) {
      try {
        const { data: record, error } = await supabase
          .from(relationConfig.targetModule)
          .select('*')
          .eq('id', value)
          .single();

        if (!error && record) {
          const sourceRows = isEditing ? tempData : data;
          const newData = [...sourceRows];
          const currentRow = { ...newData[index], [key]: value };

          block.tableColumns?.forEach((col: any) => {
            if (record[col.key] !== undefined && col.key !== key) {
              currentRow[col.key] = record[col.key];
            }
            if (col.key === 'buy_price' && record['buy_price']) {
              currentRow[col.key] = record['buy_price'];
            }
          });

          if (isAnyInvoiceItems && key === 'product_id') {
            currentRow.main_unit = record?.main_unit || currentRow.main_unit || null;
            currentRow.sub_unit = record?.sub_unit || currentRow.sub_unit || null;
            const qtyMain = toSafeNumber(currentRow?.quantity);
            const mainUnit = String(currentRow?.main_unit || '');
            const subUnit = String(currentRow?.sub_unit || '');
            const converted = mainUnit && subUnit
              ? convertArea(qtyMain, mainUnit as any, subUnit as any)
              : 0;
            currentRow.sub_quantity = Number.isFinite(converted) ? converted : 0;
          }

          if (isInvoiceItems && key === 'product_id') {
            currentRow.source_shelf_id = null;
          }

          currentRow['total_price'] = calculateRow(currentRow, block.rowCalculationType);

          newData[index] = currentRow;
          if (isEditing) setTempData(newData);
          else setData(newData);
          if (mode === 'local' && onChange) onChange(newData);

          if (isInvoiceItems && key === 'product_id' && value) {
            const rowKey = String(currentRow.key || currentRow.id || index);
            loadShelvesForRow(rowKey, String(value));
          }
          message.success('اطلاعات بارگذاری شد');
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const addRow = () => {
    if (isReadOnly) return;
    const visibleColumns = (block.tableColumns || []).filter((c: any) =>
      canViewField ? canViewField(c.key) !== false : true
    );
    const colKeys = new Set(visibleColumns.map((c: any) => c.key));
    const defaults: any = {};
    visibleColumns.forEach((col: any) => {
      if (col.defaultValue !== undefined) defaults[col.key] = col.defaultValue;
    });

    const numericDefaults: any = {};
    if (colKeys.has('quantity')) numericDefaults.quantity = 1;
    if (colKeys.has('unit_price')) numericDefaults.unit_price = 0;
    if (colKeys.has('discount')) numericDefaults.discount = 0;
    if (colKeys.has('vat')) numericDefaults.vat = 0;
    if (colKeys.has('total_price')) numericDefaults.total_price = 0;
    if (isAnyInvoiceItems) {
      numericDefaults.discount_type = 'amount';
      numericDefaults.vat_type = 'percent';
    }

    const newRow = {
      key: Date.now(),
      ...numericDefaults,
      ...defaults,
    };

    if (isProductStockMovements) {
      newRow.voucher_type = newRow.voucher_type || 'incoming';
      newRow.source = newRow.source || 'opening_balance';
      newRow.main_unit = newRow.main_unit || currentProductUnits.mainUnit || null;
      newRow.sub_unit = newRow.sub_unit || currentProductUnits.subUnit || null;
      newRow.main_quantity = parseFloat(newRow.main_quantity) || 0;
      newRow.sub_quantity = parseFloat(newRow.sub_quantity) || 0;
    }

    const newData = [...tempData, newRow];
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const removeRow = (index: number) => {
    if (isReadOnly) return;
    if (isProductStockMovements && tempData[index]?._readonly) return;
    const newData = [...tempData];
    newData.splice(index, 1);
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const copyRow = (index: number) => {
    if (isReadOnly) return;
    const sourceRow = tempData[index];
    if (!sourceRow) return;
    if (isProductStockMovements && sourceRow?._readonly) return;

    const copiedRow = {
      ...sourceRow,
      key: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
    const newData = [...tempData];
    newData.splice(index + 1, 0, copiedRow);
    setTempData(newData);
    if (mode === 'local' && onChange) onChange(newData);
  };

  const normalizeRowForEdit = (row: any) => {
    const nextRow = { ...row };
    (block.tableColumns || []).forEach((col: any) => {
      const key = String(col?.key || '');
      if (!key || !(key in nextRow)) return;
      const value = nextRow[key];
      if (value === null || value === undefined) return;

      const isNumeric = [
        FieldType.NUMBER,
        FieldType.PRICE,
        FieldType.PERCENTAGE,
        FieldType.PERCENTAGE_OR_AMOUNT,
        FieldType.STOCK,
      ].includes(col?.type);

      if (isNumeric) {
        const normalized = normalizeNumericString(value);
        nextRow[key] = normalized === '' ? null : normalized;
        return;
      }

      if ([FieldType.SELECT, FieldType.STATUS, FieldType.RELATION].includes(col?.type)) {
        nextRow[key] = String(value);
      }
    });

    if (isAnyInvoiceItems) {
      const qtyMain = toSafeNumber(nextRow?.quantity);
      const mainUnit = String(nextRow?.main_unit || '');
      const subUnit = String(nextRow?.sub_unit || '');
      if (mainUnit && subUnit) {
        const converted = convertArea(qtyMain, mainUnit as any, subUnit as any);
        nextRow.sub_quantity = Number.isFinite(converted) ? converted : 0;
      }
    }

    return nextRow;
  };

  const startEdit = () => {
    if (isReadOnly) return;
    setUserToggledCollapse(true);
    setIsCollapsed(false);
    setIsEditing(true);
    const preparedData = data.map((row, i) => ({
      ...normalizeRowForEdit(row),
      key: row.key || row.id || `edit_${i}`,
      total_price: calculateRow(normalizeRowForEdit(row), block.rowCalculationType),
    }));
    const withDefaults = preparedData.map((row: any) => {
      const nextRow = { ...row };
      (block.tableColumns || []).forEach((col: any) => {
        if (nextRow[col.key] === undefined && col.defaultValue !== undefined) {
          nextRow[col.key] = col.defaultValue;
        }
      });
      if (isAnyInvoiceItems) {
        if (!nextRow.discount_type) nextRow.discount_type = 'amount';
        if (!nextRow.vat_type) nextRow.vat_type = 'percent';
      }
      if (isProductStockMovements) {
        if (!nextRow.voucher_type) nextRow.voucher_type = 'incoming';
        if (!nextRow.source) nextRow.source = 'opening_balance';
        if (!nextRow.main_unit) nextRow.main_unit = currentProductUnits.mainUnit || null;
        if (!nextRow.sub_unit) nextRow.sub_unit = currentProductUnits.subUnit || null;
      }
      return nextRow;
    });
    setTempData(JSON.parse(JSON.stringify(withDefaults)));
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setTempData([]);
  };

  const handleSave = async () => {
    if (mode === 'local' || mode === 'external_view') return;
    setSaving(true);
    try {
      if (!moduleId || !recordId) throw new Error('رکورد یافت نشد');
      if (isProductStockMovements) {
        const editableRows = (tempData || []).filter((row: any) => !row?._readonly);
        const previousManualRows = (data || []).filter((row: any) => !row?._readonly);
        const allowedManualSources = new Set(['opening_balance', 'inventory_count', 'waste']);
        const toQty = (value: any) => Math.abs(parseFloat(value) || 0);

        const buildDeltas = (rows: any[], multiplier = 1) => {
          const deltas: Array<{ productId: string; shelfId: string; delta: number }> = [];
          rows.forEach((row: any) => {
            const voucherType = String(row?.voucher_type || '');
            const qty = toQty(row?.main_quantity);
            if (!qty) return;
            const fromShelfId = row?.from_shelf_id ? String(row.from_shelf_id) : null;
            const toShelfId = row?.to_shelf_id ? String(row.to_shelf_id) : null;
            if (voucherType === 'incoming' && toShelfId) {
              deltas.push({ productId: recordId, shelfId: toShelfId, delta: qty * multiplier });
            } else if (voucherType === 'outgoing' && fromShelfId) {
              deltas.push({ productId: recordId, shelfId: fromShelfId, delta: -qty * multiplier });
            } else if (voucherType === 'transfer' && fromShelfId && toShelfId) {
              deltas.push({ productId: recordId, shelfId: fromShelfId, delta: -qty * multiplier });
              deltas.push({ productId: recordId, shelfId: toShelfId, delta: qty * multiplier });
            }
          });
          return deltas;
        };

        editableRows.forEach((row: any) => {
          const voucherType = String(row?.voucher_type || '');
          const source = String(row?.source || '');
          const qty = toQty(row?.main_quantity);
          if (!voucherType) throw new Error('نوع حواله انتخاب نشده است.');
          if (!source) throw new Error('منبع حواله انتخاب نشده است.');
          if (!allowedManualSources.has(source)) {
            throw new Error('برای ثبت دستی، فقط منابع "موجودی اول دوره"، "انبارگردانی" و "ضایعات" مجاز هستند.');
          }
          if (qty <= 0) throw new Error('مقدار واحد اصلی باید بیشتر از صفر باشد.');
          if (voucherType === 'incoming' && !row?.to_shelf_id) throw new Error('برای حواله ورود، قفسه ورود الزامی است.');
          if (voucherType === 'outgoing' && !row?.from_shelf_id) throw new Error('برای حواله خروج، قفسه برداشت الزامی است.');
          if (voucherType === 'transfer') {
            if (!row?.from_shelf_id || !row?.to_shelf_id) throw new Error('برای حواله جابجایی، قفسه برداشت و قفسه ورود الزامی است.');
            if (String(row?.from_shelf_id) === String(row?.to_shelf_id)) throw new Error('قفسه برداشت و قفسه ورود نباید یکسان باشند.');
          }
        });

        const reversePrevious = buildDeltas(previousManualRows, -1);
        const nextDeltas = buildDeltas(editableRows, 1);
        await applyInventoryDeltas(supabase as any, [...reversePrevious, ...nextDeltas]);

        const { data: authData } = await supabase.auth.getUser();
        const currentUserId = authData?.user?.id || null;

        const payload = editableRows.map((row: any) => ({
          id: row?.id || undefined,
          product_id: recordId,
          transfer_type: row?.source || 'inventory_count',
          delivered_qty: toQty(row?.main_quantity),
          required_qty: toQty(row?.sub_quantity),
          invoice_id: null,
          production_order_id: null,
          from_shelf_id: row?.from_shelf_id || null,
          to_shelf_id: row?.to_shelf_id || null,
          sender_id: currentUserId,
          receiver_id: currentUserId,
        }));

        const oldManualIds = previousManualRows.map((row: any) => row?.id).filter(Boolean);
        const nextManualIds = new Set(payload.map((row: any) => row?.id).filter(Boolean));
        const removeIds = oldManualIds.filter((id: string) => !nextManualIds.has(id));
        if (removeIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('stock_transfers')
            .delete()
            .in('id', removeIds);
          if (deleteError) throw deleteError;
        }

        if (payload.length > 0) {
          const { error: upsertError } = await supabase
            .from('stock_transfers')
            .upsert(payload, { onConflict: 'id' });
          if (upsertError) throw upsertError;
        }

        await syncMultipleProductsStock(supabase as any, [recordId]);

        const { data: productMeta } = await supabase
          .from('products')
          .select('main_unit, sub_unit, stock')
          .eq('id', recordId)
          .maybeSingle();
        const mainUnit = productMeta?.main_unit || null;
        const subUnit = productMeta?.sub_unit || null;
        setCurrentProductUnits({ mainUnit, subUnit });
        setCurrentProductStock(parseFloat(productMeta?.stock) || 0);

        const { data: refreshedRows, error: rowsError } = await supabase
          .from('stock_transfers')
          .select('id, transfer_type, delivered_qty, required_qty, invoice_id, production_order_id, from_shelf_id, to_shelf_id, sender_id, receiver_id, created_at')
          .eq('product_id', recordId)
          .order('created_at', { ascending: true });
        if (rowsError) throw rowsError;

        const userIds = Array.from(
          new Set((refreshedRows || []).flatMap((row: any) => [row?.sender_id, row?.receiver_id]).filter(Boolean))
        );
        let userMap = new Map<string, string>();
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', userIds);
          userMap = new Map((profiles || []).map((item: any) => [String(item.id), item.full_name || String(item.id)]));
        }

        const mappedRows = (refreshedRows || []).map((row: any, index: number) => {
          const source = String(row?.transfer_type || '').trim() || 'inventory_count';
          const fromShelf = row?.from_shelf_id ? String(row.from_shelf_id) : null;
          const toShelf = row?.to_shelf_id ? String(row.to_shelf_id) : null;
          const voucherType = fromShelf && toShelf ? 'transfer' : toShelf ? 'incoming' : 'outgoing';
          const creatorId = row?.sender_id || row?.receiver_id || null;
          const autoSource = ['sales_invoice', 'purchase_invoice', 'production'].includes(source);
          const isPurchaseSource = source === 'purchase_invoice';
          return {
            id: row.id,
            key: row.id || `move_${index}`,
            voucher_type: voucherType,
            source,
            main_unit: mainUnit,
            main_quantity: Math.abs(parseFloat(row?.delivered_qty) || 0),
            sub_unit: subUnit,
            sub_quantity: Math.abs(parseFloat(row?.required_qty) || 0),
            from_shelf_id: fromShelf,
            to_shelf_id: toShelf,
            invoice_id: isPurchaseSource ? null : (row?.invoice_id || null),
            purchase_invoice_id: isPurchaseSource ? (row?.invoice_id || null) : null,
            production_order_id: row?.production_order_id || null,
            created_by_name: creatorId ? (userMap.get(String(creatorId)) || String(creatorId)) : '-',
            created_at: row?.created_at || null,
            _readonly: autoSource || !!row?.invoice_id || !!row?.production_order_id,
          };
        });

        const oldValue = data.map(({ key, ...rest }) => rest);
        const newValue = mappedRows.map(({ key, ...rest }) => rest);
        await insertChangelog(supabase, moduleId, recordId, block, oldValue, newValue);

        setData(mappedRows);
        if (onSaveSuccess) onSaveSuccess(mappedRows);
        message.success('ذخیره شد');
        setIsEditing(false);
        return;
      }

      if (isProductInventory || isShelfInventory) {
        const baseRows = tempData.map(({ key, ...rest }) => ({ ...rest }));

        let payload = baseRows;
        if (isProductInventory) {
          payload = baseRows
            .filter((row: any) => row.shelf_id)
            .map((row: any) => ({
              product_id: recordId,
              shelf_id: row.shelf_id,
              warehouse_id: row.warehouse_id ?? null,
              stock: parseFloat(row.stock) || 0,
            }));
        }

        if (isShelfInventory) {
          payload = baseRows
            .filter((row: any) => row.product_id)
            .map((row: any) => ({
              product_id: row.product_id,
              shelf_id: recordId,
              warehouse_id: row.warehouse_id ?? null,
              stock: parseFloat(row.stock) || 0,
            }));
        }

        if (payload.length > 1) {
          const dedupedMap = new Map<string, any>();
          payload.forEach((row: any) => {
            const key = `${row.product_id}_${row.shelf_id}`;
            const existing = dedupedMap.get(key);
            if (!existing) {
              dedupedMap.set(key, row);
            } else {
              const existingStock = parseFloat(existing.stock) || 0;
              const nextStock = parseFloat(row.stock) || 0;
              dedupedMap.set(key, {
                ...existing,
                warehouse_id: row.warehouse_id ?? existing.warehouse_id ?? null,
                stock: existingStock + nextStock,
              });
            }
          });
          payload = Array.from(dedupedMap.values());
        }

        const newKeys = new Set(payload.map((row: any) => `${row.product_id}_${row.shelf_id}`));
        const removedIds = data
          .filter((row: any) => !newKeys.has(`${row.product_id}_${row.shelf_id}`) && row.id)
          .map((row: any) => row.id);

        if (removedIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('product_inventory')
            .delete()
            .in('id', removedIds);
          if (deleteError) throw deleteError;
        }

        let savedRows: any[] = [];
        if (payload.length > 0) {
          const { data: saved, error: upsertError } = await supabase
            .from('product_inventory')
            .upsert(payload, { onConflict: 'product_id,shelf_id' })
            .select('*');
          if (upsertError) throw upsertError;
          savedRows = saved || [];
        }

        if (isProductInventory) {
          await updateProductStock(supabase as any, recordId);
        }

        if (isShelfInventory) {
          const affectedProductIds = new Set<string>();
          payload.forEach((row: any) => row.product_id && affectedProductIds.add(row.product_id));
          data.forEach((row: any) => row.product_id && affectedProductIds.add(row.product_id));
          for (const pid of Array.from(affectedProductIds)) {
            await updateProductStock(supabase, pid);
          }
        }

        const oldValue = data.map(({ key, ...rest }) => rest);
        await insertChangelog(supabase, moduleId, recordId, block, oldValue, savedRows);

        const dataWithKey = savedRows.map((row: any, index: number) => ({
          ...row,
          key: row.id || row.key || `inv_${index}`
        }));
        setData(dataWithKey);
        if (onSaveSuccess) onSaveSuccess(dataWithKey);
        message.success('ذخیره شد');
        setIsEditing(false);
        return;
      }

      const dataToSave = tempData.map(({ key, ...rest }) => ({
        ...rest,
        total_price: calculateRow(rest, block.rowCalculationType),
      }));

      const updatePayload: any = { [block.id]: dataToSave };
      const { error } = await supabase.from(moduleId).update(updatePayload).eq('id', recordId);
      if (error) throw error;

      const oldValue = data.map(({ key, ...rest }) => rest);
      await insertChangelog(supabase, moduleId, recordId, block, oldValue, dataToSave);

      message.success('ذخیره شد');
      setData(dataToSave);
      if (onSaveSuccess) onSaveSuccess(dataToSave);
      setIsEditing(false);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const getColWidth = (col: any) => {
    if (col.width) return col.width;
    if (col.type === FieldType.RELATION) return 240;
    if (col.type === FieldType.SELECT || col.type === FieldType.MULTI_SELECT || col.type === FieldType.STATUS) return 170;
    if (col.type === FieldType.NUMBER || col.type === FieldType.PERCENTAGE_OR_AMOUNT) return 120;
    if (col.type === FieldType.PRICE) return 140;
    if (col.type === FieldType.DATETIME) return 170;
    if (col.type === FieldType.DATE) return 100;
    return 160;
  };

  const getRowKey = (row: any) => String(row.key || row.id || '');
  const resolveRowIndex = (rowKey: React.Key) => {
    const source = isEditing ? tempData : data;
    return source.findIndex((row: any) => String(row.key || row.id || '') === String(rowKey));
  };


  const bumpRowReloadVersion = (rowKey: string) => {
    setRowReloadVersion((prev) => ({
      ...prev,
      [rowKey]: (prev[rowKey] || 0) + 1,
    }));
  };

  const ensureRowExpanded = (rowKey: string) => {
    setExpandedRowKeys((prev) => {
      const keyStr = String(rowKey);
      if (prev.some((k) => String(k) === keyStr)) return prev;
      return [...prev, rowKey];
    });
  };

  const loadProductsForRow = async (rowKey: string, rowData: any, options?: { resetPage?: boolean }) => {
    if (!productsModule) return;
    if (options?.resetPage) bumpRowReloadVersion(rowKey);
    setExpandedProducts((prev) => ({ ...prev, [rowKey]: { loading: true, data: prev[rowKey]?.data || [] } }));
    try {
      let activeFilters = buildProductFilters(block.tableColumns || [], rowData, dynamicOptions, localDynamicOptions);
      let result = await runProductsQuery(supabase, activeFilters);
      let guard = 0;
      while (result.error && result.error.code === '42703' && guard < 6) {
        const missing = result.error.message?.match(/products\.([a-zA-Z0-9_]+)/)?.[1];
        if (!missing) break;
        activeFilters = activeFilters.filter((f) => f.filterKey !== missing);
        result = await runProductsQuery(supabase, activeFilters);
        guard += 1;
      }

      if (result.error) throw result.error;
      setExpandedProducts((prev) => ({ ...prev, [rowKey]: { loading: false, data: result.data || [] } }));
    } catch (err) {
      console.error(err);
      setExpandedProducts((prev) => ({ ...prev, [rowKey]: { loading: false, data: [] } }));
    }
  };

  const loadShelvesForRow = async (rowKey: string, productId: string) => {
    setShelfOptionsByRow((prev) => ({ ...prev, [rowKey]: { loading: true, options: prev[rowKey]?.options || [] } }));
    try {
      const options = await fetchShelfOptions(supabase, productId);
      setShelfOptionsByRow((prev) => ({ ...prev, [rowKey]: { loading: false, options } }));
    } catch (err) {
      console.error(err);
      setShelfOptionsByRow((prev) => ({ ...prev, [rowKey]: { loading: false, options: [] } }));
    }
  };

  const visibleColumns = (block.tableColumns || []).filter((col: any) =>
    canViewField ? canViewField(col.key) !== false : true
  );

  const applySelectedProduct = (rowIndex: number, rowKey: string, selected: any) => {
    if (rowIndex < 0 || !selected) return;

    const source = isEditing ? tempData : data;
    const baseRow = source[rowIndex] || {};
    const nextRow: any = { ...baseRow };

    nextRow.selected_product_id = selected?.id || null;
    nextRow.selected_product_name = selected?.name || null;

    const locked = new Set<string>();

    (visibleColumns || []).forEach((col: any) => {
      const key = col.key;
      const productKey = productFieldMap[key] || key;
      const productValue = (selected as any)[productKey];
      if (productValue !== undefined) {
        nextRow[key] = productValue;
      }
      if (!editableAfterSelection.has(key)) {
        locked.add(key);
      }
    });

    if (selected?.main_unit !== undefined) {
      nextRow.main_unit = selected.main_unit;
      if (!editableAfterSelection.has('main_unit')) locked.add('main_unit');
    }

    nextRow.total_price = calculateRow(nextRow, block.rowCalculationType);
    nextRow._lockedFields = Array.from(locked);

    const newData = [...source];
    newData[rowIndex] = nextRow;
    if (isEditing) setTempData(newData);
    else setData(newData);
    if (mode === 'local' && onChange) onChange(newData);

    if (selected?.id) {
      loadShelvesForRow(rowKey, selected.id);
    }
  };


  const handleQrScanForRow = async (rowIndex: number, rowKey: string, scan: { raw: string; moduleId?: string; recordId?: string }) => {
    try {
      if (scan.recordId && scan.moduleId === 'products') {
        const { data: product, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', scan.recordId)
          .single();
        if (!error && product) {
          applySelectedProduct(rowIndex, rowKey, product);
        }
        return;
      }

      const raw = scan.raw?.trim();
      if (!raw) return;
      const { data: products, error } = await supabase
        .from('products')
        .select('*')
        .or(`system_code.eq.${raw},manual_code.eq.${raw},name.eq.${raw}`)
        .limit(1);
      if (!error && products && products.length > 0) {
        applySelectedProduct(rowIndex, rowKey, products[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const selectionColumns = isProductionOrder && isBomItemBlock
    ? [
        {
          title: 'محصول انتخابی',
          dataIndex: 'selected_product_name',
          key: 'selected_product_name',
          width: 240,
          render: (text: any, _record: any, index: number) => {
            const rowKey = getRowKey(_record);
            const productsState = expandedProducts[rowKey];
            const productOptions = (productsState?.data || []).map((item: any) => ({
              value: item.id,
              label: item.system_code ? `${item.system_code} - ${item.name}` : item.name,
            }));

            if (text) {
              return (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">{text}</span>
                <Button
                  type="text"
                  size="small"
                  icon={<CloseCircleOutlined />}
                  onClick={() => clearSelectedProduct(index)}
                />
              </div>
              );
            }

            return (
              <div className="flex items-center gap-2">
                <Select
                  placeholder="جستجو یا انتخاب محصول"
                  value={null}
                  showSearch
                  options={productOptions}
                  optionFilterProp="label"
                  onDropdownVisibleChange={(open) => {
                    if (!open) return;
                    ensureRowExpanded(rowKey);
                    loadProductsForRow(rowKey, _record, { resetPage: true });
                  }}
                  onChange={async (val) => {
                    const selected = (productsState?.data || []).find((p: any) => String(p.id) === String(val));
                    if (selected) {
                      applySelectedProduct(index, rowKey, selected);
                      return;
                    }
                    const { data: product } = await supabase
                      .from('products')
                      .select('*')
                      .eq('id', val)
                      .single();
                    if (product) applySelectedProduct(index, rowKey, product);
                  }}
                  className="w-full"
                  getPopupContainer={() => document.body}
                  dropdownStyle={{ zIndex: 4000 }}
                />
                <QrScanPopover
                  label=""
                  buttonClassName="shrink-0"
                  onScan={(scan) => handleQrScanForRow(index, rowKey, scan)}
                  buttonProps={{ type: 'text', size: 'small' }}
                />
              </div>
            );
          },
        },
        {
          title: 'قفسه برداشت',
          dataIndex: 'selected_shelf_id',
          key: 'selected_shelf_id',
          width: 220,
          render: (_: any, record: any) => {
            const rowKey = getRowKey(record);
            const rowIndex = resolveRowIndex(rowKey);
            const shelvesState = shelfOptionsByRow[rowKey];
            const hasProduct = !!record?.selected_product_id;
            return (
              <div className="flex items-center gap-2">
                <Select
                  placeholder={hasProduct ? 'انتخاب قفسه' : 'ابتدا محصول را انتخاب کنید'}
                  value={record?.selected_shelf_id || null}
                  loading={shelvesState?.loading}
                  options={shelvesState?.options || []}
                  onChange={(val) => {
                    if (rowIndex < 0) return;
                    updateRow(rowIndex, 'selected_shelf_id', val || null);
                  }}
                  onDropdownVisibleChange={(open) => {
                    if (!open || !hasProduct) return;
                    if (!shelvesState?.loading && !(shelvesState?.options || []).length) {
                      loadShelvesForRow(rowKey, record.selected_product_id);
                    }
                  }}
                  disabled={!hasProduct || isReadOnly}
                  allowClear
                  className="w-full"
                  status={hasProduct && !record?.selected_shelf_id ? 'error' : undefined}
                  getPopupContainer={() => document.body}
                  dropdownStyle={{ zIndex: 4000 }}
                />
                <QrScanPopover
                  label=""
                  buttonClassName="shrink-0"
                  buttonProps={{ type: 'default', shape: 'circle', size: 'small' }}
                  onScan={({ moduleId: scannedModule, recordId }) => {
                    if (rowIndex < 0) return;
                    if (scannedModule === 'shelves' && recordId) {
                      updateRow(rowIndex, 'selected_shelf_id', recordId);
                    }
                  }}
                />
              </div>
            );
          },
        },
      ]
    : [];

  const columns = [
    ...selectionColumns,
    ...(visibleColumns.map((col: any) => ({
      title: col.title,
      dataIndex: col.key,
      key: col.key,
      width: getColWidth(col),
      render: (text: any, record: any, index: number) => {
        const rowKey = getRowKey(record);

        const readonlyWhen = col.readonlyWhen as { field?: string; equals?: unknown } | undefined;
        const readonlyByCondition =
          !!readonlyWhen?.field &&
          Object.prototype.hasOwnProperty.call(record || {}, readonlyWhen.field) &&
          (record as any)[readonlyWhen.field] === readonlyWhen.equals;

        const fieldConfig: ModuleField = {
          key: col.key,
          type: col.type,
          labels: { fa: col.title, en: col.key },
          options: col.options,
          relationConfig: col.relationConfig,
          dynamicOptionsCategory: col.dynamicOptionsCategory,
          readonly: col.readonly
            || (isProductStockMovements && (record as any)?._readonly)
            || (isProductStockMovements && ['invoice_id', 'production_order_id', 'created_by_name', 'created_at', 'main_unit', 'sub_unit'].includes(col.key))
            || (isProductStockMovements && col.key === 'source' && (record as any)?._readonly)
            || (isProductStockMovements && col.key === 'from_shelf_id' && String((record as any)?.voucher_type || '') === 'incoming')
            || (isProductStockMovements && col.key === 'to_shelf_id' && String((record as any)?.voucher_type || '') === 'outgoing')
            || ((record as any)?._lockedFields || []).includes(col.key)
            || (isProductionOrder && isBomItemBlock && (record as any)?.selected_product_id && !editableAfterSelection.has(col.key))
            || readonlyByCondition
            || (isInvoiceItems && col.key === 'source_shelf_id' && !record?.product_id),
        };

        let options = col.options;
        if (col.dynamicOptionsCategory) {
          options = dynamicOptions[col.dynamicOptionsCategory] || localDynamicOptions[col.dynamicOptionsCategory];
          if (Array.isArray(options)) options = dedupeOptionsByLabel(options);
        }
        if (isProductStockMovements && col.key === 'source' && Array.isArray(options) && !(record as any)?._readonly) {
          const allowed = new Set(['opening_balance', 'inventory_count', 'waste']);
          options = options.filter((opt: any) => allowed.has(String(opt?.value || '')));
        }
        if (col.type === FieldType.RELATION) {
          const specificKey = `${block.id}_${col.key}`;
          options = relationOptions[specificKey] || relationOptions[col.key] || [];
          if (isInvoiceItems && col.key === 'source_shelf_id') {
            const shelvesState = shelfOptionsByRow[rowKey];
            options = shelvesState?.options || [];
          }
        }

        const handleChange = (val: any) => {
          if (col.type === FieldType.RELATION) {
            handleRelationChange(index, col.key, val, col.relationConfig);
          } else {
            updateRow(index, col.key, val);
          }
        };

        const typeKey = col.key === 'discount' ? 'discount_type' : col.key === 'vat' ? 'vat_type' : null;
        const typeValue = typeKey ? (record as any)[typeKey] : null;
        const isMovementQty = isProductStockMovements && col.key === 'main_quantity' && !isEditing;
        const movementType = String((record as any)?.voucher_type || '');
        const movementColor = movementType === 'incoming' ? 'text-green-600' : movementType === 'outgoing' ? 'text-red-600' : 'text-blue-600';

        if (isMovementQty) {
          return <span className={`persian-number font-bold ${movementColor}`}>{toPersianNumber(text || 0)}</span>;
        }

        return (
          <div className="flex items-center gap-1 w-full min-w-0 max-w-full overflow-hidden">
            <div className="flex-1 min-w-0 overflow-hidden">
              <SmartFieldRenderer
                field={fieldConfig}
                value={text}
                onChange={handleChange}
                forceEditMode={isEditing}
                options={options}
                compactMode={true}
              />
            </div>
            {col.type === FieldType.PERCENTAGE_OR_AMOUNT && typeKey && (
              <Button
                size="small"
                type="text"
                onClick={() => {
                  const nextType = typeValue === 'percent' ? 'amount' : 'percent';
                  updateRow(index, typeKey, nextType);
                }}
                title={typeValue === 'percent' ? 'درصد' : 'مبلغ'}
                className="px-1"
              >
                {typeValue === 'percent' ? '٪' : (isAnyInvoiceItems ? 'تومان' : 'ریال')}
              </Button>
            )}
          </div>
        );
      },
    })) || []),
    ...(isEditing
        ? [
          {
            title: '',
            key: 'actions',
            width: block?.allowRowCopy ? 84 : 50,
            render: (_: any, row: any, i: number) => (
              <Space size={0}>
                {block?.allowRowCopy ? (
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() => copyRow(i)}
                    disabled={isProductStockMovements && row?._readonly}
                  />
                ) : null}
                <Button
                  danger
                  type="text"
                  icon={<DeleteOutlined />}
                  onClick={() => removeRow(i)}
                  disabled={isProductStockMovements && row?._readonly}
                />
              </Space>
            ),
          },
        ]
      : []),
  ];

  if (loadingData) return <div className="p-10 text-center"><Spin /></div>;

  return (
    <div className={`bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border ${isEditing ? 'border-leather-500' : 'border-gray-200 dark:border-gray-800'} transition-all font-medium`}>
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex items-center gap-2 flex-row-reverse">
          <Button
            type="text"
            size="small"
            className="p-0"
            onClick={() => {
              setUserToggledCollapse(true);
              setIsCollapsed((prev) => !prev);
            }}
            icon={<RightOutlined className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />}
          />
          <h3 className="font-bold text-base text-gray-700 dark:text-white m-0 flex items-center gap-2">
            <span className="w-1 h-5 bg-leather-500 rounded-full inline-block"></span>
            {block.titles.fa}
          </h3>
        </div>
        <Space>
          {mode === 'db' && !isEditing && !isReadOnly && <Button size="small" icon={<EditOutlined />} onClick={startEdit}>ویرایش لیست</Button>}
          {isEditing && mode !== 'local' && (
            <>
              <Button type="primary" onClick={handleSave} loading={saving} icon={<SaveOutlined />}>ذخیره</Button>
              <Button onClick={cancelEdit} disabled={saving} icon={<CloseOutlined />}>انصراف</Button>
            </>
          )}
        </Space>
      </div>

      {!isCollapsed && (
        <Table
          dataSource={isEditing ? tempData : data}
          columns={columns}
          pagination={false}
          size="middle"
          rowKey={(record: any) => record.key || record.id || Math.random()}
          locale={{ emptyText: <Empty description="لیست خالی است" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          className="custom-erp-table font-medium editable-table-main"
          tableLayout="auto"
          scroll={{ x: 'max-content' }}
          expandable={isProductionOrder && isBomItemBlock ? {
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as React.Key[]),
            onExpand: (expanded, record) => {
              if (expanded) {
                const rowKey = getRowKey(record);
                loadProductsForRow(rowKey, record, { resetPage: true });
                if (record?.selected_product_id) {
                  loadShelvesForRow(rowKey, record.selected_product_id);
                }
              }
            },
            expandedRowRender: (record: any) => {
              const rowKey = getRowKey(record);
              const rowIndex = resolveRowIndex(rowKey);
              const productsState = expandedProducts[rowKey];
              const selectedProductId = record?.selected_product_id;

              const filterColumns = (block.tableColumns || [])
                .filter((col: any) => col.filterable)
                .map((col: any) => col.key);
              const productFieldKeys = (productsModule?.fields || []).map((f: any) => f.key) || [];
              const specsColumns = filterColumns.filter((key: string) => productFieldKeys.includes(key));

              const baseColumns = ['image_url', 'name', 'system_code'];
              const tailColumns = ['stock', 'buy_price', 'sell_price'];
              const orderedColumns = Array.from(new Set([...baseColumns, ...specsColumns, ...tailColumns]));
              const resolvedColumns = orderedColumns.filter((key) => productFieldKeys.includes(key));
              const fallbackColumns = resolvedColumns.length > 0 ? resolvedColumns : ['name'];

              return (
                <div className="bg-gray-50 dark:bg-[#121212] py-3 px-0 rounded-lg border border-gray-200 dark:border-gray-700">
                  {productsState?.loading ? (
                    <div className="py-6 flex items-center justify-center"><Spin /></div>
                  ) : (
                    <div className="smarttable-shell">
                      <SmartTableRenderer
                        key={`products-${rowKey}-${rowReloadVersion[rowKey] || 0}`}
                        moduleConfig={productsModule}
                        data={productsState?.data || []}
                        loading={false}
                        relationOptions={relationOptions}
                        dynamicOptions={dynamicOptions}
                        containerClassName="smarttable-shell-inner"
                        tableLayout="auto"
                        disableScroll={true}
                        visibleColumns={fallbackColumns}
                        pagination={{ pageSize: 5, position: ['bottomCenter'], size: 'small', showSizeChanger: false }}
                        rowSelection={{
                          type: 'radio',
                          selectedRowKeys: selectedProductId ? [selectedProductId] : [],
                          onChange: (_keys: any[], rows: any[]) => {
                            const selected = rows?.[0];
                            if (rowIndex < 0) return;
                            applySelectedProduct(rowIndex, rowKey, selected);
                          },
                        }}
                      />
                    </div>
                  )}

                </div>
              );
            },
          } : undefined}
          footer={(isEditing || mode === 'local') && !isReadOnly ? () => (
            <Button type="dashed" block icon={<PlusOutlined />} onClick={addRow}>افزودن ردیف جدید</Button>
          ) : undefined}
          summary={(pageData) => {
            if (isProductStockMovements) {
              const incoming = pageData.reduce((sum: number, row: any) => {
                const qty = Math.abs(parseFloat(row?.main_quantity) || 0);
                const type = String(row?.voucher_type || '');
                if (type === 'incoming' || type === 'transfer') return sum + qty;
                return sum;
              }, 0);
              const outgoing = pageData.reduce((sum: number, row: any) => {
                const qty = Math.abs(parseFloat(row?.main_quantity) || 0);
                const type = String(row?.voucher_type || '');
                if (type === 'outgoing' || type === 'transfer') return sum + qty;
                return sum;
              }, 0);
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row className="bg-gray-50 dark:bg-gray-800 font-bold">
                    <Table.Summary.Cell index={0} colSpan={columns.length}>
                      <div className="flex flex-wrap gap-4 text-xs md:text-sm">
                        <span>جمع ورود: <span className="text-green-600 persian-number">{toPersianNumber(incoming)}</span></span>
                        <span>جمع خروج: <span className="text-red-600 persian-number">{toPersianNumber(outgoing)}</span></span>
                        <span>موجودی فعلی: <span className="text-leather-600 persian-number">{toPersianNumber(currentProductStock)}</span></span>
                      </div>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }

            let cellIndex = 0;
            const cells: React.ReactNode[] = [];

            if (isProductionOrder && isBomItemBlock) {
              cells.push(<Table.Summary.Cell index={cellIndex} key="expand-spacer" />);
              cellIndex += 1;
            }

            columns.forEach((col: any, index: number) => {
              if (col.key === 'actions') {
                cells.push(<Table.Summary.Cell index={cellIndex} key={`actions_${index}`} />);
                cellIndex += 1;
                return;
              }

              if (index === 0) {
                cells.push(
                  <Table.Summary.Cell index={cellIndex} key={`label_${index}`}>
                    جمع:
                  </Table.Summary.Cell>
                );
                cellIndex += 1;
                return;
              }

              if (col.showTotal || ['total_price', 'amount', 'quantity', 'usage', 'stock'].includes(col.key)) {
                let total = 0;
                if (isAnyInvoiceItems && (col.key === 'discount' || col.key === 'vat')) {
                  total = pageData.reduce((prev: number, current: any) => {
                    const amounts = getInvoiceAmounts(current);
                    return prev + (col.key === 'discount' ? amounts.discountAmount : amounts.vatAmount);
                  }, 0);
                } else if (isAnyInvoicePayments && col.key === 'amount') {
                  total = pageData.reduce((prev: number, current: any) =>
                    current?.status === 'received' ? prev + (parseFloat(current[col.key]) || 0) : prev,
                  0);
                } else {
                  total = pageData.reduce((prev: number, current: any) => prev + (parseFloat(current[col.key]) || 0), 0);
                }
                cells.push(
                  <Table.Summary.Cell index={cellIndex} key={`total_${index}`}>
                    <Text type="success" className="persian-number">
                      {toPersianNumber(total.toLocaleString('en-US'))}
                    </Text>
                  </Table.Summary.Cell>
                );
                cellIndex += 1;
                return;
              }

              cells.push(<Table.Summary.Cell index={cellIndex} key={`empty_${index}`} />);
              cellIndex += 1;
            });

            return (
              <Table.Summary fixed>
                <Table.Summary.Row className="bg-gray-50 dark:bg-gray-800 font-bold">
                  {cells}
                </Table.Summary.Row>
              </Table.Summary>
            );
          }}
        />
      )}
      <style>{`
        .ant-table-expanded-row > td {
          padding-left: 0 !important;
          padding-right: 0 !important;
        }
        .smarttable-shell {
          width: 100%;
          overflow-x: auto;
        }
        .smarttable-shell-inner,
        .smarttable-shell-inner .ant-table,
        .smarttable-shell-inner .ant-table-container {
          width: 100% !important;
          min-width: 0 !important;
        }
        .smarttable-shell-inner .ant-table-content,
        .smarttable-shell-inner .ant-table-container > table {
          width: 100% !important;
        }
        .smarttable-shell-inner .ant-table-container {
          margin: 0 !important;
          padding: 0 !important;
        }
        .smarttable-shell-inner .ant-spin-nested-loading,
        .smarttable-shell-inner .ant-spin-container {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          min-width: 0 !important;
        }
        .smarttable-shell-inner .ant-table-body {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .smarttable-shell-inner .ant-table-body::-webkit-scrollbar {
          height: 0px;
        }
        .smarttable-shell-inner .ant-table-filter-dropdown,
        .smarttable-shell-inner .ant-dropdown {
          z-index: 7000 !important;
        }
        .editable-table-main {
          font-size: 12px;
        }
        .editable-table-main .ant-table {
          font-size: 12px;
        }
        .editable-table-main .ant-table-cell {
          padding: 10px 12px !important;
          font-size: 12px !important;
          overflow: hidden !important;
          text-overflow: ellipsis;
        }
        .editable-table-main .ant-table-thead > tr > th {
          padding: 10px 10px !important;
          font-size: 12px !important;
        }
        .editable-table-main .ant-table-cell .ant-form-item {
          margin-bottom: 0 !important;
          min-width: 0 !important;
        }
        .editable-table-main .ant-table-cell .ant-select,
        .editable-table-main .ant-table-cell .ant-input,
        .editable-table-main .ant-table-cell .ant-input-number,
        .editable-table-main .ant-table-cell .ant-picker {
          max-width: 100% !important;
        }
        .editable-table-main .ant-table-cell .ant-select-selector {
          min-width: 0 !important;
        }
        .custom-erp-table .ant-table-expanded-row > td {
          overflow-x: auto !important;
        }
      `}</style>
    </div>
  );
};

export default EditableTable;
