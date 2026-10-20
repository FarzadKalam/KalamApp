import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Progress, Space, Statistic, Table, Tag } from 'antd';
import { CloudUploadOutlined, ReloadOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import type { CampaignAttachment } from './types';

type ImportRow = {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
  total_rows: number;
  processed_rows: number;
  valid_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  error_summary?: Record<string, unknown> | null;
};

type Props = {
  campaignId: string;
  toolId: string;
  channel: 'sms' | 'email';
  attachments: CampaignAttachment[];
  disabled?: boolean;
};

const COLUMNS = 'id,status,total_rows,processed_rows,valid_rows,duplicate_rows,invalid_rows,error_summary';

const CampaignImportProgress: React.FC<Props> = ({ campaignId, toolId, channel, attachments, disabled }) => {
  const { message } = App.useApp();
  const [row, setRow] = useState<ImportRow | null>(null);
  const [starting, setStarting] = useState(false);
  const [previewRows, setPreviewRows] = useState<Array<{ id: string; display_name: string | null; contact_value: string; source_file_name: string; source_row_number: number }>>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewTotal, setPreviewTotal] = useState(0);
  const files = useMemo(() => (attachments || [])
    .filter((item) => String(item.url || '').trim() && String(item.name || '').trim())
    .map((item) => ({
      name: String(item.name).trim(),
      url: String(item.url).trim(),
      assetId: String(item.assetId || '').trim() || null,
    })), [attachments]);

  const loadLatest = useCallback(async () => {
    if (!toolId || toolId.startsWith('draft:')) return;
    const result = await supabase.from('advertising_campaign_imports').select(COLUMNS).eq('tool_id', toolId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!result.error && result.data) setRow(result.data as ImportRow);
  }, [toolId]);

  const loadPreview = useCallback(async (importId: string, page = 1) => {
    const start = (page - 1) * 50;
    const result = await supabase.from('advertising_campaign_import_rows')
      .select('id,display_name,contact_value,source_file_name,source_row_number', { count: 'exact' })
      .eq('import_id', importId).order('created_at').range(start, start + 49);
    if (result.error) throw result.error;
    setPreviewRows(result.data || []);
    setPreviewTotal(result.count || 0);
    setPreviewPage(page);
  }, []);

  useEffect(() => { void loadLatest(); }, [loadLatest]);
  useEffect(() => {
    if (row?.status === 'completed') void loadPreview(row.id).catch(() => setPreviewRows([]));
    else { setPreviewRows([]); setPreviewTotal(0); }
  }, [row?.id, row?.status, loadPreview]);

  useEffect(() => {
    let channelRef: any = null;
    let active = true;
    if (toolId && !toolId.startsWith('draft:')) {
      channelRef = supabase.channel(`campaign-import-progress-${toolId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'advertising_campaign_imports', filter: `tool_id=eq.${toolId}` }, () => {
          if (active) void loadLatest();
        })
        .subscribe();
    }
    return () => {
      active = false;
      if (channelRef) void supabase.removeChannel(channelRef);
    };
  }, [loadLatest, toolId]);

  const start = async () => {
    if (!files.length) {
      message.warning('حداقل یک فایل معتبر از FileManager انتخاب یا آپلود کنید.');
      return;
    }
    setStarting(true);
    try {
      const recordFileIds = Array.from(new Set(attachments.map((item) => String(item.recordFileId || '').trim()).filter(Boolean)));
      if (recordFileIds.length !== files.length) throw new Error('اتصال فایل‌ها به ابزار کامل نیست. فایل‌ها را دوباره انتخاب یا آپلود کنید.');
      const result = await supabase.functions.invoke('campaign-audience-import', {
        body: { campaign_id: campaignId, tool_id: toolId, channel, record_file_ids: recordFileIds },
      });
      if (result.error || result.data?.success === false) {
        const serverMessage = result.data?.message || (result.error && 'context' in result.error ? (await result.error.context?.json?.().catch(() => null))?.message : null);
        throw new Error(serverMessage || result.error?.message || 'شروع پردازش ناموفق بود.');
      }
      const importId = String(result.data?.import_id || '').trim();
      if (importId) {
        const loaded = await supabase.from('advertising_campaign_imports').select(COLUMNS).eq('id', importId).single();
        if (!loaded.error) setRow(loaded.data as ImportRow);
      }
      message.success('پردازش امن فایل مخاطبان شروع شد.');
    } catch (error) {
      message.error(toFaErrorMessage(error, 'شروع پردازش فایل مخاطبان ناموفق بود.'));
    } finally {
      setStarting(false);
    }
  };

  const percent = row?.total_rows ? Math.min(100, Math.round((Number(row.processed_rows || 0) / Number(row.total_rows)) * 100)) : row?.status === 'completed' ? 100 : 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Space wrap><strong>پردازش فایل مخاطبان</strong>{row ? <Tag color={row.status === 'completed' ? 'green' : row.status === 'failed' ? 'red' : 'blue'}>{row.status === 'pending' ? 'در صف' : row.status === 'processing' ? 'در حال پردازش' : row.status === 'completed' ? 'تکمیل‌شده' : row.status === 'failed' ? 'ناموفق' : 'لغوشده'}</Tag> : null}</Space>
        <Space><Button size="small" icon={<ReloadOutlined />} onClick={() => void loadLatest()}>به‌روزرسانی</Button><Button type="primary" size="small" icon={<CloudUploadOutlined />} loading={starting} disabled={disabled || !campaignId || !toolId || files.length === 0 || row?.status === 'processing'} onClick={() => void start()}>شروع پردازش</Button></Space>
      </div>
      {row ? <><Progress className="mt-3" percent={percent} status={row.status === 'failed' ? 'exception' : row.status === 'completed' ? 'success' : 'active'} /><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Statistic title="کل ردیف‌ها" value={row.total_rows || 0} /><Statistic title="معتبر" value={row.valid_rows || 0} valueStyle={{ color: '#16a34a' }} /><Statistic title="تکراری" value={row.duplicate_rows || 0} valueStyle={{ color: '#d97706' }} /><Statistic title="نامعتبر" value={row.invalid_rows || 0} valueStyle={{ color: '#dc2626' }} /></div>{row.status === 'failed' ? <Alert type="error" showIcon className="mt-3" message="پردازش فایل ناموفق بود" description={String((row.error_summary as any)?.message || 'جزئیات خطا در گزارش import ثبت شده است.')} /> : null}</> : <div className="mt-3 text-xs text-slate-400">پس از اتصال فایل، پردازش سروری را آغاز کنید تا تعداد مخاطبان معتبر، تکراری و نامعتبر نمایش داده شود.</div>}
      {row?.status === 'completed' ? <div className="mt-4"><strong className="mb-2 block">فهرست مخاطبان فایل</strong><Table rowKey="id" size="small" scroll={{ x: 540 }} dataSource={previewRows} columns={[{ title: 'نام', dataIndex: 'display_name', render: (value: string | null) => value || 'بدون نام' }, { title: channel === 'sms' ? 'موبایل' : 'ایمیل', dataIndex: 'contact_value' }, { title: 'فایل', dataIndex: 'source_file_name' }, { title: 'ردیف', dataIndex: 'source_row_number' }]} pagination={{ current: previewPage, pageSize: 50, total: previewTotal, showSizeChanger: false, onChange: (page) => void loadPreview(row.id, page) }} /></div> : null}
    </div>
  );
};

export default CampaignImportProgress;
