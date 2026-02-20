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

interface ProductStockMovementsPanelProps {
  block: any;
  recordId: string;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
  canEditModule?: boolean;
  onProductStockUpdated?: (stock: number) => void;
  openQuickAddSignal?: number;
}

const ALLOWED_MANUAL_SOURCES = new Set(['opening_balance', 'inventory_count', 'waste']);

const ProductStockMovementsPanel: React.FC<ProductStockMovementsPanelProps> = ({
  block,
  recordId,
  relationOptions,
  dynamicOptions,
  canEditModule = true,
  onProductStockUpdated,
  openQuickAddSignal = 0,
}) => {
  const { message: msg, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [productUnits, setProductUnits] = useState<{ mainUnit: string | null; subUnit: string | null }>({
    mainUnit: null,
    subUnit: null,
  });
  const [currentProductStock, setCurrentProductStock] = useState<number>(0);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [actionRowLoadingId, setActionRowLoadingId] = useState<string | null>(null);
  const onProductStockUpdatedRef = useRef(onProductStockUpdated);
  const messageRef = useRef(msg);

  useEffect(() => {
    onProductStockUpdatedRef.current = onProductStockUpdated;
  }, [onProductStockUpdated]);

  useEffect(() => {
    messageRef.current = msg;
  }, [msg]);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateLoading, setQuickCreateLoading] = useState(false);
  const [quickCreateForm] = Form.useForm();

  const voucherType = Form.useWatch('voucher_type', quickCreateForm);
  const source = Form.useWatch('source', quickCreateForm);
  const mainQuantity = Form.useWatch('main_quantity', quickCreateForm);
  const mainUnit = Form.useWatch('main_unit', quickCreateForm);
  const subUnit = Form.useWatch('sub_unit', quickCreateForm);

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

  const loadRows = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    try {
      const [{ data: productMeta }, { data: transferRows, error: transferError }] = await Promise.all([
        supabase
          .from('products')
          .select('main_unit, sub_unit, stock')
          .eq('id', recordId)
          .maybeSingle(),
        supabase
          .from('stock_transfers')
          .select('id, transfer_type, delivered_qty, required_qty, invoice_id, production_order_id, from_shelf_id, to_shelf_id, sender_id, receiver_id, created_at')
          .eq('product_id', recordId)
          .order('created_at', { ascending: true }),
      ]);
      if (transferError) throw transferError;

      const nextUnits = {
        mainUnit: productMeta?.main_unit || null,
        subUnit: productMeta?.sub_unit || null,
      };
      setProductUnits(nextUnits);
      const nextStock = parseFloat(productMeta?.stock) || 0;
      setCurrentProductStock(nextStock);
      if (onProductStockUpdatedRef.current) onProductStockUpdatedRef.current(nextStock);

      const userIds = Array.from(
        new Set((transferRows || []).flatMap((row: any) => [row?.sender_id, row?.receiver_id]).filter(Boolean))
      );
      let userMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        userMap = new Map((profiles || []).map((item: any) => [String(item.id), item.full_name || String(item.id)]));
      }

      const mappedRows = (transferRows || []).map((row: any, index: number) => {
        const transferType = String(row?.transfer_type || '').trim() || 'inventory_count';
        const fromShelf = row?.from_shelf_id ? String(row.from_shelf_id) : null;
        const toShelf = row?.to_shelf_id ? String(row.to_shelf_id) : null;
        const derivedVoucherType = fromShelf && toShelf ? 'transfer' : toShelf ? 'incoming' : 'outgoing';
        const creatorId = row?.sender_id || row?.receiver_id || null;
        const isPurchaseSource = transferType === 'purchase_invoice';
        const autoSource = ['sales_invoice', 'purchase_invoice', 'production'].includes(transferType);
        return {
          id: row.id,
          key: row.id || `move_${index}`,
          voucher_type: derivedVoucherType,
          source: transferType,
          main_unit: nextUnits.mainUnit,
          main_quantity: Math.abs(parseFloat(row?.delivered_qty) || 0),
          sub_unit: nextUnits.subUnit,
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
      setRows(mappedRows);
    } catch (err) {
      console.error(err);
      messageRef.current.error('خطا در دریافت حواله‌ها');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!quickCreateOpen) return;
    if (editingRow) {
      quickCreateForm.setFieldsValue({
        voucher_type: editingRow.voucher_type || 'incoming',
        source: editingRow.source || 'opening_balance',
        main_unit: editingRow.main_unit || productUnits.mainUnit,
        sub_unit: editingRow.sub_unit || productUnits.subUnit,
        main_quantity: editingRow.main_quantity || 0,
        sub_quantity: editingRow.sub_quantity || 0,
        from_shelf_id: editingRow.from_shelf_id || null,
        to_shelf_id: editingRow.to_shelf_id || null,
      });
      return;
    }
    quickCreateForm.setFieldsValue({
      voucher_type: 'incoming',
      source: 'opening_balance',
      main_unit: productUnits.mainUnit,
      sub_unit: productUnits.subUnit,
      main_quantity: 0,
      sub_quantity: 0,
      from_shelf_id: null,
      to_shelf_id: null,
    });
  }, [quickCreateOpen, quickCreateForm, productUnits.mainUnit, productUnits.subUnit, editingRow]);

  useEffect(() => {
    if (!openQuickAddSignal) return;
    setEditingRow(null);
    setQuickCreateOpen(true);
  }, [openQuickAddSignal]);

  useEffect(() => {
    if (!quickCreateOpen) return;
    if (source === 'waste' && voucherType !== 'outgoing') {
      quickCreateForm.setFieldValue('voucher_type', 'outgoing');
    }
    if (voucherType === 'incoming') quickCreateForm.setFieldValue('from_shelf_id', null);
    if (voucherType === 'outgoing') quickCreateForm.setFieldValue('to_shelf_id', null);
    if (source === 'waste') quickCreateForm.setFieldValue('to_shelf_id', null);
  }, [quickCreateOpen, source, voucherType, quickCreateForm]);

  useEffect(() => {
    if (!quickCreateOpen) return;
    const qtyMain = parseFloat(mainQuantity) || 0;
    const converted = mainUnit && subUnit ? convertArea(qtyMain, mainUnit as any, subUnit as any) : 0;
    quickCreateForm.setFieldValue('sub_quantity', Number.isFinite(converted) ? converted : 0);
  }, [quickCreateOpen, mainQuantity, mainUnit, subUnit, quickCreateForm]);

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
    id: 'product_stock_movements_view',
    fields: displayFields,
  }) as any, [displayFields]);

  const tableRelationOptions = useMemo(() => {
    const next: Record<string, any[]> = { ...relationOptions };
    (block.tableColumns || []).forEach((col: any) => {
      if (col.type !== FieldType.RELATION) return;
      next[col.key] = getRelationOptions(col.key, col.relationConfig?.targetModule);
    });
    return next;
  }, [block.tableColumns, getRelationOptions, relationOptions]);

  const baseAddFields = useMemo(() => {
    const includeKeys = new Set([
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
        if (['main_unit', 'sub_unit', 'sub_quantity'].includes(String(field.key))) {
          (next as any).readonly = true;
        }
        return next;
      });
  }, [displayFields]);

  const quickCreateFields = useMemo(() => {
    const currentType = String(voucherType || '');
    const currentSource = String(source || '');
    const shouldShowFromShelf = currentType === 'outgoing' || currentType === 'transfer';
    const shouldShowToShelf = (currentType === 'incoming' || currentType === 'transfer') && currentSource !== 'waste';

    return baseAddFields
      .filter((field: any) => {
        if (field.key === 'from_shelf_id') return shouldShowFromShelf;
        if (field.key === 'to_shelf_id') return shouldShowToShelf;
        return true;
      })
      .map((field: any) => {
        const required = (
          field.key === 'voucher_type'
          || field.key === 'source'
          || field.key === 'main_quantity'
          || (field.key === 'from_shelf_id' && shouldShowFromShelf)
          || (field.key === 'to_shelf_id' && shouldShowToShelf)
        );
        return {
          ...field,
          validation: required ? { required: true } : undefined,
        } as ModuleField;
      });
  }, [baseAddFields, source, voucherType]);

  const addRelationOptions = useMemo(() => {
    const map: Record<string, any[]> = {};
    quickCreateFields.forEach((field: any) => {
      if (field.type !== FieldType.RELATION) return;
      map[field.key] = getRelationOptions(field.key, field.relationConfig?.targetModule);
    });
    return map;
  }, [quickCreateFields, getRelationOptions]);

  const totals = useMemo(() => {
    const incoming = rows.reduce((sum: number, row: any) => {
      const qty = Math.abs(parseFloat(row?.main_quantity) || 0);
      const type = String(row?.voucher_type || '');
      if (type === 'incoming' || type === 'transfer') return sum + qty;
      return sum;
    }, 0);
    const outgoing = rows.reduce((sum: number, row: any) => {
      const qty = Math.abs(parseFloat(row?.main_quantity) || 0);
      const type = String(row?.voucher_type || '');
      if (type === 'outgoing' || type === 'transfer') return sum + qty;
      return sum;
    }, 0);
    return { incoming, outgoing };
  }, [rows]);

  const buildDeltasFromPayload = (payload: {
    voucherType: string;
    qtyMain: number;
    fromShelfId: string | null;
    toShelfId: string | null;
  }, multiplier = 1) => {
    const deltas: Array<{ productId: string; shelfId: string; delta: number }> = [];
    const qty = Math.abs(parseFloat(String(payload.qtyMain)) || 0) * multiplier;
    if (!qty) return deltas;
    if (payload.voucherType === 'incoming' && payload.toShelfId) {
      deltas.push({ productId: recordId, shelfId: payload.toShelfId, delta: qty });
    } else if (payload.voucherType === 'outgoing' && payload.fromShelfId) {
      deltas.push({ productId: recordId, shelfId: payload.fromShelfId, delta: -qty });
    } else if (payload.voucherType === 'transfer' && payload.fromShelfId && payload.toShelfId) {
      deltas.push({ productId: recordId, shelfId: payload.fromShelfId, delta: -qty });
      deltas.push({ productId: recordId, shelfId: payload.toShelfId, delta: qty });
    }
    return deltas;
  };

  const normalizeFormMovement = (values: any) => {
    const transferType = String(values?.source || '');
    let voucher = String(values?.voucher_type || '');
    if (!voucher) throw new Error('نوع حواله انتخاب نشده است.');
    if (!transferType) throw new Error('منبع حواله انتخاب نشده است.');
    if (!ALLOWED_MANUAL_SOURCES.has(transferType)) {
      throw new Error('برای ثبت دستی، فقط "موجودی اول دوره"، "انبارگردانی" و "ضایعات" مجاز است.');
    }
    if (transferType === 'waste') voucher = 'outgoing';

    const qtyMain = Math.abs(parseFloat(values?.main_quantity) || 0);
    if (qtyMain <= 0) throw new Error('مقدار واحد اصلی باید بیشتر از صفر باشد.');
    const qtySub = Math.abs(parseFloat(values?.sub_quantity) || 0);
    const fromShelfId = values?.from_shelf_id ? String(values.from_shelf_id) : null;
    const toShelfId = values?.to_shelf_id ? String(values.to_shelf_id) : null;

    if (voucher === 'incoming' && !toShelfId) throw new Error('برای حواله ورود، قفسه ورود الزامی است.');
    if (voucher === 'outgoing' && !fromShelfId) throw new Error('برای حواله خروج، قفسه برداشت الزامی است.');
    if (voucher === 'transfer') {
      if (!fromShelfId || !toShelfId) throw new Error('برای جابجایی، قفسه برداشت و قفسه ورود الزامی است.');
      if (fromShelfId === toShelfId) throw new Error('قفسه برداشت و قفسه ورود نباید یکسان باشند.');
    }

    return {
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
      transferType: string;
      voucherType: string;
      qtyMain: number;
      qtySub: number;
      fromShelfId: string | null;
      toShelfId: string | null;
    },
    creatorId: string | null
  ) => ({
    voucher_type: normalized.voucherType,
    source: normalized.transferType,
    main_unit: productUnits.mainUnit,
    main_quantity: normalized.qtyMain,
    sub_unit: productUnits.subUnit,
    sub_quantity: normalized.qtySub,
    from_shelf_id: normalized.fromShelfId,
    to_shelf_id: normalized.toShelfId,
    invoice_id: null,
    purchase_invoice_id: null,
    production_order_id: null,
    created_by_name: creatorId,
    created_at: new Date().toISOString(),
  });

  const handleSubmit = async () => {
    setQuickCreateLoading(true);
    try {
      const values = await quickCreateForm.validateFields();
      if (!recordId) throw new Error('شناسه محصول نامعتبر است.');
      if (!productUnits.mainUnit) throw new Error('واحد اصلی محصول مشخص نشده است.');

      const normalized = normalizeFormMovement(values);
      const nextDeltas = buildDeltasFromPayload(normalized, 1);
      const rollbackDeltas = editingRow ? buildDeltasFromPayload({
        voucherType: String(editingRow?.voucher_type || ''),
        qtyMain: Math.abs(parseFloat(editingRow?.main_quantity) || 0),
        fromShelfId: editingRow?.from_shelf_id ? String(editingRow.from_shelf_id) : null,
        toShelfId: editingRow?.to_shelf_id ? String(editingRow.to_shelf_id) : null,
      }, -1) : [];
      if (rollbackDeltas.length || nextDeltas.length) {
        await applyInventoryDeltas(supabase as any, [...rollbackDeltas, ...nextDeltas]);
      }

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData?.user?.id || null;
      const payload = {
        product_id: recordId,
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
        'products',
        recordId,
        block,
        editingRow ? [editingRow] : [],
        [buildLogRow(normalized, currentUserId)]
      );

      await syncMultipleProductsStock(supabase as any, [recordId]);
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
            voucherType: String(row?.voucher_type || ''),
            qtyMain: Math.abs(parseFloat(row?.main_quantity) || 0),
            fromShelfId: row?.from_shelf_id ? String(row.from_shelf_id) : null,
            toShelfId: row?.to_shelf_id ? String(row.to_shelf_id) : null,
          }, -1);
          if (rollbackDeltas.length) {
            await applyInventoryDeltas(supabase as any, rollbackDeltas);
          }
          const { error: deleteError } = await supabase.from('stock_transfers').delete().eq('id', row.id);
          if (deleteError) throw deleteError;
          await insertChangelog(
            supabase as any,
            'products',
            recordId,
            block,
            [row],
            []
          );
          await syncMultipleProductsStock(supabase as any, [recordId]);
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
        <span>موجودی فعلی: <span className="text-leather-600 persian-number">{toPersianNumber(currentProductStock)}</span></span>
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

export default ProductStockMovementsPanel;
