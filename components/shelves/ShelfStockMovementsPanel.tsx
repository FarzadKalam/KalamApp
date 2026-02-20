import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Form, Space, Spin, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { FieldType, type ModuleField } from '../../types';
import { supabase } from '../../supabaseClient';
import SmartTableRenderer from '../SmartTableRenderer';
import { RelationQuickCreateInline } from '../SmartFieldRenderer';
import { applyInventoryDeltas, syncMultipleProductsStock } from '../../utils/inventoryTransactions';
import { convertArea } from '../../utils/unitConversions';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { insertChangelog } from '../editableTable/changelogHelpers';

interface ShelfStockMovementsPanelProps {
  block: any;
  recordId: string;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  canEditModule?: boolean;
  openQuickAddSignal?: number;
}

interface ProductMeta {
  id: string;
  name: string;
  systemCode: string;
  mainUnit: string | null;
  subUnit: string | null;
}

const ALLOWED_MANUAL_SOURCES = new Set(['opening_balance', 'inventory_count', 'waste']);

const toQty = (value: any) => Math.abs(parseFloat(value) || 0);

const ShelfStockMovementsPanel: React.FC<ShelfStockMovementsPanelProps> = ({
  block,
  recordId,
  relationOptions,
  dynamicOptions,
  canEditModule = true,
  openQuickAddSignal = 0,
}) => {
  const { message: msg, modal } = App.useApp();
  const messageRef = useRef(msg);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [productMetaMap, setProductMetaMap] = useState<Record<string, ProductMeta>>({});
  const productMetaMapRef = useRef<Record<string, ProductMeta>>({});
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [actionRowLoadingId, setActionRowLoadingId] = useState<string | null>(null);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [quickCreateForm] = Form.useForm();

  const voucherType = Form.useWatch('voucher_type', quickCreateForm);
  const source = Form.useWatch('source', quickCreateForm);
  const selectedProductId = Form.useWatch('product_id', quickCreateForm);
  const mainQuantity = Form.useWatch('main_quantity', quickCreateForm);
  const mainUnit = Form.useWatch('main_unit', quickCreateForm);
  const subUnit = Form.useWatch('sub_unit', quickCreateForm);

  useEffect(() => {
    messageRef.current = msg;
  }, [msg]);

  useEffect(() => {
    productMetaMapRef.current = productMetaMap;
  }, [productMetaMap]);

  const getRelationOptions = useCallback(
    (key: string, targetModule?: string) => {
      const specificKey = `${block.id}_${key}`;
      if (Array.isArray(relationOptions[specificKey])) return relationOptions[specificKey];
      if (Array.isArray(relationOptions[key])) return relationOptions[key];
      if (targetModule && Array.isArray(relationOptions[targetModule])) return relationOptions[targetModule];
      return [];
    },
    [block.id, relationOptions]
  );

  const fetchProductMeta = useCallback(async (productId: string) => {
    if (!productId) return null;
    const current = productMetaMapRef.current[productId];
    if (current) return current;

    const { data, error } = await supabase
      .from('products')
      .select('id, name, system_code, main_unit, sub_unit')
      .eq('id', productId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return null;

    const meta: ProductMeta = {
      id: String(data.id),
      name: String(data.name || data.id),
      systemCode: String(data.system_code || ''),
      mainUnit: data.main_unit || null,
      subUnit: data.sub_unit || null,
    };

    setProductMetaMap((prev) => ({ ...prev, [meta.id]: meta }));
    return meta;
  }, []);

  const loadRows = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    try {
      const { data: transferRows, error: transferError } = await supabase
        .from('stock_transfers')
        .select('id, transfer_type, product_id, delivered_qty, required_qty, invoice_id, production_order_id, from_shelf_id, to_shelf_id, sender_id, receiver_id, created_at')
        .or(`from_shelf_id.eq.${recordId},to_shelf_id.eq.${recordId}`)
        .order('created_at', { ascending: true });
      if (transferError) throw transferError;

      const userIds = Array.from(
        new Set((transferRows || []).flatMap((row: any) => [row?.sender_id, row?.receiver_id]).filter(Boolean))
      );
      const productIds = Array.from(
        new Set((transferRows || []).map((row: any) => row?.product_id).filter(Boolean))
      );

      let userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        userMap = new Map((profiles || []).map((item: any) => [String(item.id), item.full_name || String(item.id)]));
      }

      let productsMap = new Map<string, ProductMeta>();
      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name, system_code, main_unit, sub_unit')
          .in('id', productIds);
        productsMap = new Map(
          (products || []).map((item: any) => [
            String(item.id),
            {
              id: String(item.id),
              name: String(item.name || item.id),
              systemCode: String(item.system_code || ''),
              mainUnit: item.main_unit || null,
              subUnit: item.sub_unit || null,
            } as ProductMeta,
          ])
        );
      }

      if (productsMap.size > 0) {
        setProductMetaMap((prev) => {
          const next = { ...prev };
          productsMap.forEach((meta, key) => {
            next[key] = meta;
          });
          return next;
        });
      }

      const mappedRows = (transferRows || []).map((row: any, index: number) => {
        const productId = row?.product_id ? String(row.product_id) : null;
        const productMeta = productId ? productsMap.get(productId) : null;
        const transferType = String(row?.transfer_type || '').trim() || 'inventory_count';
        const fromShelf = row?.from_shelf_id ? String(row.from_shelf_id) : null;
        const toShelf = row?.to_shelf_id ? String(row.to_shelf_id) : null;
        const derivedVoucherType = fromShelf && toShelf ? 'transfer' : toShelf ? 'incoming' : 'outgoing';
        const creatorId = row?.sender_id || row?.receiver_id || null;
        const isPurchaseSource = transferType === 'purchase_invoice';
        const autoSource = ['sales_invoice', 'purchase_invoice', 'production'].includes(transferType);
        const readonlyInboundTransfer = !!fromShelf && !!toShelf && fromShelf !== recordId && toShelf === recordId;
        return {
          id: row.id,
          key: row.id || `shelf_move_${index}`,
          product_id: productId,
          voucher_type: derivedVoucherType,
          source: transferType,
          main_unit: productMeta?.mainUnit || null,
          main_quantity: toQty(row?.delivered_qty),
          sub_unit: productMeta?.subUnit || null,
          sub_quantity: toQty(row?.required_qty),
          from_shelf_id: fromShelf,
          to_shelf_id: toShelf,
          invoice_id: isPurchaseSource ? null : (row?.invoice_id || null),
          purchase_invoice_id: isPurchaseSource ? (row?.invoice_id || null) : null,
          production_order_id: row?.production_order_id || null,
          created_by_name: creatorId ? (userMap.get(String(creatorId)) || String(creatorId)) : '-',
          created_at: row?.created_at || null,
          _readonly: autoSource || !!row?.invoice_id || !!row?.production_order_id || readonlyInboundTransfer,
        };
      });
      setRows(mappedRows);
    } catch (err) {
      console.error(err);
      messageRef.current.error('خطا در دریافت حواله‌های قفسه');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const productOptions = useMemo(() => {
    const map = new Map<string, { label: string; value: string }>();
    getRelationOptions('product_id', 'products').forEach((item: any) => {
      const value = String(item?.value || '');
      if (!value) return;
      map.set(value, { label: String(item?.label || value), value });
    });

    Object.values(productMetaMap).forEach((meta) => {
      const label = meta.systemCode ? `${meta.name} (${meta.systemCode})` : meta.name;
      map.set(meta.id, { label, value: meta.id });
    });

    return Array.from(map.values());
  }, [getRelationOptions, productMetaMap]);

  useEffect(() => {
    if (!quickCreateOpen) return;
    if (editingRow) {
      quickCreateForm.setFieldsValue({
        product_id: editingRow.product_id || null,
        voucher_type: editingRow.voucher_type || 'incoming',
        source: editingRow.source || 'opening_balance',
        main_unit: editingRow.main_unit || null,
        sub_unit: editingRow.sub_unit || null,
        main_quantity: editingRow.main_quantity || 0,
        sub_quantity: editingRow.sub_quantity || 0,
        from_shelf_id: editingRow.from_shelf_id || null,
        to_shelf_id: editingRow.to_shelf_id || null,
      });
      return;
    }
    quickCreateForm.setFieldsValue({
      product_id: null,
      voucher_type: 'incoming',
      source: 'opening_balance',
      main_unit: null,
      sub_unit: null,
      main_quantity: 0,
      sub_quantity: 0,
      from_shelf_id: null,
      to_shelf_id: recordId,
    });
  }, [editingRow, quickCreateForm, quickCreateOpen, recordId]);

  useEffect(() => {
    if (!openQuickAddSignal) return;
    setEditingRow(null);
    setQuickCreateOpen(true);
  }, [openQuickAddSignal]);

  useEffect(() => {
    if (!quickCreateOpen) return;

    const setIfChanged = (key: string, value: any) => {
      if (quickCreateForm.getFieldValue(key) !== value) {
        quickCreateForm.setFieldValue(key, value);
      }
    };

    const normalizedVoucher = source === 'waste' ? 'outgoing' : String(voucherType || 'incoming');
    if (source === 'waste' && voucherType !== 'outgoing') {
      setIfChanged('voucher_type', 'outgoing');
    }

    if (normalizedVoucher === 'incoming') {
      setIfChanged('from_shelf_id', null);
      setIfChanged('to_shelf_id', recordId);
    } else if (normalizedVoucher === 'outgoing') {
      setIfChanged('from_shelf_id', recordId);
      setIfChanged('to_shelf_id', null);
    } else if (normalizedVoucher === 'transfer') {
      setIfChanged('from_shelf_id', recordId);
      if (quickCreateForm.getFieldValue('to_shelf_id') === recordId) {
        setIfChanged('to_shelf_id', null);
      }
    }
  }, [quickCreateForm, quickCreateOpen, recordId, source, voucherType]);

  useEffect(() => {
    if (!quickCreateOpen) return;
    const productId = selectedProductId ? String(selectedProductId) : '';
    if (!productId) {
      quickCreateForm.setFieldValue('main_unit', null);
      quickCreateForm.setFieldValue('sub_unit', null);
      quickCreateForm.setFieldValue('sub_quantity', 0);
      return;
    }

    let cancelled = false;
    const syncUnits = async () => {
      try {
        const meta = productMetaMap[productId] || (await fetchProductMeta(productId));
        if (cancelled || !meta) return;
        quickCreateForm.setFieldValue('main_unit', meta.mainUnit || null);
        quickCreateForm.setFieldValue('sub_unit', meta.subUnit || null);
      } catch (err) {
        console.error(err);
      }
    };

    syncUnits();
    return () => {
      cancelled = true;
    };
  }, [fetchProductMeta, productMetaMap, quickCreateForm, quickCreateOpen, selectedProductId]);

  useEffect(() => {
    if (!quickCreateOpen) return;
    const qtyMain = toQty(mainQuantity);
    const converted = mainUnit && subUnit ? convertArea(qtyMain, mainUnit as any, subUnit as any) : 0;
    const nextValue = Number.isFinite(converted) ? converted : 0;
    if ((parseFloat(quickCreateForm.getFieldValue('sub_quantity')) || 0) !== nextValue) {
      quickCreateForm.setFieldValue('sub_quantity', nextValue);
    }
  }, [mainQuantity, mainUnit, quickCreateForm, quickCreateOpen, subUnit]);

  const displayFields = useMemo(() => {
    const baseFields = (block.tableColumns || []).map((col: any, index: number) => ({
      key: col.key,
      type: col.type,
      labels: { fa: col.title, en: col.key },
      options: col.options,
      relationConfig: col.relationConfig,
      dynamicOptionsCategory: col.dynamicOptionsCategory,
      isTableColumn: true,
      order: index + 1,
    })) as ModuleField[];

    if (canEditModule) {
      baseFields.push({
        key: 'row_actions',
        type: FieldType.TEXT,
        labels: { fa: 'عملیات', en: 'Actions' },
        isTableColumn: true,
        order: baseFields.length + 1,
      } as ModuleField);
    }
    return baseFields;
  }, [block.tableColumns, canEditModule]);

  const tableModuleConfig = useMemo(() => ({
    id: 'shelf_stock_movements_view',
    fields: displayFields,
  }) as any, [displayFields]);

  const tableRelationOptions = useMemo(() => {
    const next: Record<string, any[]> = { ...relationOptions, product_id: productOptions };
    (block.tableColumns || []).forEach((col: any) => {
      if (col.type !== FieldType.RELATION) return;
      if (col.key === 'product_id') return;
      next[col.key] = getRelationOptions(col.key, col.relationConfig?.targetModule);
    });
    return next;
  }, [block.tableColumns, getRelationOptions, productOptions, relationOptions]);

  const baseAddFields = useMemo(() => {
    const includeKeys = new Set([
      'product_id',
      'voucher_type',
      'source',
      'main_unit',
      'main_quantity',
      'sub_unit',
      'sub_quantity',
      'from_shelf_id',
      'to_shelf_id',
    ]);

    return displayFields
      .filter((field: any) => includeKeys.has(String(field.key || '')))
      .map((field: any) => {
        const next = { ...field } as ModuleField;
        if (field.key === 'source') {
          next.options = (field.options || []).filter((opt: any) =>
            ALLOWED_MANUAL_SOURCES.has(String(opt?.value || ''))
          );
        }
        if (['main_unit', 'sub_unit', 'sub_quantity', 'from_shelf_id'].includes(String(field.key))) {
          (next as any).readonly = true;
        }
        return next;
      });
  }, [displayFields]);

  const quickCreateFields = useMemo(() => {
    const currentType = String(voucherType || 'incoming');
    const shouldShowFromShelf = currentType === 'outgoing' || currentType === 'transfer';
    const shouldShowToShelf = currentType === 'incoming' || currentType === 'transfer';

    return baseAddFields
      .filter((field: any) => {
        if (field.key === 'from_shelf_id') return shouldShowFromShelf;
        if (field.key === 'to_shelf_id') return shouldShowToShelf;
        return true;
      })
      .map((field: any) => {
        const required = (
          field.key === 'product_id'
          || field.key === 'voucher_type'
          || field.key === 'source'
          || field.key === 'main_quantity'
          || (field.key === 'to_shelf_id' && shouldShowToShelf)
        );
        const readonly = (
          (field as any).readonly
          || field.key === 'from_shelf_id'
          || (field.key === 'to_shelf_id' && currentType === 'incoming')
        );
        return {
          ...field,
          readonly,
          validation: required ? { required: true } : undefined,
        } as ModuleField;
      });
  }, [baseAddFields, voucherType]);

  const addRelationOptions = useMemo(() => {
    const map: Record<string, any[]> = {};
    const shelfOptions = getRelationOptions('from_shelf_id', 'shelves');
    const currentShelf = shelfOptions.find((item: any) => String(item?.value || '') === String(recordId));
    const currentShelfOption = currentShelf
      ? [{ label: currentShelf.label, value: currentShelf.value }]
      : [{ label: 'قفسه جاری', value: recordId }];

    quickCreateFields.forEach((field: any) => {
      if (field.type !== FieldType.RELATION) return;
      if (field.key === 'product_id') {
        map[field.key] = productOptions;
        return;
      }
      if (field.key === 'from_shelf_id') {
        map[field.key] = currentShelfOption;
        return;
      }
      if (field.key === 'to_shelf_id') {
        if (String(voucherType || 'incoming') === 'incoming') {
          map[field.key] = currentShelfOption;
        } else {
          map[field.key] = shelfOptions.filter((item: any) => String(item?.value || '') !== String(recordId));
        }
        return;
      }
      map[field.key] = getRelationOptions(field.key, field.relationConfig?.targetModule);
    });

    return map;
  }, [getRelationOptions, productOptions, quickCreateFields, recordId, voucherType]);

  const totals = useMemo(() => {
    const incoming = rows.reduce((sum: number, row: any) => {
      const qty = toQty(row?.main_quantity);
      const type = String(row?.voucher_type || '');
      if (type === 'incoming' || type === 'transfer') return sum + qty;
      return sum;
    }, 0);
    const outgoing = rows.reduce((sum: number, row: any) => {
      const qty = toQty(row?.main_quantity);
      const type = String(row?.voucher_type || '');
      if (type === 'outgoing' || type === 'transfer') return sum + qty;
      return sum;
    }, 0);
    return { incoming, outgoing };
  }, [rows]);

  const buildDeltasFromPayload = (payload: {
    productId: string;
    voucherType: string;
    qtyMain: number;
    fromShelfId: string | null;
    toShelfId: string | null;
  }, multiplier = 1) => {
    const deltas: Array<{ productId: string; shelfId: string; delta: number }> = [];
    const qty = toQty(payload.qtyMain) * multiplier;
    if (!qty || !payload.productId) return deltas;

    if (payload.voucherType === 'incoming' && payload.toShelfId) {
      deltas.push({ productId: payload.productId, shelfId: payload.toShelfId, delta: qty });
    } else if (payload.voucherType === 'outgoing' && payload.fromShelfId) {
      deltas.push({ productId: payload.productId, shelfId: payload.fromShelfId, delta: -qty });
    } else if (payload.voucherType === 'transfer' && payload.fromShelfId && payload.toShelfId) {
      deltas.push({ productId: payload.productId, shelfId: payload.fromShelfId, delta: -qty });
      deltas.push({ productId: payload.productId, shelfId: payload.toShelfId, delta: qty });
    }
    return deltas;
  };

  const normalizeFormMovement = (values: any) => {
    const productId = values?.product_id ? String(values.product_id) : '';
    const transferType = String(values?.source || '');
    let voucher = String(values?.voucher_type || '');

    if (!productId) throw new Error('محصول انتخاب نشده است.');
    if (!voucher) throw new Error('نوع حواله انتخاب نشده است.');
    if (!transferType) throw new Error('منبع حواله انتخاب نشده است.');
    if (!ALLOWED_MANUAL_SOURCES.has(transferType)) {
      throw new Error('برای ثبت دستی فقط منابع موجودی اول دوره، انبارگردانی و ضایعات مجاز است.');
    }

    if (transferType === 'waste') voucher = 'outgoing';

    const qtyMain = toQty(values?.main_quantity);
    if (qtyMain <= 0) throw new Error('مقدار واحد اصلی باید بیشتر از صفر باشد.');
    const qtySub = toQty(values?.sub_quantity);

    let fromShelfId: string | null = null;
    let toShelfId: string | null = null;
    if (voucher === 'incoming') {
      toShelfId = recordId;
    } else if (voucher === 'outgoing') {
      fromShelfId = recordId;
    } else if (voucher === 'transfer') {
      fromShelfId = recordId;
      toShelfId = values?.to_shelf_id ? String(values.to_shelf_id) : null;
    }

    if (voucher === 'transfer') {
      if (!toShelfId) throw new Error('برای جابجایی، قفسه ورود الزامی است.');
      if (toShelfId === recordId) throw new Error('برای جابجایی، قفسه مقصد باید متفاوت از قفسه جاری باشد.');
    }

    return {
      productId,
      transferType,
      voucherType: voucher,
      qtyMain,
      qtySub,
      fromShelfId,
      toShelfId,
    };
  };

  const buildLogRow = (
    normalized: {
      productId: string;
      transferType: string;
      voucherType: string;
      qtyMain: number;
      qtySub: number;
      fromShelfId: string | null;
      toShelfId: string | null;
    },
    creatorId: string | null
  ) => {
    const meta = productMetaMap[normalized.productId];
    return {
      product_id: normalized.productId,
      voucher_type: normalized.voucherType,
      source: normalized.transferType,
      main_unit: meta?.mainUnit || null,
      main_quantity: normalized.qtyMain,
      sub_unit: meta?.subUnit || null,
      sub_quantity: normalized.qtySub,
      from_shelf_id: normalized.fromShelfId,
      to_shelf_id: normalized.toShelfId,
      invoice_id: null,
      purchase_invoice_id: null,
      production_order_id: null,
      created_by_name: creatorId,
      created_at: new Date().toISOString(),
    };
  };

  const handleSubmit = async () => {
    setQuickCreateLoading(true);
    try {
      const values = await quickCreateForm.validateFields();
      const normalized = normalizeFormMovement(values);

      const rollbackDeltas = editingRow
        ? buildDeltasFromPayload({
            productId: String(editingRow?.product_id || ''),
            voucherType: String(editingRow?.voucher_type || ''),
            qtyMain: toQty(editingRow?.main_quantity),
            fromShelfId: editingRow?.from_shelf_id ? String(editingRow.from_shelf_id) : null,
            toShelfId: editingRow?.to_shelf_id ? String(editingRow.to_shelf_id) : null,
          }, -1)
        : [];
      const nextDeltas = buildDeltasFromPayload(normalized, 1);

      if (rollbackDeltas.length || nextDeltas.length) {
        await applyInventoryDeltas(supabase as any, [...rollbackDeltas, ...nextDeltas]);
      }

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id || null;
      const payload = {
        product_id: normalized.productId,
        transfer_type: normalized.transferType,
        delivered_qty: normalized.qtyMain,
        required_qty: normalized.qtySub,
        invoice_id: null,
        production_order_id: null,
        from_shelf_id: normalized.fromShelfId,
        to_shelf_id: normalized.toShelfId,
        sender_id: currentUserId,
        receiver_id: currentUserId,
      };

      if (editingRow?.id) {
        const { error: updateError } = await supabase
          .from('stock_transfers')
          .update(payload)
          .eq('id', editingRow.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('stock_transfers').insert(payload);
        if (insertError) throw insertError;
      }

      await insertChangelog(
        supabase as any,
        'shelves',
        recordId,
        block,
        editingRow ? [editingRow] : [],
        [buildLogRow(normalized, currentUserId)]
      );

      const affectedProducts = new Set<string>([normalized.productId]);
      if (editingRow?.product_id) affectedProducts.add(String(editingRow.product_id));
      await syncMultipleProductsStock(supabase as any, Array.from(affectedProducts));

      await loadRows();
      setQuickCreateOpen(false);
      setEditingRow(null);
      quickCreateForm.resetFields();
      msg.success(editingRow ? 'حواله بروزرسانی شد' : 'حواله با موفقیت ثبت شد');
    } catch (err: any) {
      if (!Array.isArray(err?.errorFields)) {
        msg.error(err?.message || 'خطا در ثبت حواله');
      }
    } finally {
      setQuickCreateLoading(false);
    }
  };

  const handleEditRow = (row: any) => {
    if (!canEditModule || row?._readonly) return;
    setEditingRow(row);
    setQuickCreateOpen(true);
  };

  const handleDeleteRow = (row: any) => {
    if (!canEditModule || row?._readonly || !row?.id) return;
    modal.confirm({
      title: 'حذف حواله',
      content: 'این حواله حذف شود؟',
      okText: 'حذف',
      okType: 'danger',
      cancelText: 'انصراف',
      onOk: async () => {
        try {
          setActionRowLoadingId(String(row.id));
          const rollbackDeltas = buildDeltasFromPayload({
            productId: String(row?.product_id || ''),
            voucherType: String(row?.voucher_type || ''),
            qtyMain: toQty(row?.main_quantity),
            fromShelfId: row?.from_shelf_id ? String(row.from_shelf_id) : null,
            toShelfId: row?.to_shelf_id ? String(row.to_shelf_id) : null,
          }, -1);
          if (rollbackDeltas.length) {
            await applyInventoryDeltas(supabase as any, rollbackDeltas);
          }

          const { error: deleteError } = await supabase
            .from('stock_transfers')
            .delete()
            .eq('id', row.id);
          if (deleteError) throw deleteError;
          await insertChangelog(
            supabase as any,
            'shelves',
            recordId,
            block,
            [row],
            []
          );

          if (row?.product_id) {
            await syncMultipleProductsStock(supabase as any, [String(row.product_id)]);
          }
          await loadRows();
          msg.success('حواله حذف شد');
        } catch (err: any) {
          msg.error(err?.message || 'خطا در حذف حواله');
        } finally {
          setActionRowLoadingId(null);
        }
      },
    });
  };

  const tableRows = useMemo(() => {
    return rows.map((row: any) => ({
      ...row,
      row_actions: canEditModule ? (
        <Space size={4}>
          <Tooltip title={row?._readonly ? 'این ردیف سیستمی است' : 'ویرایش'}>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              disabled={!!row?._readonly || actionRowLoadingId === String(row?.id || '')}
              onClick={(e) => {
                e.stopPropagation();
                handleEditRow(row);
              }}
            />
          </Tooltip>
          <Tooltip title={row?._readonly ? 'این ردیف سیستمی است' : 'حذف'}>
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={actionRowLoadingId === String(row?.id || '')}
              disabled={!!row?._readonly}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteRow(row);
              }}
            />
          </Tooltip>
        </Space>
      ) : '-',
    }));
  }, [actionRowLoadingId, canEditModule, rows]);

  if (loading) {
    return <div className="p-10 text-center"><Spin /></div>;
  }

  return (
    <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 transition-all">
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <h3 className="font-bold text-base text-gray-700 dark:text-white m-0 flex items-center gap-2">
          <span className="w-1 h-5 bg-leather-500 rounded-full inline-block"></span>
          {block?.titles?.fa || 'ورود و خروج کالا'}
        </h3>
        {canEditModule && (
          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingRow(null);
              setQuickCreateOpen(true);
            }}
          >
            افزودن
          </Button>
        )}
      </div>

      <SmartTableRenderer
        moduleConfig={tableModuleConfig}
        data={tableRows}
        loading={false}
        relationOptions={tableRelationOptions}
        dynamicOptions={dynamicOptions}
        canViewField={(fieldKey) => fieldKey !== 'assignee_id'}
        disableScroll={false}
        tableLayout="auto"
        pagination={{ pageSize: 10, position: ['bottomCenter'], size: 'small' }}
      />

      <div className="mt-3 text-xs md:text-sm flex flex-wrap gap-4">
        <span>جمع ورود: <span className="text-green-600 persian-number">{toPersianNumber(totals.incoming)}</span></span>
        <span>جمع خروج: <span className="text-red-600 persian-number">{toPersianNumber(totals.outgoing)}</span></span>
      </div>

      <RelationQuickCreateInline
        open={quickCreateOpen}
        label={editingRow ? 'ویرایش حواله' : (block?.titles?.fa || 'ورود و خروج کالا')}
        fields={quickCreateFields}
        form={quickCreateForm}
        loading={quickCreateLoading}
        relationOptions={addRelationOptions}
        dynamicOptions={dynamicOptions}
        onCancel={() => {
          setQuickCreateOpen(false);
          setEditingRow(null);
          quickCreateForm.resetFields();
        }}
        onOk={handleSubmit}
      />
    </div>
  );
};

export default ShelfStockMovementsPanel;
