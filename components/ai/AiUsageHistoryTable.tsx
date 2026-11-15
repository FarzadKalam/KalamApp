import React, { useEffect, useState } from 'react';
import { App, Empty, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type Props = { central?: boolean; columns: ColumnsType<any>; refreshKey?: unknown };

/** Shared, server-paginated ledger for tenant and SaaS settings. */
const AiUsageHistoryTable: React.FC<Props> = ({ central = false, columns, refreshKey }) => {
  const { message } = App.useApp();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const body = central
      ? { action: 'saas_ai', sub: 'usage_page', page, pageSize }
      : { action: 'get_ai_usage_page', page, pageSize };
    void supabase.functions.invoke('ai-assistant', { body }).then(({ data, error }) => {
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'دریافت مصرف ناموفق بود.'));
      if (!active) return;
      setRows(data.rows || []);
      setTotal(Number(data.total || 0));
    }).catch((error) => {
      if (active) {
        setRows([]);
        setTotal(0);
        message.error(toFaErrorMessage(error, 'دریافت فهرست مصرف ناموفق بود.'));
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [central, page, pageSize, refreshKey, message]);

  return <Table
    rowKey="id"
    size="small"
    loading={loading}
    dataSource={rows}
    columns={columns}
    scroll={{ x: 900 }}
    locale={{ emptyText: <Empty description="درخواستی ثبت نشده است." /> }}
    pagination={{
      current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [20, 50, 100],
      showTotal: (count) => `${count.toLocaleString('fa-IR')} درخواست`,
      onChange: (nextPage, nextSize) => { setPage(nextSize === pageSize ? nextPage : 1); setPageSize(nextSize); },
    }}
  />;
};

export default AiUsageHistoryTable;
