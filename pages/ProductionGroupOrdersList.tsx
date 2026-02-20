import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Badge, Button, Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { toPersianNumber } from '../utils/persianNumberFormatter';

type GroupOrderRow = {
  id: string;
  name: string;
  system_code?: string | null;
  status?: string | null;
  production_order_ids?: string[] | null;
  created_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

const statusLabelMap: Record<string, { label: string; color: string }> = {
  draft: { label: 'پیش‌نویس', color: '#9ca3af' },
  pending: { label: 'در انتظار', color: '#f59e0b' },
  in_progress: { label: 'در حال تولید', color: '#3b82f6' },
  completed: { label: 'تکمیل شده', color: '#10b981' },
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('fa-IR');
};

const ProductionGroupOrdersList: React.FC = () => {
  const navigate = useNavigate();
  const { message: msg } = App.useApp();
  const [rows, setRows] = useState<GroupOrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('production_group_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows((data || []) as GroupOrderRow[]);
    } catch (err: any) {
      msg.error(err?.message || 'خطا در دریافت سفارشات گروهی');
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const columns: ColumnsType<GroupOrderRow> = useMemo(
    () => [
      {
        title: 'عنوان',
        dataIndex: 'name',
        key: 'name',
        render: (value: string, record: GroupOrderRow) => (
          <div className="flex flex-col">
            <span className="font-semibold">{value || '-'}</span>
            <span className="text-xs text-gray-500">{record.system_code || '-'}</span>
          </div>
        ),
      },
      {
        title: 'وضعیت',
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (value: string) => {
          const status = statusLabelMap[String(value || '')] || { label: String(value || '-'), color: '#9ca3af' };
          return <span style={{ color: status.color, fontWeight: 700 }}>{status.label}</span>;
        },
      },
      {
        title: 'تعداد سفارش',
        key: 'orders_count',
        width: 120,
        render: (_value: unknown, record: GroupOrderRow) =>
          toPersianNumber(Array.isArray(record.production_order_ids) ? record.production_order_ids.length : 0),
      },
      {
        title: 'ایجاد',
        dataIndex: 'created_at',
        key: 'created_at',
        width: 180,
        render: (value: string | null) => formatDateTime(value),
      },
      {
        title: 'شروع',
        dataIndex: 'started_at',
        key: 'started_at',
        width: 180,
        render: (value: string | null) => formatDateTime(value),
      },
      {
        title: 'تکمیل',
        dataIndex: 'completed_at',
        key: 'completed_at',
        width: 180,
        render: (value: string | null) => formatDateTime(value),
      },
    ],
    []
  );

  return (
    <div className="p-4 md:p-6 max-w-[1800px] mx-auto animate-fadeIn pb-20 h-[calc(105vh-64px)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2">
            <span className="w-2 h-8 bg-leather-500 rounded-full inline-block" />
            سفارشات گروهی تولید
          </h1>
          <Badge
            count={rows.length}
            overflowCount={999}
            style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button icon={<ReloadOutlined />} onClick={fetchRows} loading={loading}>
            بروزرسانی
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => navigate('/production_group_orders/create')}
            className="rounded-xl bg-leather-600 hover:!bg-leather-500 border-none"
          >
            افزودن سفارش گروهی
          </Button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 h-full overflow-hidden">
        {rows.length === 0 && !loading ? (
          <div className="h-full flex items-center justify-center">
            <Empty description="سفارش گروهی ثبت نشده است." />
          </div>
        ) : (
          <Table<GroupOrderRow>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: true }}
            onRow={(record: GroupOrderRow) => ({
              onClick: () => navigate(`/production_group_orders/${record.id}`),
              style: { cursor: 'pointer' },
            })}
          />
        )}
      </div>
    </div>
  );
};

export default ProductionGroupOrdersList;
