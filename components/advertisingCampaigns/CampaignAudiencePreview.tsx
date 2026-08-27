import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Empty, Table, Tag } from 'antd';
import { CheckCircleOutlined, SearchOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import type { CampaignToolRecord } from './types';
import { getCampaignToolLabel } from './constants';
import {
  applyCampaignAudienceSummaryToConfig,
  invalidateCampaignAudienceSummaryConfig,
  normalizeCampaignAudienceSummary,
} from './campaignUtils';
import type { CampaignAudienceSummary } from './campaignUtils';

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
  onBeforeSearch?: () => Promise<unknown>;
  criteriaSignature?: string;
}> = ({ campaignId, tools, disabled, onToolChange, onBeforeSearch, criteriaSignature }) => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [toolCounts, setToolCounts] = useState<Record<string, CampaignAudienceSummary>>({});

  useEffect(() => {
    setRows([]);
    setTotal(0);
    setPage(1);
    setLoaded(false);
    setToolCounts({});
  }, [criteriaSignature]);

  const excluded = useMemo(
    () => new Set(tools.flatMap((tool) => (
      Array.isArray((tool.config as any)?.excluded_audience_refs)
        ? (tool.config as any).excluded_audience_refs.map(String)
        : []
    ))),
    [tools],
  );
  const selected = rows.filter((row) => !excluded.has(row.ref)).map((row) => row.ref);

  const fetchPreview = useCallback(async (targetPage: number, persistFirst = true) => {
    if (!campaignId) {
      throw new Error('ابتدا کمپین را ذخیره کنید.');
    }
    if (persistFirst) await onBeforeSearch?.();
    const result = await supabase.rpc('preview_advertising_campaign_audience', {
      p_campaign_id: campaignId,
      p_limit: PAGE_SIZE,
      p_offset: (targetPage - 1) * PAGE_SIZE,
    });
    if (result.error) throw result.error;
    const data = result.data && typeof result.data === 'object' ? result.data as Record<string, any> : {};
    setRows(Array.isArray(data.rows) ? data.rows : []);
    setTotal(Math.max(0, Number(data.total || 0)));
    setPage(targetPage);
    setLoaded(true);
    return data;
  }, [campaignId, onBeforeSearch]);

  const loadPage = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError('');
    setToolCounts({});
    try {
      await fetchPreview(targetPage);
    } catch (cause: any) {
      setError(String(cause?.message || 'جست‌وجوی مخاطبان ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [fetchPreview]);

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
      const invalidatedConfig = invalidateCampaignAudienceSummaryConfig(tool.tool_type, tool.config);
      onToolChange(tool.id, {
        config: {
          ...(invalidatedConfig as any),
          excluded_audience_refs: Array.from(new Set(next)),
        } as any,
      });
    });
    setToolCounts({});
  };

  const finalizeAudience = async () => {
    setFinalizing(true);
    setError('');
    try {
      // ذخیره قبل از RPC تضمین می‌کند شرط‌ها و حذف‌های دستیِ همین لحظه مبنا باشند.
      await onBeforeSearch?.();
      const result = await supabase.rpc('finalize_advertising_campaign_audience', {
        p_campaign_id: campaignId,
      });
      if (result.error) throw result.error;
      const data = result.data && typeof result.data === 'object' ? result.data as Record<string, any> : {};
      const normalizedCounts = Object.fromEntries(Object.entries(data.tool_counts || {}).map(([toolId, value]) => (
        [toolId, normalizeCampaignAudienceSummary(value)]
      )));
      const missingTools = tools.filter((tool) => !normalizedCounts[tool.id]);
      if (missingTools.length > 0) {
        throw new Error('محاسبه تعداد قابل ارسال برای همه ابزارها کامل نشد؛ به‌روزرسانی پایگاه‌داده را بررسی کنید.');
      }
      tools.forEach((tool) => onToolChange(tool.id, {
        config: data.tool_configs?.[tool.id] || applyCampaignAudienceSummaryToConfig(
          tool.tool_type,
          tool.config,
          normalizedCounts[tool.id],
          String(data.finalized_at || new Date().toISOString()),
        ),
      }));
      setToolCounts(normalizedCounts);
      await fetchPreview(page, false);
      message.success('فهرست مخاطبان نهایی و تعداد واقعی قابل ارسال در تنظیمات ابزارها ثبت شد.');
    } catch (cause: any) {
      setError(String(cause?.message || 'نهایی‌سازی فهرست مخاطبان ناموفق بود.'));
    } finally {
      setFinalizing(false);
    }
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
        <div className="flex flex-wrap gap-2">
          <Button
            icon={<SearchOutlined />}
            loading={loading}
            disabled={disabled || finalizing}
            onClick={() => void loadPage(1)}
          >
            جست‌وجوی مخاطبان منطبق
          </Button>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={finalizing}
            disabled={disabled || loading || !loaded}
            onClick={() => void finalizeAudience()}
          >
            نهایی‌سازی فهرست
          </Button>
        </div>
      </div>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {Object.keys(toolCounts).length > 0 ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {tools.map((tool) => {
            const count = toolCounts[tool.id];
            if (!count) return null;
            return (
              <div key={tool.id} className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-white/5">
                <div className="mb-2 font-bold">{getCampaignToolLabel(tool.tool_type)}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Tag>منطبق: {count.matched_count.toLocaleString('fa-IR')}</Tag>
                  <Tag color="blue">یکتا: {count.unique_count.toLocaleString('fa-IR')}</Tag>
                  <Tag color="orange">تکراری: {count.duplicate_count.toLocaleString('fa-IR')}</Tag>
                  {count.invalid_count ? <Tag color="red">بدون راه ارتباطی: {count.invalid_count.toLocaleString('fa-IR')}</Tag> : null}
                  {count.excluded_count ? <Tag>حذف دستی: {count.excluded_count.toLocaleString('fa-IR')}</Tag> : null}
                  {count.suppressed_count ? <Tag color="volcano">عدم ارسال: {count.suppressed_count.toLocaleString('fa-IR')}</Tag> : null}
                  <Tag color="green">قابل ارسال: {count.sendable_count.toLocaleString('fa-IR')}</Tag>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
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
