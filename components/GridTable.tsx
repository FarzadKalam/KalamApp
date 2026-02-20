import React, { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Empty, Input, InputNumber, Modal, Popover, Radio, Select, Spin, Table, Typography, message } from 'antd';
import { PlusOutlined, SaveOutlined, EditOutlined, RightOutlined, CloseCircleOutlined, LockOutlined, DeleteOutlined, CloseOutlined, CopyOutlined, SwapOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { BlockDefinition, FieldType } from '../types';
import { MODULES } from '../moduleRegistry';
import { convertArea, HARD_CODED_UNIT_OPTIONS } from '../utils/unitConversions';
import { getSingleOptionLabel } from '../utils/optionHelpers';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import SmartFieldRenderer from './SmartFieldRenderer';
import QrScanPopover from './QrScanPopover';
import { buildProductFilters, runProductsQuery } from './editableTable/productionOrderHelpers';

const { Text } = Typography;
type ResponsiveBreakpoint = 'xxl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs';

interface GridTableProps {
  block: BlockDefinition;
  initialData: any[];
  moduleId?: string;
  recordId?: string;
  relationOptions: Record<string, any[]>;
  dynamicOptions?: Record<string, any[]>;
  onSaveSuccess?: (newData: any[]) => void;
  onChange?: (newData: any[]) => void;
  mode?: 'db' | 'local' | 'external_view';
  canEditModule?: boolean;
  canViewField?: (fieldKey: string) => boolean;
  readOnly?: boolean;
  orderQuantity?: number;
  showDeliveredQtyColumn?: boolean;
  forceProductionOrderMode?: boolean;
}

const defaultPiece = () => ({
  name: '',
  length: 0,
  width: 0,
  quantity: 1,
  waste_rate: 0,
  main_unit: null,
  sub_unit: null,
  qty_main: 0,
  qty_sub: 0,
  formula_id: null,
  final_usage: 0,
  unit_price: 0,
  cost_per_item: 0,
  total_usage: 0,
  total_cost: 0,
  image_url: null,
});

const unitOptions = HARD_CODED_UNIT_OPTIONS;
const createPieceKey = () => `piece_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const createRowKey = () => `grid_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const createEmptyRow = () => ({
  key: createRowKey(),
  collapsed: true,
  header: {
    category: null,
    selected_product_id: null,
    selected_product_name: null,
  },
  specs: {},
  pieces: [{ key: createPieceKey(), ...defaultPiece() }],
  totals: {},
});

const toEnglishDigits = (value: any) =>
  String(value ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const normalizeNumberInput = (value: any) =>
  toEnglishDigits(value).replace(/,/g, '').replace(/\u066C/g, '').trim();

const addCommas = (value: string) => value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatGroupedInput = (value: any) => {
  const raw = normalizeNumberInput(value);
  if (!raw) return '';
  const sign = raw.startsWith('-') ? '-' : '';
  const unsigned = raw.replace(/-/g, '');
  const [intPartRaw, decimalPart] = unsigned.split('.');
  const intPart = (intPartRaw || '0').replace(/^0+(?=\d)/, '');
  const grouped = addCommas(intPart || '0');
  const withDecimal = decimalPart !== undefined ? `${grouped}.${decimalPart}` : grouped;
  return toPersianNumber(`${sign}${withDecimal}`);
};

const parseNumberInput = (value: any) => {
  const normalized = normalizeNumberInput(value);
  if (!normalized) return 0;
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const GridTable: React.FC<GridTableProps> = ({
  block,
  initialData,
  moduleId,
  recordId,
  relationOptions,
  dynamicOptions = {},
  onSaveSuccess,
  onChange,
  mode = 'db',
  canEditModule,
  canViewField,
  readOnly,
  orderQuantity = 0,
  showDeliveredQtyColumn = false,
  forceProductionOrderMode = false,
}) => {
  const isReadOnly = readOnly === true || canEditModule === false || block?.readonly === true;
  const isProductionOrder = moduleId === 'production_orders' || forceProductionOrderMode;
  // TEMP: hide formula selector in raw-material pieces for BOM and Production Orders.
  // Set to `false` to restore the column quickly.
  const TEMP_HIDE_FORMULA_IN_PRODUCTION = true;
  const shouldHideFormulaColumn =
    TEMP_HIDE_FORMULA_IN_PRODUCTION &&
    (moduleId === 'production_boms' || moduleId === 'production_orders');
  const [activeEditRowKey, setActiveEditRowKey] = useState<string | null>(null);
  const [data, setData] = useState<any[]>(Array.isArray(initialData) ? initialData : []);
  const [tempData, setTempData] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading] = useState(false);
  const [productOptions, setProductOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [productOptionsLoading, setProductOptionsLoading] = useState(false);
  const [localDynamicOptions, setLocalDynamicOptions] = useState<Record<string, any[]>>({});
  const [selectedPieceKeysByRow, setSelectedPieceKeysByRow] = useState<Record<string, string[]>>({});
  const [pieceActionPopover, setPieceActionPopover] = useState<{ rowKey: string; action: 'copy' | 'move' } | null>(null);
  const [transferTargetMode, setTransferTargetMode] = useState<'existing' | 'new'>('existing');
  const [transferTargetRowKey, setTransferTargetRowKey] = useState<string | null>(null);
  const [transferTargetProductId, setTransferTargetProductId] = useState<string | null>(null);
  const [transferProductOptions, setTransferProductOptions] = useState<Array<{ label: string; value: string; category?: string | null }>>([]);
  const [transferProductOptionsLoading, setTransferProductOptionsLoading] = useState(false);

  const productModule = MODULES['products'];
  const specFieldsByBlock = useMemo(() => {
    const map = new Map<string, any[]>();
    (productModule?.fields || []).forEach((f: any) => {
      if (!f.blockId) return;
      if (!map.has(f.blockId)) map.set(f.blockId, []);
      map.get(f.blockId)!.push(f);
    });
    return map;
  }, [productModule]);

  useEffect(() => {
    if (mode === 'db' && !!activeEditRowKey) {
      return;
    }
    const safeData = Array.isArray(initialData) ? initialData : [];
    const normalized = safeData.map((item, idx) => ({
      key: item.key || item.id || `${createRowKey()}_${idx}`,
      collapsed: item.collapsed ?? true,
      ...item,
      pieces: Array.isArray(item.pieces)
        ? item.pieces.map((piece: any, pIdx: number) => ({
            key: piece.key || piece.id || `${createPieceKey()}_${idx}_${pIdx}`,
            ...piece,
          }))
        : item.pieces,
    }));
    const next = normalized.length > 0 ? normalized : [createEmptyRow()];
    setData(next);
    setTempData(next);
    setActiveEditRowKey(null);
    setSelectedPieceKeysByRow({});
    setPieceActionPopover(null);
    setTransferTargetMode('existing');
    setTransferTargetRowKey(null);
    setTransferTargetProductId(null);
    setTransferProductOptions([]);
  }, [initialData, mode, activeEditRowKey]);

  const categories = block?.gridConfig?.categories || [];

  const getSpecFields = (category: string | null) => {
    const specBlockId = categories.find((c) => c.value === category)?.specBlockId;
    if (!specBlockId) return [];
    return specFieldsByBlock.get(specBlockId) || [];
  };

  const updateGrid = (nextData: any[]) => {
    setTempData(nextData);
    if (mode === 'local') {
      setData(nextData);
      if (onChange) onChange(nextData);
      return;
    }
    if (mode === 'db' && !activeEditRowKey) {
      setData(nextData);
    }
  };

  const getWorkingData = () => {
    if (mode === 'db') {
      return activeEditRowKey ? tempData : data;
    }
    return tempData;
  };

  const getRowKeyValue = (row: any, index: number) => String(row?.key || index);

  const getSelectedPieceKeys = (rowKey: string) => selectedPieceKeysByRow[rowKey] || [];

  const setSelectedPieceKeys = (rowKey: string, keys: string[]) => {
    setSelectedPieceKeysByRow((prev) => {
      if (!keys.length) {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      }
      return { ...prev, [rowKey]: keys };
    });
  };

  const closePieceActionPopover = () => {
    setPieceActionPopover(null);
    setTransferTargetMode('existing');
    setTransferTargetRowKey(null);
    setTransferTargetProductId(null);
    setTransferProductOptions([]);
  };

  const getCategoryCandidates = (categoryValue: any): string[] => {
    const raw = categoryValue == null ? null : String(categoryValue).trim();
    if (!raw) return [];
    const categoryMatch = categories.find((c: any) => String(c?.value || '') === raw || String(c?.label || '') === raw);
    const candidates = [raw, categoryMatch?.value, categoryMatch?.label]
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim());
    return Array.from(new Set(candidates));
  };

  const matchesCategory = (candidateCategory: any, currentCategory: any) => {
    const currentCandidates = getCategoryCandidates(currentCategory);
    if (currentCandidates.length === 0) return true;
    const candidateCandidates = getCategoryCandidates(candidateCategory);
    if (candidateCandidates.length === 0 && candidateCategory != null) {
      const fallback = String(candidateCategory).trim();
      return currentCandidates.includes(fallback);
    }
    return candidateCandidates.some((candidate) => currentCandidates.includes(candidate));
  };

  const getRowUnitsSummary = (row: any) => {
    const pieces = Array.isArray(row?.pieces) ? row.pieces : [];
    const mainUnits = Array.from(
      new Set(
        pieces
          .map((piece: any) => String(piece?.main_unit || '').trim())
          .filter((val: string) => !!val)
      )
    );
    const subUnits = Array.from(
      new Set(
        pieces
          .map((piece: any) => String(piece?.sub_unit || '').trim())
          .filter((val: string) => !!val)
      )
    );

    return {
      main: mainUnits[0] || null,
      sub: subUnits[0] || null,
      mainLabel: mainUnits.length ? mainUnits.join('، ') : '-',
      subLabel: subUnits.length ? subUnits.join('، ') : '-',
    };
  };

  const askUnitMismatchResolution = async (payload: {
    productMainUnit: string | null;
    productSubUnit: string | null;
    rowMainLabel: string;
    rowSubLabel: string;
  }) => {
    return new Promise<boolean>((resolve) => {
      Modal.confirm({
        title: 'اختلاف واحد محصول و سفارش تولید',
        content: (
          <div className="text-xs leading-6">
            <div className="text-red-600 font-semibold mb-2">
              واحد محصول انتخاب شده با واحدی که در ردیف قطعات ثبت شده متفاوت است.
            </div>
            <div>واحد اصلی محصول: <span className="font-semibold">{payload.productMainUnit || '-'}</span></div>
            <div>واحد فرعی محصول: <span className="font-semibold">{payload.productSubUnit || '-'}</span></div>
            <div>واحد اصلی سفارش تولید فعلی: <span className="font-semibold">{payload.rowMainLabel || '-'}</span></div>
            <div>واحد فرعی سفارش تولید فعلی: <span className="font-semibold">{payload.rowSubLabel || '-'}</span></div>
          </div>
        ),
        okText: 'نام واحد را از محصول انتخاب شده کپی کن',
        cancelText: 'واحد ها را تغییر نده',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const cloneGridRowWithNewKeys = (row: any) => {
    const pieces = Array.isArray(row?.pieces)
      ? row.pieces.map((piece: any) => ({ ...piece, key: createPieceKey() }))
      : [{ key: createPieceKey(), ...defaultPiece() }];
    return applyCalculations({
      ...row,
      key: createRowKey(),
      collapsed: false,
      pieces,
    });
  };

  const formatQuantity = (value: any, decimals = 2) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return toPersianNumber(0);
    const rounded = Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    const fixed = rounded.toFixed(decimals).replace(/\.?0+$/, '');
    const [intPartRaw, decimalPart] = fixed.split('.');
    const intPart = Number(intPartRaw || 0).toLocaleString('en-US');
    const normalized = decimalPart ? `${intPart}.${decimalPart}` : intPart;
    return toPersianNumber(normalized);
  };

  const toNumber = (value: any) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const applyCalculations = (gridRow: any) => {
    const pieces = Array.isArray(gridRow.pieces) ? gridRow.pieces : [];
    const qty = Number(orderQuantity) || 0;

    let totalQty = 0;
    let totalMain = 0;
    let totalSub = 0;
    let totalFinal = 0;
    let totalUsageAll = 0;
    let totalCost = 0;

    const nextPieces = pieces.map((piece: any) => {
      const length = parseFloat(piece.length) || 0;
      const width = parseFloat(piece.width) || 0;
      const quantity = parseFloat(piece.quantity) || 0;
      const wasteRate = parseFloat(piece.waste_rate) || 0;
      const baseUsage = length && width ? length * width * (quantity || 1) : quantity || 0;
      const finalUsage = baseUsage * (1 + wasteRate / 100);
      const mainUnit = piece.main_unit || gridRow?.header?.main_unit || null;
      const subUnit = piece.sub_unit || null;
      const qtySubRaw = convertArea(baseUsage, mainUnit, subUnit);
      const qtySub = Number.isFinite(qtySubRaw) ? Math.round(qtySubRaw * 100) / 100 : 0;

      const unitPrice = parseFloat(piece.unit_price) || 0;
      const costPerItem = unitPrice * finalUsage;
      const totalUsage = qty ? finalUsage * qty : 0;
      const totalCostRow = qty ? costPerItem * qty : costPerItem;

      totalQty += quantity || 0;
      totalMain += baseUsage || 0;
      totalSub += qtySub || 0;
      totalFinal += finalUsage || 0;
      totalUsageAll += totalUsage || 0;
      totalCost += totalCostRow || 0;

      return {
        ...piece,
        qty_main: baseUsage,
        qty_sub: qtySub,
        final_usage: finalUsage,
        cost_per_item: costPerItem,
        total_usage: totalUsage,
        total_cost: totalCostRow,
      };
    });

    return {
      ...gridRow,
      pieces: nextPieces,
      totals: {
        total_quantity: totalQty,
        total_qty_main: totalMain,
        total_qty_sub: totalSub,
        total_final_usage: totalFinal,
        total_usage: totalUsageAll,
        total_cost: totalCost,
      },
    };
  };

  const updateRow = (rowIndex: number, patch: Record<string, any>) => {
    const source = getWorkingData();
    const nextData = [...source];
    const row = { ...nextData[rowIndex], ...patch };
    if (patch.header || patch.specs) {
      row.collapsed = false;
    }
    nextData[rowIndex] = applyCalculations(row);
    updateGrid(nextData);
  };

  const updatePiece = (rowIndex: number, pieceIndex: number, patch: Record<string, any>) => {
    const source = getWorkingData();
    const nextData = [...source];
    const row = { ...nextData[rowIndex] };
    const pieces = Array.isArray(row.pieces) ? [...row.pieces] : [];
    pieces[pieceIndex] = { ...pieces[pieceIndex], ...patch };
    row.pieces = pieces;
    nextData[rowIndex] = applyCalculations(row);
    updateGrid(nextData);
  };

  const addPiece = (rowIndex: number) => {
    const source = getWorkingData();
    const nextData = [...source];
    const row = { ...nextData[rowIndex] };
    const pieces = Array.isArray(row.pieces) ? [...row.pieces] : [];
    pieces.push({ key: createPieceKey(), ...defaultPiece() });
    row.pieces = pieces;
    nextData[rowIndex] = applyCalculations(row);
    updateGrid(nextData);
  };

  const addGridRow = () => {
    if (isReadOnly) return;
    const newRow = createEmptyRow();
    const source = getWorkingData();
    const nextData = [...source, newRow];
    updateGrid(nextData);
  };

  const removeGridRow = (rowIndex: number) => {
    if (isReadOnly) return;
    const source = getWorkingData();
    const nextData = [...source];
    const removedKey = String(nextData[rowIndex]?.key || rowIndex);
    nextData.splice(rowIndex, 1);
    setSelectedPieceKeys(removedKey, []);
    if (pieceActionPopover?.rowKey === removedKey) {
      closePieceActionPopover();
    }
    if (mode === 'db' && !activeEditRowKey) {
      setSaving(true);
      void (async () => {
        try {
          await persistGridRows(nextData, 'حذف شد');
        } catch (e: any) {
          message.error(e.message || 'خطا در حذف');
        } finally {
          setSaving(false);
        }
      })();
      return;
    }
    if (mode === 'db' && activeEditRowKey === removedKey) {
      const nextRowKey = nextData[0] ? String(nextData[0].key || 0) : null;
      setActiveEditRowKey(nextRowKey);
    }
    updateGrid(nextData);
  };

  const confirmRemoveGridRow = (rowIndex: number) => {
    if (isReadOnly) return;
    message.warning('در حال حذف جدول مواد اولیه هستید.');
    Modal.confirm({
      title: 'حذف جدول مواد اولیه',
      content: 'این جدول حذف شود؟',
      okText: 'حذف',
      cancelText: 'انصراف',
      okButtonProps: { danger: true },
      onOk: () => removeGridRow(rowIndex),
    });
  };

  const startEditRow = (rowKey: string) => {
    if (isReadOnly || mode !== 'db') return;
    if (activeEditRowKey && activeEditRowKey !== rowKey) {
      message.warning('ابتدا تغییرات ردیف در حال ویرایش را ثبت کنید.');
      return;
    }
    const cloned = JSON.parse(JSON.stringify(data));
    const rowIndex = cloned.findIndex((row: any, idx: number) => getRowKeyValue(row, idx) === rowKey);
    if (rowIndex >= 0) {
      cloned[rowIndex] = { ...cloned[rowIndex], collapsed: false };
    }
    setTempData(cloned);
    setActiveEditRowKey(rowKey);
  };

  const cancelEditRow = () => {
    setTempData(JSON.parse(JSON.stringify(data)));
    setActiveEditRowKey(null);
  };

  const persistGridRows = async (rows: any[], successMessage = 'ذخیره شد') => {
    if (!moduleId || !recordId) throw new Error('رکورد یافت نشد');
    const payload = (rows || []).map(({ key, ...rest }: any) => rest);
    const { error } = await supabase.from(moduleId).update({ [block.id]: payload }).eq('id', recordId);
    if (error) throw error;
    setData(payload);
    setTempData(payload);
    if (onSaveSuccess) onSaveSuccess(payload);
    message.success(successMessage);
  };

  const handleSave = async () => {
    if (mode === 'local' || mode === 'external_view') return;
    if (!activeEditRowKey) return;
    setSaving(true);
    try {
      await persistGridRows(tempData, 'ذخیره شد');
      setActiveEditRowKey(null);
    } catch (e: any) {
      message.error(e.message || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const fetchProductById = async (productId: string) => {
    const { data: product, error } = await supabase.from('products').select('*').eq('id', productId).single();
    if (error) throw error;
    return product;
  };

  const applySelectedProduct = async (rowIndex: number, productId: string | null) => {
    const source = getWorkingData();
    const nextData = [...source];
    const row = { ...nextData[rowIndex] };

    if (!productId) {
      row.header = { ...row.header, selected_product_id: null, selected_product_name: null };
      row.collapsed = false;
      row.specs_locked = false;
      nextData[rowIndex] = row;
      updateGrid(nextData);
      return;
    }

    try {
      const product = await fetchProductById(productId);
      const currentUnits = getRowUnitsSummary(row);
      const productMainUnit = product?.main_unit ? String(product.main_unit) : null;
      const productSubUnit = product?.sub_unit ? String(product.sub_unit) : null;

      const mainUnitMismatch =
        !!productMainUnit &&
        !!currentUnits.main &&
        productMainUnit !== String(currentUnits.main);
      const subUnitMismatch =
        !!productSubUnit &&
        !!currentUnits.sub &&
        productSubUnit !== String(currentUnits.sub);

      let shouldCopyUnits = true;
      if (mainUnitMismatch || subUnitMismatch) {
        shouldCopyUnits = await askUnitMismatchResolution({
          productMainUnit,
          productSubUnit,
          rowMainLabel: currentUnits.mainLabel,
          rowSubLabel: currentUnits.subLabel,
        });
      }

      row.header = {
        ...row.header,
        selected_product_id: product?.id || productId,
        selected_product_name: product?.name || '',
      };
      row.collapsed = false;

      const specFields = getSpecFields(row.header?.category || null);
      const specs: any = { ...(row.specs || {}) };
      specFields.forEach((f: any) => {
        if (product && product[f.key] !== undefined) specs[f.key] = product[f.key];
      });

      row.specs = specs;
      row.specs_locked = true;

      const pieces = (row.pieces || []).map((piece: any) => ({
        ...piece,
        waste_rate: product?.waste_rate ?? piece.waste_rate,
        main_unit: shouldCopyUnits ? (product?.main_unit ?? piece.main_unit) : piece.main_unit,
        sub_unit: shouldCopyUnits ? (product?.sub_unit ?? piece.sub_unit) : piece.sub_unit,
        unit_price: product?.buy_price ?? piece.unit_price,
      }));
      row.pieces = pieces;

      nextData[rowIndex] = applyCalculations(row);
      updateGrid(nextData);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProductOptions = async () => {
    if (productOptionsLoading) return;
    setProductOptionsLoading(true);
    try {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, system_code, category, product_type')
        .order('created_at', { ascending: false })
        .limit(200);
      const options = (products || []).map((p: any) => ({
        value: p.id,
        label: p.system_code ? `${p.system_code} - ${p.name}` : p.name,
        category: p.category || null,
        product_type: p.product_type || null,
      }));
      setProductOptions(options);
    } catch (err) {
      console.warn('Could not load products', err);
    } finally {
      setProductOptionsLoading(false);
    }
  };

  const loadTransferProductOptions = async (categoryValue: any, searchText = '') => {
    setTransferProductOptionsLoading(true);
    try {
      const categoryCandidates = getCategoryCandidates(categoryValue);
      const keyword = String(searchText || '').trim();
      let query = supabase
        .from('products')
        .select('id, name, system_code, category')
        .order('name', { ascending: true })
        .limit(1000);

      if (categoryCandidates.length === 1) {
        query = query.eq('category', categoryCandidates[0]);
      } else if (categoryCandidates.length > 1) {
        query = query.in('category', categoryCandidates);
      }

      if (keyword) {
        const safeKeyword = keyword.replace(/,/g, '').replace(/\*/g, '');
        query = query.or(`name.ilike.%${safeKeyword}%,system_code.ilike.%${safeKeyword}%`);
      }

      const { data: products, error } = await query;
      if (error) throw error;

      const options = (products || []).map((product: any) => ({
        value: String(product.id),
        label: product.system_code ? `${product.system_code} - ${product.name}` : product.name,
        category: product.category || null,
      }));
      setTransferProductOptions(options);
    } catch (err) {
      console.warn('Could not load transfer products', err);
      setTransferProductOptions([]);
    } finally {
      setTransferProductOptionsLoading(false);
    }
  };

  const duplicateGridRow = (rowIndex: number, currentRowKey?: string) => {
    if (isReadOnly) return;
    if (mode === 'db' && !!activeEditRowKey && activeEditRowKey !== String(currentRowKey || rowIndex)) {
      message.warning('ابتدا تغییرات ردیف در حال ویرایش را ثبت کنید.');
      return;
    }

    const source = getWorkingData();
    const targetRow = source[rowIndex];
    if (!targetRow) return;

    const clonedRow = cloneGridRowWithNewKeys(targetRow);
    const nextData = [...source];
    nextData.splice(rowIndex + 1, 0, clonedRow);

    if (mode === 'db' && !activeEditRowKey) {
      setSaving(true);
      void (async () => {
        try {
          await persistGridRows(nextData, 'کپی جدول انجام شد');
        } catch (e: any) {
          message.error(e.message || 'خطا در کپی جدول');
        } finally {
          setSaving(false);
        }
      })();
      return;
    }

    updateGrid(nextData);
  };

  const togglePieceSelected = (rowKey: string, pieceKey: string, checked: boolean) => {
    const current = getSelectedPieceKeys(rowKey);
    if (checked) {
      const next = Array.from(new Set([...current, pieceKey]));
      setSelectedPieceKeys(rowKey, next);
      return;
    }
    setSelectedPieceKeys(rowKey, current.filter((key) => key !== pieceKey));
  };

  const deleteSelectedPieces = (rowIndex: number) => {
    const source = getWorkingData();
    const row = source[rowIndex];
    const rowKey = getRowKeyValue(row, rowIndex);
    const selectedKeys = new Set(getSelectedPieceKeys(rowKey));
    if (!selectedKeys.size) return;
    Modal.confirm({
      title: 'حذف قطعات انتخاب‌شده',
      content: 'قطعات انتخاب‌شده حذف شوند؟',
      okText: 'حذف',
      cancelText: 'انصراف',
      okButtonProps: { danger: true },
      onOk: () => {
        const nextData = [...source];
        const nextRow = { ...nextData[rowIndex] };
        const pieces = Array.isArray(nextRow.pieces) ? [...nextRow.pieces] : [];
        const remained = pieces.filter((piece: any) => !selectedKeys.has(String(piece?.key || '')));
        nextRow.pieces = remained.length > 0 ? remained : [{ key: createPieceKey(), ...defaultPiece() }];
        nextData[rowIndex] = applyCalculations(nextRow);
        updateGrid(nextData);
        setSelectedPieceKeys(rowKey, []);
        closePieceActionPopover();
      },
    });
  };

  const applyPieceTransfer = async (rowIndex: number, action: 'copy' | 'move') => {
    const source = getWorkingData();
    const sourceRow = source[rowIndex];
    if (!sourceRow) return;
    const rowKey = getRowKeyValue(sourceRow, rowIndex);
    const selectedKeys = getSelectedPieceKeys(rowKey);
    if (!selectedKeys.length) {
      message.warning('ابتدا یک یا چند قطعه را انتخاب کنید.');
      return;
    }

    const selectedKeySet = new Set(selectedKeys);
    const sourcePieces = Array.isArray(sourceRow.pieces) ? sourceRow.pieces : [];
    const selectedPieces = sourcePieces.filter((piece: any) => selectedKeySet.has(String(piece?.key || '')));
    if (!selectedPieces.length) {
      message.warning('قطعات انتخاب‌شده معتبر نیستند.');
      return;
    }

    const clonePieces = selectedPieces.map((piece: any) => ({
      ...piece,
      key: createPieceKey(),
    }));

    let nextData = [...source];
    let targetRowIndex = -1;
    let createdTargetRow = false;
    const sourceCategory = sourceRow?.header?.category || null;

    if (transferTargetMode === 'existing') {
      if (!transferTargetRowKey) {
        message.warning('محصول مقصد را انتخاب کنید.');
        return;
      }
      targetRowIndex = nextData.findIndex((row: any, idx: number) => getRowKeyValue(row, idx) === transferTargetRowKey);
      if (targetRowIndex < 0) {
        message.warning('جدول مقصد یافت نشد.');
        return;
      }
      if (!matchesCategory(nextData[targetRowIndex]?.header?.category, sourceCategory)) {
        message.warning('محصول مقصد باید هم‌دسته با جدول فعلی باشد.');
        return;
      }
    } else {
      if (!transferTargetProductId) {
        message.warning('محصول جدید را انتخاب کنید.');
        return;
      }
      targetRowIndex = nextData.findIndex((row: any) => String(row?.header?.selected_product_id || '') === String(transferTargetProductId));
      if (targetRowIndex < 0) {
        try {
          const product = await fetchProductById(String(transferTargetProductId));
          if (!matchesCategory(product?.category, sourceCategory)) {
            message.warning('محصول جدید باید در همان دسته‌بندی جدول فعلی باشد.');
            return;
          }
          const category = sourceCategory || product?.category || null;
          const specFields = getSpecFields(category);
          const specs: Record<string, any> = {};
          specFields.forEach((f: any) => {
            if (product && product[f.key] !== undefined) specs[f.key] = product[f.key];
          });
          const newRow = applyCalculations({
            key: createRowKey(),
            collapsed: false,
            header: {
              category,
              selected_product_id: product?.id || transferTargetProductId,
              selected_product_name: product?.name || '',
            },
            specs,
            specs_locked: true,
            pieces: clonePieces,
            totals: {},
          });
          nextData = [...nextData, newRow];
          targetRowIndex = nextData.length - 1;
          createdTargetRow = true;
        } catch (err) {
          console.error(err);
          message.error('خطا در بارگذاری محصول جدید');
          return;
        }
      }
    }

    if (targetRowIndex < 0) return;
    if (action === 'move' && targetRowIndex === rowIndex) {
      message.warning('برای جابجایی، مقصد باید متفاوت از مبدا باشد.');
      return;
    }

    if (!createdTargetRow) {
      const targetRow = { ...nextData[targetRowIndex] };
      const targetPieces = Array.isArray(targetRow.pieces) ? [...targetRow.pieces] : [];
      targetRow.pieces = [...targetPieces, ...clonePieces];
      nextData[targetRowIndex] = applyCalculations(targetRow);
    }

    if (action === 'move') {
      const updatedSourceRow = { ...nextData[rowIndex] };
      const remained = (Array.isArray(updatedSourceRow.pieces) ? updatedSourceRow.pieces : [])
        .filter((piece: any) => !selectedKeySet.has(String(piece?.key || '')));
      updatedSourceRow.pieces = remained.length > 0 ? remained : [{ key: createPieceKey(), ...defaultPiece() }];
      nextData[rowIndex] = applyCalculations(updatedSourceRow);
    }

    updateGrid(nextData);
    setSelectedPieceKeys(rowKey, []);
    closePieceActionPopover();
    message.success(action === 'copy' ? 'قطعات کپی شدند.' : 'قطعات جابجا شدند.');
  };

  useEffect(() => {
    if (!isProductionOrder || productOptionsLoading) return;
    const source = mode === 'db' ? (activeEditRowKey ? tempData : data) : tempData;
    const selectedIds = Array.from(
      new Set(
        (source || [])
          .map((row: any) => row?.header?.selected_product_id)
          .filter((val: any) => !!val)
      )
    ) as string[];
    if (selectedIds.length === 0) return;

    const existing = new Set(productOptions.map((opt: any) => opt.value));
    const missing = selectedIds.filter((id) => !existing.has(id));
    if (missing.length === 0) return;

    const fetchMissingSelected = async () => {
      try {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, system_code, category, product_type')
          .in('id', missing);
        const options = (products || []).map((p: any) => ({
          value: p.id,
          label: p.system_code ? `${p.system_code} - ${p.name}` : p.name,
          category: p.category || null,
          product_type: p.product_type || null,
        }));
        if (options.length) {
          setProductOptions((prev) => {
            const prevMap = new Map(prev.map((item: any) => [item.value, item]));
            options.forEach((item) => prevMap.set(item.value, item));
            return Array.from(prevMap.values());
          });
        }
      } catch (err) {
        console.warn('Could not load selected products labels', err);
      }
    };
    fetchMissingSelected();
  }, [isProductionOrder, mode, activeEditRowKey, tempData, data, productOptions, productOptionsLoading]);

  const ensureDynamicOptions = async (categoriesToLoad: string[]) => {
    const missing = categoriesToLoad.filter(
      (cat) => !dynamicOptions?.[cat] && !localDynamicOptions?.[cat]
    );
    if (missing.length === 0) return;
    const updates: Record<string, any[]> = {};
    for (const cat of missing) {
      try {
        const { data } = await supabase
          .from('dynamic_options')
          .select('label, value')
          .eq('category', cat)
          .eq('is_active', true)
          .order('display_order', { ascending: true });
        if (data) updates[cat] = data.filter((i: any) => i.value !== null);
      } catch (err) {
        console.warn('Dynamic options load failed:', cat, err);
      }
    }
    if (Object.keys(updates).length > 0) {
      setLocalDynamicOptions((prev) => ({ ...prev, ...updates }));
    }
  };

  const fetchFilteredProducts = async (row: any) => {
    const specFields = getSpecFields(row.header?.category || null);
    const tableColumns = specFields.map((f: any) => ({
      key: f.key,
      title: f.labels?.fa,
      type: f.type,
      filterable: true,
      filterKey: f.key,
      dynamicOptionsCategory: f.dynamicOptionsCategory,
    }));

    const rowData = { ...(row.specs || {}) };
    const filters = buildProductFilters(tableColumns, rowData, dynamicOptions, localDynamicOptions);
    const categoryValue = row?.header?.category || null;
    const baseFilters: Array<{ filterKey: string; value: any; colType: FieldType }> = [];
    if (categoryValue) {
      const categoryLabel = categories.find((c: any) => c.value === categoryValue)?.label || null;
      const categoryValues = [categoryValue, categoryLabel]
        .filter((v) => typeof v === 'string' && v.trim() !== '')
        .map((v) => String(v).trim())
        .filter((v, i, arr) => arr.indexOf(v) === i);
      baseFilters.push({
        filterKey: 'category',
        value: categoryValues.length > 1 ? categoryValues : categoryValues[0],
        colType: FieldType.SELECT,
      });
    }
    const result = await runProductsQuery(supabase as any, [...baseFilters, ...filters]);
    if (result.error) throw result.error;
    return result.data || [];
  };

  if (loading) return <div className="p-6 text-center"><Spin /></div>;

  const sourceData = mode === 'db' ? (activeEditRowKey ? tempData : data) : tempData;
  const rowHeaderBarStyle = { backgroundColor: '#8b5e3c' };

  return (
    <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 transition-all">
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex items-center gap-2 flex-row-reverse">
          <h3 className="font-bold text-base text-gray-700 dark:text-white m-0 flex items-center gap-2">
            <span className="w-1 h-5 bg-leather-500 rounded-full inline-block"></span>
            {block.titles.fa}
          </h3>
        </div>
      </div>

      {sourceData.length === 0 && (
        <div className="py-6">
          <Empty description="هنوز گروهی ثبت نشده" />
        </div>
      )}

      <div className="space-y-4">
        {sourceData.map((row: any, rowIndex: number) => {
          const rowKey = String(row.key || rowIndex);
          const isRowEditing = mode === 'db' && activeEditRowKey === rowKey;
          const rowCanEdit = !isReadOnly && (mode === 'local' || isRowEditing);
          const categoryValue = row.header?.category || null;
          let specFields = getSpecFields(categoryValue);
          if (moduleId === 'production_boms') {
            specFields = specFields.filter((f: any) => !String(f.key || '').toLowerCase().includes('color'));
          }
          const collapsed = row.collapsed === true;
          const isSpecsLocked = row.specs_locked === true;
          const shouldShowSpecs = isProductionOrder
            ? (rowCanEdit && !row.header?.selected_product_id)
            : true;
          const selectedPieceKeys = getSelectedPieceKeys(rowKey);
          const selectedPieceCount = selectedPieceKeys.length;
          const rowUnits = getRowUnitsSummary(row);
          const rowMainUnitLabel = typeof rowUnits.main === 'string' ? rowUnits.main : '';
          const rowSubUnitLabel = typeof rowUnits.sub === 'string' ? rowUnits.sub : '';

          const relationProductOptions = (productOptions.length ? productOptions : (relationOptions['products'] || []))
            .map((item: any) => ({
              label: String(item?.label || item?.value || ''),
              value: String(item?.value || ''),
              category: item?.category || null,
            }))
            .filter((item: any) => !!item.value);

          const existingTargetRows = sourceData
            .map((gridRow: any, idx: number) => {
              const targetRowKey = getRowKeyValue(gridRow, idx);
              const productId = gridRow?.header?.selected_product_id ? String(gridRow.header.selected_product_id) : '';
              if (!productId) return null;
              if (!matchesCategory(gridRow?.header?.category, categoryValue)) return null;
              const productLabel = relationProductOptions.find((item: any) => item.value === productId)?.label
                || gridRow?.header?.selected_product_name
                || productId;
              return {
                value: targetRowKey,
                label: productLabel,
              };
            })
            .filter(Boolean) as Array<{ value: string; label: string }>;

          const buildTransferPopoverContent = (action: 'copy' | 'move') => (
            <div className="w-[92vw] sm:w-[360px] max-w-[92vw] space-y-3">
              <div className="text-xs text-gray-600">به قطعات کدام محصول اضافه شود؟</div>
              <Select
                placeholder="انتخاب از محصولات موجود"
                value={transferTargetMode === 'existing' ? transferTargetRowKey : null}
                options={existingTargetRows}
                disabled={transferTargetMode !== 'existing'}
                onChange={(val) => {
                  setTransferTargetMode('existing');
                  setTransferTargetRowKey(val || null);
                }}
                className="w-full"
                showSearch
                optionFilterProp="label"
                getPopupContainer={() => document.body}
              />
              <div className="text-xs text-gray-500">یا</div>
              <Radio.Group
                value={transferTargetMode}
                onChange={(e) => setTransferTargetMode(e.target.value)}
                className="flex flex-col gap-2"
              >
                <Radio value="existing">استفاده از محصولات موجود</Radio>
                <Radio value="new">استفاده از محصول جدید</Radio>
              </Radio.Group>
              {transferTargetMode === 'new' && (
                <div className="flex items-start gap-2">
                  <Select
                    placeholder="انتخاب محصول جدید"
                    value={transferTargetProductId}
                    options={transferProductOptions}
                    onChange={(val) => setTransferTargetProductId(val || null)}
                    className="flex-1 min-w-0"
                    showSearch
                    filterOption={false}
                    onSearch={(value) => {
                      void loadTransferProductOptions(categoryValue, value);
                    }}
                    loading={transferProductOptionsLoading}
                    notFoundContent={transferProductOptionsLoading ? <Spin size="small" /> : undefined}
                    getPopupContainer={() => document.body}
                    onDropdownVisibleChange={(open) => {
                      if (open) {
                        void loadTransferProductOptions(categoryValue);
                      }
                    }}
                  />
                  <QrScanPopover
                    label=""
                    buttonClassName="shrink-0"
                    onScan={async (scan) => {
                      if (!scan.recordId || scan.moduleId !== 'products') return;
                      try {
                        const product = await fetchProductById(scan.recordId);
                        if (!matchesCategory(product?.category, categoryValue)) {
                          message.warning('محصول اسکن‌شده با دسته‌بندی این جدول همخوانی ندارد.');
                          return;
                        }
                        setTransferTargetProductId(String(product.id));
                        setTransferProductOptions((prev) => {
                          const next = [...prev];
                          if (!next.find((item) => item.value === String(product.id))) {
                            next.unshift({
                              value: String(product.id),
                              label: product.system_code ? `${product.system_code} - ${product.name}` : product.name,
                              category: product.category || null,
                            });
                          }
                          return next;
                        });
                      } catch (err) {
                        console.warn('Could not apply scanned product', err);
                        message.error('خطا در انتخاب محصول');
                      }
                    }}
                    buttonProps={{ size: 'small' }}
                  />
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-1">
                <Button size="small" onClick={closePieceActionPopover}>انصراف</Button>
                <Button size="small" type="primary" onClick={() => applyPieceTransfer(rowIndex, action)}>
                  {action === 'copy' ? 'کپی' : 'جابجایی'}
                </Button>
              </div>
            </div>
          );

          const specCategories = specFields
            .map((f: any) => f.dynamicOptionsCategory)
            .filter(Boolean) as string[];
          if (specCategories.length > 0) {
            ensureDynamicOptions(specCategories);
          }

          return (
            <div key={row.key || rowIndex} className="border border-[#8b5e3c] rounded-2xl overflow-hidden">
              <div
                id={`grid-row-${row.key || rowIndex}`}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-white"
                style={rowHeaderBarStyle}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Button
                    type="text"
                    size="small"
                    className="p-0 !text-white hover:!text-white/90"
                    onClick={() => {
                      const nextCollapsed = !collapsed;
                      updateRow(rowIndex, { collapsed: nextCollapsed });
                      if (!nextCollapsed) {
                        setTimeout(() => {
                          const el = document.getElementById(`grid-row-${row.key || rowIndex}`);
                          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 80);
                      }
                    }}
                    icon={<RightOutlined className={`transition-transform text-white ${collapsed ? '' : 'rotate-90'}`} />}
                  />
                  <span className="text-xs text-white">دسته‌بندی مواد اولیه</span>
                  {rowCanEdit ? (
                    <Select
                      value={categoryValue}
                      onChange={(val) => updateRow(rowIndex, { header: { ...row.header, category: val }, specs: {}, pieces: [{ key: createPieceKey(), ...defaultPiece() }], collapsed: false })}
                      options={categories.map((c) => ({ label: c.label, value: c.value }))}
                      placeholder="انتخاب کنید"
                      className="min-w-[160px]"
                      getPopupContainer={() => document.body}
                      dropdownStyle={{ zIndex: 10050 }}
                    />
                  ) : (
                    <span className="min-w-[160px] text-xs text-white font-black truncate">
                      {categories.find((c) => c.value === categoryValue)?.label || '-'}
                    </span>
                  )}
                  {isProductionOrder && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                      {(() => {
                        const selectedId = row.header?.selected_product_id || null;
                        const selectedName = row.header?.selected_product_name || null;
                        const rawOptions = (productOptions.length ? productOptions : (relationOptions['products'] || []));
                        const selectedFromRaw = selectedId
                          ? rawOptions.find((o: any) => o.value === selectedId)
                          : null;
                        const filteredOptions = rawOptions
                          .filter((o: any) => {
                            if (o.product_type && o.product_type !== 'raw') return false;
                            if (categoryValue && o.category && o.category !== categoryValue) {
                              if (selectedId && o.value === selectedId) return true;
                              return false;
                            }
                            return true;
                          })
                          .map((o: any) => ({ label: o.label, value: o.value }));
                        const hasSelected = selectedId && filteredOptions.some((o: any) => o.value === selectedId);
                        if (selectedId && !hasSelected) {
                          filteredOptions.unshift({
                            value: selectedId,
                            label: selectedName || selectedFromRaw?.label || String(selectedId),
                          });
                        }
                        if (!rowCanEdit) {
                          return (
                            <span className="min-w-[200px] w-full sm:w-auto text-xs text-white font-black truncate">
                              {selectedFromRaw?.label || selectedName || '-'}
                            </span>
                          );
                        }
                        return (
                      <Select
                        value={row.header?.selected_product_id || null}
                        placeholder="انتخاب محصول"
                        className="min-w-[200px] w-full sm:w-auto"
                        showSearch
                        optionFilterProp="label"
                        options={filteredOptions}
                        loading={productOptionsLoading}
                        onDropdownVisibleChange={(open) => {
                          if (open && productOptions.length === 0) loadProductOptions();
                        }}
                        onChange={(val) => applySelectedProduct(rowIndex, val)}
                        disabled={!rowCanEdit}
                        getPopupContainer={() => document.body}
                        dropdownStyle={{ zIndex: 10050 }}
                      />
                        );
                      })()}
                      {rowCanEdit && (
                        <QrScanPopover
                          label=""
                          buttonClassName="shrink-0 !text-white hover:!text-white/90"
                          onScan={async (scan) => {
                            if (scan.recordId && scan.moduleId === 'products') {
                              await applySelectedProduct(rowIndex, scan.recordId);
                            }
                          }}
                          buttonProps={{ type: 'text', size: 'small' }}
                        />
                      )}
                      {rowCanEdit && row.header?.selected_product_id && (
                        <Button
                          type="text"
                          size="small"
                          icon={<CloseCircleOutlined />}
                          onClick={() => applySelectedProduct(rowIndex, null)}
                          className="!text-white hover:!text-white/90"
                        />
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {mode === 'db' && !isReadOnly && (
                    isRowEditing ? (
                      <>
                        <Button
                          type="text"
                          size="small"
                          className="p-0 !text-white hover:!text-white/90"
                          icon={<CopyOutlined />}
                          disabled={saving}
                          onClick={() => duplicateGridRow(rowIndex, rowKey)}
                        />
                        <Button
                          type="text"
                          size="small"
                          className="p-0 !text-white hover:!text-white/90"
                          icon={<DeleteOutlined />}
                          disabled={saving}
                          onClick={() => confirmRemoveGridRow(rowIndex)}
                        />
                        <Button
                          type="text"
                          size="small"
                          className="p-0 !text-white hover:!text-white/90"
                          icon={<SaveOutlined />}
                          loading={saving}
                          onClick={handleSave}
                        />
                        <Button
                          type="text"
                          size="small"
                          className="p-0 !text-white hover:!text-white/90"
                          icon={<CloseOutlined />}
                          disabled={saving}
                          onClick={cancelEditRow}
                        />
                      </>
                    ) : (
                      <>
                        <Button
                          type="text"
                          size="small"
                          className="p-0 !text-white hover:!text-white/90"
                          icon={<EditOutlined />}
                          disabled={saving || (!!activeEditRowKey && activeEditRowKey !== rowKey)}
                          onClick={() => startEditRow(rowKey)}
                        />
                        <Button
                          type="text"
                          size="small"
                          className="p-0 !text-white hover:!text-white/90"
                          icon={<DeleteOutlined />}
                          disabled={saving}
                          onClick={() => confirmRemoveGridRow(rowIndex)}
                        />
                        <Button
                          type="text"
                          size="small"
                          className="p-0 !text-white hover:!text-white/90"
                          icon={<CopyOutlined />}
                          disabled={saving || (!!activeEditRowKey && activeEditRowKey !== rowKey)}
                          onClick={() => duplicateGridRow(rowIndex, rowKey)}
                        />
                      </>
                    )
                  )}
                  {mode !== 'db' && !isReadOnly && (
                    <>
                      <Button
                        type="text"
                        size="small"
                        className="p-0 !text-white hover:!text-white/90"
                        icon={<DeleteOutlined />}
                        disabled={saving}
                        onClick={() => confirmRemoveGridRow(rowIndex)}
                      />
                      <Button
                        type="text"
                        size="small"
                        className="p-0 !text-white hover:!text-white/90"
                        icon={<CopyOutlined />}
                        disabled={saving}
                        onClick={() => duplicateGridRow(rowIndex, rowKey)}
                      />
                    </>
                  )}
                </div>
              </div>

              {!collapsed && (
                <div className="p-4 space-y-4">
                  {shouldShowSpecs && specFields.length > 0 && (
                    <>
                      {isSpecsLocked && (
                        <div className="flex items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <LockOutlined />
                          <span>مشخصات از روی محصول انتخاب‌شده قفل شده‌اند. برای ویرایش، محصول را حذف کنید.</span>
                        </div>
                      )}
                      <div
                        className="grid grid-cols-1 md:[grid-template-columns:repeat(var(--spec-count),minmax(0,1fr))] gap-3"
                        style={{ ['--spec-count' as any]: Math.max(specFields.length, 1) }}
                      >
                        {specFields.map((field: any) => {
                          if (canViewField && canViewField(field.key) === false) return null;
                          let options = field.options;
                          if (field.dynamicOptionsCategory) {
                            options = dynamicOptions[field.dynamicOptionsCategory] || localDynamicOptions[field.dynamicOptionsCategory];
                          }
                          const effectiveField = (isSpecsLocked || !rowCanEdit) ? { ...field, readonly: true } : field;
                          return (
                            <div key={field.key} className={`space-y-1 min-w-0 ${isSpecsLocked ? 'opacity-75' : ''}`}>
                              <div className="text-[11px] text-gray-500 font-medium">{field.labels?.fa}</div>
                              <SmartFieldRenderer
                                field={effectiveField}
                                value={row.specs?.[field.key]}
                                forceEditMode={true}
                                compactMode={true}
                                options={options}
                                onChange={(val) => {
                                  if (isSpecsLocked || !rowCanEdit) return;
                                  updateRow(rowIndex, { specs: { ...(row.specs || {}), [field.key]: val } });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {isProductionOrder && !row.header?.selected_product_id && rowCanEdit && (
                    <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-3 bg-white dark:bg-[#141414]">
                      <div className="text-xs text-gray-500 mb-2">لیست محصولات مرتبط</div>
                      <ProductsPreview
                        row={row}
                        relationOptions={relationOptions}
                        dynamicOptions={{ ...dynamicOptions, ...localDynamicOptions }}
                        specFields={specFields}
                        fetchFilteredProducts={fetchFilteredProducts}
                        onSelect={(productId) => applySelectedProduct(rowIndex, productId)}
                      />
                    </div>
                  )}

                  {rowCanEdit && selectedPieceCount > 0 && (
                    <div className="flex items-center justify-end gap-1 text-xs border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1 bg-gray-50 dark:bg-[#111]">
                      <span className="text-gray-500 ml-1">{toPersianNumber(selectedPieceCount)} مورد انتخاب شد</span>
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        danger
                        onClick={() => deleteSelectedPieces(rowIndex)}
                      />
                      <Popover
                        trigger="click"
                        placement="bottom"
                        getPopupContainer={() => document.body}
                        open={pieceActionPopover?.rowKey === rowKey && pieceActionPopover?.action === 'move'}
                        onOpenChange={(open) => {
                          if (open) {
                            setPieceActionPopover({ rowKey, action: 'move' });
                            setTransferTargetMode('existing');
                            setTransferTargetRowKey(existingTargetRows[0]?.value || null);
                            setTransferTargetProductId(null);
                            void loadTransferProductOptions(categoryValue);
                          } else {
                            closePieceActionPopover();
                          }
                        }}
                        content={buildTransferPopoverContent('move')}
                      >
                        <Button type="text" size="small" icon={<SwapOutlined />} />
                      </Popover>
                      <Popover
                        trigger="click"
                        placement="bottom"
                        getPopupContainer={() => document.body}
                        open={pieceActionPopover?.rowKey === rowKey && pieceActionPopover?.action === 'copy'}
                        onOpenChange={(open) => {
                          if (open) {
                            setPieceActionPopover({ rowKey, action: 'copy' });
                            setTransferTargetMode('existing');
                            setTransferTargetRowKey(existingTargetRows[0]?.value || null);
                            setTransferTargetProductId(null);
                            void loadTransferProductOptions(categoryValue);
                          } else {
                            closePieceActionPopover();
                          }
                        }}
                        content={buildTransferPopoverContent('copy')}
                      >
                        <Button type="text" size="small" icon={<CopyOutlined />} />
                      </Popover>
                    </div>
                  )}

                  <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
                    <Table
                      dataSource={row.pieces || []}
                      rowKey={(record: any, idx?: number) => record.key || idx}
                      pagination={false}
                      size="small"
                      className="custom-erp-table"
                      scroll={{ x: true }}
                      columns={[
                        {
                          title: 'نام قطعه',
                          dataIndex: 'name',
                          key: 'name',
                          width: 220,
                          render: (val: any, _record: any, pieceIndex: number) => (
                            rowCanEdit ? (
                              <Input className="font-medium" style={{ minWidth: 170 }} value={val} onChange={(e) => updatePiece(rowIndex, pieceIndex, { name: e.target.value })} />
                            ) : (
                              <Text className="font-medium whitespace-nowrap inline-block">{val || '-'}</Text>
                            )
                          ),
                        },
                        {
                          title: 'طول',
                          dataIndex: 'length',
                          key: 'length',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            rowCanEdit
                              ? (
                                <InputNumber
                                  className="font-medium persian-number"
                                  value={val}
                                  onChange={(v) => updatePiece(rowIndex, pieceIndex, { length: v })}
                                  formatter={(v) => formatGroupedInput(v)}
                                  parser={(v) => parseNumberInput(v)}
                                />
                              )
                              : <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>
                          ),
                        },
                        {
                          title: 'عرض',
                          dataIndex: 'width',
                          key: 'width',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            rowCanEdit
                              ? (
                                <InputNumber
                                  className="font-medium persian-number"
                                  value={val}
                                  onChange={(v) => updatePiece(rowIndex, pieceIndex, { width: v })}
                                  formatter={(v) => formatGroupedInput(v)}
                                  parser={(v) => parseNumberInput(v)}
                                />
                              )
                              : <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>
                          ),
                        },
                        {
                          title: 'تعداد',
                          dataIndex: 'quantity',
                          key: 'quantity',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            rowCanEdit
                              ? (
                                <InputNumber
                                  className="font-medium persian-number"
                                  value={val}
                                  onChange={(v) => updatePiece(rowIndex, pieceIndex, { quantity: v })}
                                  formatter={(v) => formatGroupedInput(v)}
                                  parser={(v) => parseNumberInput(v)}
                                />
                              )
                              : <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>
                          ),
                        },
                        {
                          title: 'نرخ پرت',
                          dataIndex: 'waste_rate',
                          key: 'waste_rate',
                          width: 90,
                          render: (val: any, _record: any, pieceIndex: number) => (
                            rowCanEdit
                              ? (
                                <InputNumber
                                  className="font-medium persian-number"
                                  value={val}
                                  onChange={(v) => updatePiece(rowIndex, pieceIndex, { waste_rate: v })}
                                  formatter={(v) => formatGroupedInput(v)}
                                  parser={(v) => parseNumberInput(v)}
                                />
                              )
                              : <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>
                          ),
                        },
                        {
                          title: 'واحد اصلی',
                          dataIndex: 'main_unit',
                          key: 'main_unit',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            rowCanEdit ? (
                              <Select
                                value={val}
                                options={unitOptions}
                                onChange={(v) => updatePiece(rowIndex, pieceIndex, { main_unit: v })}
                                onBlur={() => updatePiece(rowIndex, pieceIndex, {})}
                                style={{ minWidth: 120 }}
                                getPopupContainer={() => document.body}
                                dropdownStyle={{ zIndex: 10050 }}
                              />
                            ) : (
                              <Text className="font-medium whitespace-nowrap inline-block">{val || '-'}</Text>
                            )
                          ),
                        },
                        {
                          title: 'واحد فرعی',
                          dataIndex: 'sub_unit',
                          key: 'sub_unit',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            rowCanEdit ? (
                              <Select
                                value={val}
                                options={unitOptions}
                                onChange={(v) => updatePiece(rowIndex, pieceIndex, { sub_unit: v })}
                                onBlur={() => updatePiece(rowIndex, pieceIndex, {})}
                                style={{ minWidth: 120 }}
                                getPopupContainer={() => document.body}
                                dropdownStyle={{ zIndex: 10050 }}
                              />
                            ) : (
                              <Text className="font-medium whitespace-nowrap inline-block">{val || '-'}</Text>
                            )
                          ),
                        },
                        {
                          title: 'مقدار واحد اصلی',
                          dataIndex: 'qty_main',
                          key: 'qty_main',
                          width: 130,
                          render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>,
                        },
                        {
                          title: 'مقدار واحد فرعی',
                          dataIndex: 'qty_sub',
                          key: 'qty_sub',
                          width: 130,
                          render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>,
                        },
                        ...(!shouldHideFormulaColumn ? [{
                          title: 'فرمول',
                          dataIndex: 'formula_id',
                          key: 'formula_id',
                          render: (val: any, _record: any, pieceIndex: number) => (
                            rowCanEdit ? (
                              <Select
                                value={val}
                                options={dynamicOptions['calculation_formulas'] || []}
                                onChange={(v) => updatePiece(rowIndex, pieceIndex, { formula_id: v })}
                                style={{ minWidth: 150 }}
                                getPopupContainer={() => document.body}
                                dropdownStyle={{ zIndex: 10050 }}
                              />
                            ) : (
                              <Text className="font-medium whitespace-nowrap inline-block">
                                {getSingleOptionLabel(
                                  { key: 'formula_id', type: FieldType.SELECT, options: dynamicOptions['calculation_formulas'] || [] } as any,
                                  val,
                                  dynamicOptions,
                                  relationOptions
                                ) || '-'}
                              </Text>
                            )
                          ),
                        }] : []),
                        {
                          title: 'مقدار مصرف یک تولید',
                          dataIndex: 'final_usage',
                          key: 'final_usage',
                          width: 140,
                          render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>,
                        },
                        ...(isProductionOrder ? [
                          {
                            title: 'قیمت واحد',
                            dataIndex: 'unit_price',
                            key: 'unit_price',
                            render: (val: any, _record: any, pieceIndex: number) => (
                              rowCanEdit
                                ? (
                                  <InputNumber
                                    className="font-medium persian-number"
                                    value={val}
                                    onChange={(v) => updatePiece(rowIndex, pieceIndex, { unit_price: v })}
                                    formatter={(v) => formatGroupedInput(v)}
                                    parser={(v) => parseNumberInput(v)}
                                  />
                                )
                                : <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatPersianPrice(val || 0, true)}</Text>
                            ),
                          },
                          {
                            title: 'هزینه هر عدد',
                            dataIndex: 'cost_per_item',
                            key: 'cost_per_item',
                            width: 150,
                            render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatPersianPrice(val || 0, true)}</Text>,
                          },
                          {
                            title: 'مقدار مصرف کل',
                            dataIndex: 'total_usage',
                            key: 'total_usage',
                            width: 140,
                            render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatQuantity(val)}</Text>,
                          },
                          ...(showDeliveredQtyColumn ? [{
                            title: 'مقدار مصرف تحویل شده کل',
                            dataIndex: 'delivered_qty',
                            key: 'delivered_qty',
                            width: 140,
                            render: (val: any) => {
                              const orderQty = toNumber(orderQuantity);
                              const deliveredPerItem = toNumber(val);
                              const deliveredTotal = orderQty > 0 ? deliveredPerItem * orderQty : deliveredPerItem;
                              return (
                                <Text className="persian-number font-medium whitespace-nowrap inline-block">
                                  {formatQuantity(deliveredTotal)}
                                </Text>
                              );
                            },
                          }] : []),
                          {
                            title: 'هزینه کل',
                            dataIndex: 'total_cost',
                            key: 'total_cost',
                            width: 150,
                            render: (val: any) => <Text className="persian-number font-medium whitespace-nowrap inline-block">{formatPersianPrice(val || 0, true)}</Text>,
                          },
                        ] : []),
                        ...(rowCanEdit ? [
                          {
                            title: '',
                            key: 'select',
                            width: 56,
                            fixed: 'right' as const,
                            render: (_val: any, record: any, pieceIndex: number) => {
                              const pieceKey = String(record?.key || pieceIndex);
                              return (
                                <Checkbox
                                  checked={selectedPieceKeys.includes(pieceKey)}
                                  onChange={(e) => togglePieceSelected(rowKey, pieceKey, e.target.checked)}
                                />
                              );
                            },
                          },
                        ] : []),
                      ]}
                      footer={rowCanEdit ? () => (
                        <Button type="dashed" block icon={<PlusOutlined />} onClick={() => addPiece(rowIndex)}>
                          افزودن قطعه {categories.find((c) => c.value === categoryValue)?.label || ''}
                        </Button>
                      ) : undefined}
                    />
                  </div>

                  <div className="bg-gray-50 dark:bg-[#101010] rounded-xl p-3 flex flex-wrap gap-4 text-xs border border-leather-500">
                    <span>جمع تعداد در یک تولید: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_quantity || 0)}</Text></span>
                    <span>جمع واحد اصلی: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_qty_main || 0)}</Text>{rowMainUnitLabel ? <Text className="font-medium mr-1">{rowMainUnitLabel}</Text> : null}</span>
                    <span>جمع واحد فرعی: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_qty_sub || 0)}</Text>{rowSubUnitLabel ? <Text className="font-medium mr-1">{rowSubUnitLabel}</Text> : null}</span>
                    <span>جمع مصرف یک تولید: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_final_usage || 0)}</Text>{rowMainUnitLabel ? <Text className="font-medium mr-1">{rowMainUnitLabel}</Text> : null}</span>
                    {isProductionOrder && (
                      <span>جمع مقدار مصرف کل: <Text className="persian-number font-medium">{formatQuantity(row.totals?.total_usage || 0)}</Text>{rowMainUnitLabel ? <Text className="font-medium mr-1">{rowMainUnitLabel}</Text> : null}</span>
                    )}
                    {isProductionOrder && (
                      <span>جمع هزینه: <Text className="persian-number font-medium">{formatPersianPrice(row.totals?.total_cost || 0, true)}</Text></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(!isReadOnly && (mode === 'local' || (mode === 'db' && !!activeEditRowKey))) && (
        <div className="mt-4">
          <Button type="dashed" block icon={<PlusOutlined />} onClick={addGridRow}>
            افزودن گروه جدید
          </Button>
        </div>
      )}
    </div>
  );
};

const ProductsPreview: React.FC<{
  row: any;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  specFields: any[];
  fetchFilteredProducts: (row: any) => Promise<any[]>;
  onSelect: (productId: string) => void;
}> = ({ row, fetchFilteredProducts, onSelect, specFields, dynamicOptions }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const result = await fetchFilteredProducts(row);
        if (!active) return;
        setRows(result || []);
      } catch {
        if (!active) return;
        setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [row, dynamicOptions]);

  if (loading) return <div className="py-4 text-center"><Spin size="small" /></div>;

  if (!rows.length) return <div className="text-xs text-gray-400">محصولی یافت نشد</div>;

  const renderSpecValue = (field: any, value: any) => {
    if (value === undefined || value === null || value === '') return '-';
    if (field.type === FieldType.MULTI_SELECT && Array.isArray(value)) {
      return value
        .map((val: any) => getSingleOptionLabel(field, val, dynamicOptions, {}))
        .filter(Boolean)
        .join('، ') || '-';
    }
    if (field.type === FieldType.SELECT || field.type === FieldType.RELATION) {
      return getSingleOptionLabel(field, value, dynamicOptions, {}) || '-';
    }
    return Array.isArray(value) ? value.join('، ') : value;
  };

  const specColumns = (specFields || []).map((field: any) => ({
    title: field.labels?.fa || field.key,
    dataIndex: field.key,
    key: field.key,
    responsive: ['md'] as ResponsiveBreakpoint[],
    render: (val: any) => renderSpecValue(field, val)
  }));

  return (
    <Table
      dataSource={rows}
      rowKey="id"
      pagination={{ pageSize: 5, size: 'small' }}
      size="small"
      rowSelection={{
        type: 'radio',
        onChange: (_keys, selectedRows) => {
          const selected = selectedRows?.[0];
          if (selected?.id) onSelect(selected.id);
        }
      }}
      columns={[
        { title: 'نام محصول', dataIndex: 'name', key: 'name', ellipsis: true },
        { title: 'کد سیستمی', dataIndex: 'system_code', key: 'system_code', responsive: ['sm'] as ResponsiveBreakpoint[] },
        ...specColumns,
        { title: 'موجودی', dataIndex: 'stock', key: 'stock', responsive: ['md'] as ResponsiveBreakpoint[], render: (val: any) => toPersianNumber(val ?? 0) },
        { title: 'قیمت خرید', dataIndex: 'buy_price', key: 'buy_price', responsive: ['md'] as ResponsiveBreakpoint[], render: (val: any) => formatPersianPrice(val ?? 0, true) },
        { title: 'قیمت فروش', dataIndex: 'sell_price', key: 'sell_price', responsive: ['md'] as ResponsiveBreakpoint[], render: (val: any) => formatPersianPrice(val ?? 0, true) },
      ]}
      scroll={{ x: 'max-content' }}
    />
  );
};

export default GridTable;
