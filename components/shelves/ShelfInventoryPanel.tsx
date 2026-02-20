import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Spin } from 'antd';
import { FieldType, type ModuleField } from '../../types';
import { supabase } from '../../supabaseClient';
import SmartTableRenderer from '../SmartTableRenderer';
import { convertArea, HARD_CODED_UNIT_OPTIONS } from '../../utils/unitConversions';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

interface ShelfInventoryPanelProps {
  block: any;
  recordId: string;
  relationOptions: Record<string, any[]>;
  dynamicOptions: Record<string, any[]>;
}

const ShelfInventoryPanel: React.FC<ShelfInventoryPanelProps> = ({
  block,
  recordId,
  relationOptions,
  dynamicOptions,
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<any[]>([]);

  const loadRows = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_inventory')
        .select('id, product_id, stock, created_at, products(name, system_code, main_unit, sub_unit)')
        .eq('shelf_id', recordId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const mapped = (data || []).map((row: any, index: number) => {
        const mainUnit = row?.products?.main_unit || null;
        const subUnit = row?.products?.sub_unit || null;
        const mainStock = parseFloat(row?.stock) || 0;
        const subStock = mainUnit && subUnit
          ? convertArea(mainStock, mainUnit as any, subUnit as any)
          : 0;
        return {
          id: row?.id,
          key: row?.id || `shelf_inventory_${index}`,
          product_id: row?.product_id || null,
          product_name: row?.products?.name || '',
          product_code: row?.products?.system_code || '-',
          main_unit: mainUnit,
          main_stock: mainStock,
          sub_unit: subUnit,
          sub_stock: Number.isFinite(subStock) ? subStock : 0,
        };
      });

      setRows(mapped);
    } catch (err) {
      console.error(err);
      message.error('خطا در دریافت موجودی قفسه');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [message, recordId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const productRelationOptions = useMemo(() => {
    const byRecord = new Map<string, { label: string; value: string }>();
    rows.forEach((row: any) => {
      const productId = row?.product_id ? String(row.product_id) : '';
      if (!productId) return;
      const productName = row?.product_name ? String(row.product_name) : '';
      const productCode = row?.product_code && row.product_code !== '-' ? String(row.product_code) : '';
      const base = relationOptions?.products?.find((item: any) => String(item?.value || '') === productId)?.label || '';
      const fallback = productName
        ? (productCode ? `${productName} (${productCode})` : productName)
        : (productCode ? `${productId} (${productCode})` : productId);
      const label = (base && String(base).trim() !== productId) ? base : fallback;
      byRecord.set(productId, { label, value: productId });
    });
    return Array.from(byRecord.values());
  }, [relationOptions, rows]);

  const tableFields = useMemo(() => ([
    {
      key: 'product_id',
      type: FieldType.RELATION,
      labels: { fa: 'نام محصول', en: 'Product' },
      relationConfig: { targetModule: 'products', targetField: 'name' },
      isTableColumn: true,
      order: 1,
    },
    {
      key: 'product_code',
      type: FieldType.TEXT,
      labels: { fa: 'کد محصول', en: 'Product Code' },
      isTableColumn: true,
      order: 2,
    },
    {
      key: 'main_unit',
      type: FieldType.SELECT,
      labels: { fa: 'واحد اصلی', en: 'Main Unit' },
      options: HARD_CODED_UNIT_OPTIONS,
      isTableColumn: true,
      order: 3,
    },
    {
      key: 'main_stock',
      type: FieldType.NUMBER,
      labels: { fa: 'موجودی واحد اصلی', en: 'Main Stock' },
      isTableColumn: true,
      order: 4,
    },
    {
      key: 'sub_unit',
      type: FieldType.SELECT,
      labels: { fa: 'واحد فرعی', en: 'Sub Unit' },
      options: HARD_CODED_UNIT_OPTIONS,
      isTableColumn: true,
      order: 5,
    },
    {
      key: 'sub_stock',
      type: FieldType.NUMBER,
      labels: { fa: 'موجودی واحد فرعی', en: 'Sub Stock' },
      isTableColumn: true,
      order: 6,
    },
  ]) as ModuleField[], []);

  const tableModuleConfig = useMemo(() => ({
    id: 'shelf_inventory_view',
    fields: tableFields,
  }) as any, [tableFields]);

  const tableRelationOptions = useMemo(() => ({
    ...relationOptions,
    product_id: productRelationOptions,
  }), [productRelationOptions, relationOptions]);

  const totals = useMemo(() => {
    const main = rows.reduce((sum: number, row: any) => sum + (parseFloat(row?.main_stock) || 0), 0);
    const sub = rows.reduce((sum: number, row: any) => sum + (parseFloat(row?.sub_stock) || 0), 0);
    return { main, sub };
  }, [rows]);

  if (loading) {
    return <div className="p-10 text-center"><Spin /></div>;
  }

  return (
    <div className="bg-white dark:bg-[#1a1a1a] p-6 rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 transition-all">
      <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-800 pb-4">
        <h3 className="font-bold text-base text-gray-700 dark:text-white m-0 flex items-center gap-2">
          <span className="w-1 h-5 bg-leather-500 rounded-full inline-block"></span>
          {block?.titles?.fa || 'موجودی قفسه'}
        </h3>
      </div>

      <SmartTableRenderer
        moduleConfig={tableModuleConfig}
        data={rows}
        loading={false}
        relationOptions={tableRelationOptions}
        dynamicOptions={dynamicOptions}
        canViewField={(fieldKey) => fieldKey !== 'assignee_id'}
        disableScroll={false}
        tableLayout="auto"
        pagination={{ pageSize: 10, position: ['bottomCenter'], size: 'small' }}
      />

      <div className="mt-3 text-xs md:text-sm flex flex-wrap gap-4">
        <span>جمع موجودی واحد اصلی: <span className="text-leather-600 persian-number">{toPersianNumber(totals.main)}</span></span>
        <span>جمع موجودی واحد فرعی: <span className="text-leather-600 persian-number">{toPersianNumber(totals.sub)}</span></span>
      </div>
    </div>
  );
};

export default ShelfInventoryPanel;
