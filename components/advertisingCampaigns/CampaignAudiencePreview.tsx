import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Button, Empty, Table, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import type { CampaignToolRecord } from './types';

type Row = {
  ref: string;
  source_module_id: string;
  title: string;
  system_code?: string | null;
  contact?: string | null;
  is_duplicate?: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  marketing_leads: 'لید',
  customers: 'مشتری',
  invoices: 'فاکتور',
};

const PAGE_SIZE = 50;

const CampaignAudiencePreview: React.FC<{
  campaignId: string;
  tools: CampaignToolRecord[];
  disabled?: boolean;
  onToolChange: (toolId: string, patch: Partial<CampaignToolRecord>) => void;
}> = ({ campaignId, tools, disabled, onToolChange }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const excluded = useMemo(
    () => new Set(tools.flatMap((tool) => (
      Array.isArray((tool.config as any)?.excluded_audience_refs)
        ? (tool.config as any).excluded_audience_refs.map(String)
        : []
    ))),
    [tools],
  );
  const selected = rows.filter((row) => !excluded.has(row.ref)).map((row) => row.ref);

  const loadPage = useCallback(async (targetPage: number) => {
    if (!campaignId) {
      setError('ابتدا کمپین را ذخیره کنید.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await supabase.rpc('preview_advertising_campaign_audience', {
        p_campaign_id: campaignId,
        p_limit: PAGE_SIZE,
        p_offset: (targetPage - 1) * PAGE_SIZE,
      });
      if (result.error) throw result.error;
      setRows(Array.isArray(result.data?.rows) ? result.data.rows : []);
      setTotal(Math.max(0, Number(result.data?.total || 0)));
      setPage(targetPage);
      setLoaded(true);
    } catch (cause: any) {
      setError(String(cause?.message || 'جست‌وجوی مخاطبان ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const changeSelection = (keys: React.Key[]) => {
    const chosen = new Set(keys.map(String));
    const pageRefs = new Set(rows.map((row) => row.ref));
    tools.forEach((tool) => {
      const current = Array.isArray((tool.config as any)?.excluded_audience_refs)
        ? (tool.config as any).excluded_audience_refs.map(String).filter((ref: string) => !pageRefs.has(ref))
        : [];
      const next = [
        ...current,
        ...rows.filter((row) => !chosen.has(row.ref)).map((row) => row.ref),
      ];
      onToolChange(tool.id, {
        config: {
          ...(tool.config as any),
          excluded_audience_refs: Array.from(new Set(next)),
        } as any,
      });
    });
  };

  const columns = [
    {
      title: 'مخاطب',
      dataIndex: 'title',
      render: (value: string, row: Row) => (
        <div>
          <strong>{value}</strong>
          <div className="text-xs text-gray-500">{row.system_code || row.contact || '-'}</div>
        </div>
      ),
    },
    {
      title: 'نوع',
      dataIndex: 'source_module_id',
      width: 110,
      render: (value: string) => <Tag>{SOURCE_LABELS[value] || value}</Tag>,
    },
    {
      title: 'وضعیت تکرار',
      dataIndex: 'is_duplicate',
      width: 150,
      render: (value: boolean) => value
        ? <Tag color="orange">تکراری؛ یک‌بار ارسال</Tag>
        : <Tag color="green">یکتا</Tag>,
    },
  ];

  return (
    <div className="space-y-3 rounded-2xl border border-gray-100 p-3 dark:border-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <strong>مخاطبان منطبق</strong>
          <div className="text-xs text-gray-500">
            همه به‌صورت پیش‌فرض انتخاب‌اند؛ موارد تکراری در زمان ارسال فقط یک‌بار لحاظ می‌شوند.
          </div>
        </div>
        <Button
          type="primary"
          icon={<SearchOutlined />}
          loading={loading}
          onClick={() => void loadPage(1)}
        >
          جست‌وجوی مخاطبان منطبق
        </Button>
      </div>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {loaded && !loading && !rows.length ? <Empty description="مخاطب منطبقی پیدا نشد." /> : null}
      {loaded && (rows.length > 0 || loading) ? (
        <Table
          rowKey="ref"
          loading={loading}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 650 }}
          rowSelection={{
            selectedRowKeys: selected,
            preserveSelectedRowKeys: true,
            onChange: changeSelection,
            getCheckboxProps: () => ({ disabled }),
          }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            showTotal: (count) => `${count.toLocaleString('fa-IR')} مخاطب منطبق`,
            onChange: (nextPage) => void loadPage(nextPage),
          }}
        />
      ) : null}
    </div>
  );
};

export default CampaignAudiencePreview;
