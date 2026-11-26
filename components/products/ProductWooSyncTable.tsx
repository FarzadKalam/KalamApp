import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Select, Space, Table, Tag, Typography } from 'antd';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import RichTextContent from '../RichTextContent';

const labels: Record<string, string> = {
  title: 'عنوان', short_description: 'توضیح کوتاه', description: 'توضیحات کامل',
  slug: 'نشانی کوتاه', site_image_url: 'تصویر', site_image_alt: 'متن جایگزین تصویر',
  name: 'نام کالا', manual_code: 'کد کالا', product_type: 'نوع کالا', sell_price: 'قیمت فروش',
  image_url: 'تصویر کالا', status: 'وضعیت کالا', stock: 'موجودی', images: 'تصاویر',
};
const statuses: Record<string, { text: string; color: string }> = {
  synced: { text: 'همگام', color: 'green' },
  app_changed: { text: 'تغییر در اپ', color: 'blue' },
  site_changed: { text: 'تغییر در سایت', color: 'blue' },
  conflict: { text: 'تغییر در هر دو سمت', color: 'red' },
  unverified: { text: 'نیازمند بررسی', color: 'gold' },
  unlinked: { text: 'بدون نگاشت', color: 'default' },
  unavailable: { text: 'بررسی ناموفق', color: 'red' },
  partial: { text: 'ناقص', color: 'orange' },
  started: { text: 'در حال انجام', color: 'blue' },
  succeeded: { text: 'موفق', color: 'green' },
  failed: { text: 'ناموفق', color: 'red' },
};
const displayDate = (value?: string | null) => value ? new Date(value).toLocaleString('fa-IR') : '—';
const statusTag = (status: string) => <Tag color={statuses[status]?.color}>{statuses[status]?.text || 'نامشخص'}</Tag>;
const failureLabels: Record<string, string> = {
  comparison_stale: 'محتوای یکی از دو سمت تغییر کرده است.',
  policy_blocked: 'جهت انتقال با مرجع فروشگاه سازگار نیست.',
  invalid_image: 'نشانی تصویر برای ارسال به فروشگاه مجاز نیست.',
  operation_busy: 'انتقال دیگری برای همین محصول در حال انجام بود.',
  record_not_found: 'محصول در دسترس نبود.',
  connection_error: 'ارتباط با فروشگاه برقرار نشد.',
};
type Direction = 'from_site' | 'to_site';
type Overview = {
  stores: Array<{ id: string; name: string }>;
  status: {
    connectionId: string; connectionName: string; status: string; policy: string; hasDraft?: boolean;
    localUpdatedAt?: string; remoteUpdatedAt?: string; lastSyncedAt?: string; permalink?: string; error?: string;
    localHash?: string; remoteHash?: string; changedFields?: string[];
    app?: Record<string, string>; site?: Record<string, string>;
  } | null;
  events: Array<{
    id: string; connection_id: string; direction: Direction; started_at: string;
    status: string; changed_fields: string[]; error_code?: string;
  }>;
  total: number;
};

type Props = {
  orgId: string; productId: string; canEdit: boolean; hasUnsavedChanges: boolean; saving: boolean;
  revision?: string; onReceived: () => Promise<void>; onBusyChange: (busy: boolean) => void;
};

async function callConnector(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('external-connectors', { body });
  if (error) {
    const payload = await error.context?.json?.().catch(() => null);
    throw new Error(payload?.message || 'ارتباط با سرویس اتصال ناموفق بود.');
  }
  if (data?.error) throw new Error(data.message || 'عملیات اتصال ناموفق بود.');
  return data;
}

function PreviewValue({ field, value }: { field: string; value?: string }) {
  if (!value) return '—';
  if (field === 'short_description' || field === 'description') return <RichTextContent value={value} className="max-h-44 overflow-auto" />;
  if (field === 'site_image_url') return <img src={value} alt="" className="max-h-24 max-w-full rounded" />;
  return <span className="break-all">{value}</span>;
}

export default function ProductWooSyncTable({
  orgId, productId, canEdit, hasUnsavedChanges, saving, revision, onReceived, onBusyChange,
}: Props) {
  const { message, modal } = App.useApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [store, setStore] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const activeConfirm = useRef<{ destroy: () => void } | null>(null);
  const latest = useRef({ hasUnsavedChanges, saving });
  latest.current = { hasUnsavedChanges, saving };

  const refresh = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError('');
    try {
      const payload = await callConnector({ action: 'product_content_overview', orgId, localId: productId, id: store, page });
      if (current === request.current) setOverview(payload);
    } catch (failure) {
      if (current === request.current) {
        setOverview(null);
        setError(toFaErrorMessage(failure, 'بررسی وضعیت ووکامرس ناموفق بود.'));
      }
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [orgId, productId, store, page]);

  useEffect(() => {
    void refresh();
    return () => { request.current += 1; };
  }, [refresh, revision]);
  useEffect(() => () => activeConfirm.current?.destroy(), []);

  const state = overview?.status;
  const confirmSync = (direction: Direction) => {
    if (!state?.localHash || !state.remoteHash || busy || !canEdit || hasUnsavedChanges || saving) return;
    const sending = direction === 'to_site';
    activeConfirm.current?.destroy();
    activeConfirm.current = modal.confirm({
      title: sending ? 'ارسال محتوای محصول به فروشگاه' : 'دریافت محتوای محصول از فروشگاه',
      width: 720,
      content: <Space direction="vertical" className="w-full">
        {state.status === 'conflict' && <Alert showIcon type="warning" message="هر دو سمت تغییر کرده‌اند. انتقال می‌تواند محتوای سمت مقصد را بازنویسی کند." />}
        <Typography.Text>{sending
          ? 'توضیح خالی، متن موجود فروشگاه را پاک نمی‌کند. در محصول منتشرشده، تغییرات در فروشگاه قابل مشاهده خواهند بود.'
          : 'محتوای فروشگاه جایگزین پیش‌نویس ذخیره‌شدهٔ این محصول در اپ می‌شود.'}</Typography.Text>
        <Table size="small" rowKey="field" pagination={false} scroll={{ x: 460 }}
          dataSource={(state.changedFields || []).map((field) => ({ field }))}
          columns={[
            { title: 'فیلد', render: (_, { field }) => labels[field] },
            { title: 'اپ', width: '40%', render: (_, { field }) => <PreviewValue field={field} value={state.app?.[field]} /> },
            { title: 'فروشگاه', width: '40%', render: (_, { field }) => <PreviewValue field={field} value={state.site?.[field]} /> },
          ]}
        />
      </Space>,
      okText: sending ? 'ارسال به فروشگاه' : 'دریافت از فروشگاه',
      cancelText: 'انصراف',
      onOk: async () => {
        if (latest.current.hasUnsavedChanges || latest.current.saving) {
          message.warning('ابتدا تغییرات فرم را ذخیره کنید و دوباره تفاوت‌ها را بررسی کنید.');
          return;
        }
        setBusy(true);
        onBusyChange(true);
        try {
          const result = await callConnector({
            action: 'sync_product_content', orgId, localId: productId, id: state.connectionId,
            direction, localHash: state.localHash, remoteHash: state.remoteHash,
          });
          if (!sending) await onReceived();
          if (!result.historySaved) message.warning('انتقال انجام شد، اما ثبت نتیجه در تاریخچه ناموفق بود.');
          else if (!result.result?.baselineSaved) message.warning('انتقال انجام شد، اما ثبت وضعیت همگام‌سازی کامل نشد.');
          else if (result.result?.status === 'partial') message.warning('بخشی از تفاوت‌ها پس از ارسال باقی مانده است.');
          else message.success(sending ? 'محتوای محصول به فروشگاه ارسال شد.' : 'محتوای فروشگاه در پیش‌نویس ذخیره شد.');
        } catch (failure) {
          message.error(toFaErrorMessage(failure, 'انتقال محتوای محصول ناموفق بود.'));
        } finally {
          setBusy(false);
          onBusyChange(false);
          void refresh();
        }
      },
    });
  };

  const canTransfer = Boolean(state?.localHash && state.remoteHash && state.status !== 'synced'
    && canEdit && !hasUnsavedChanges && !saving && !busy && !loading);
  const storeNames = new Map(overview?.stores.map((item) => [item.id, item.name]));

  return (
    <Card size="small" className="mt-4" title="همگام‌سازی محصول با ووکامرس">
      <Space wrap className="mb-3">
        <Select aria-label="فروشگاه ووکامرس" style={{ minWidth: 180 }} loading={loading}
          placeholder="انتخاب فروشگاه" value={state?.connectionId || undefined}
          disabled={busy || !overview?.stores.length} onChange={setStore}
          options={overview?.stores.map((item) => ({ value: item.id, label: item.name }))} />
        <Button loading={loading} disabled={busy} onClick={() => void refresh()}>بررسی دوباره</Button>
        {state?.permalink && <Button href={state.permalink} target="_blank" rel="noreferrer">مشاهده در فروشگاه</Button>}
        {state?.policy === 'taze' && <Tag>مرجع محتوا اپ است</Tag>}
        {state?.policy === 'woocommerce' && <Tag>مرجع محتوا فروشگاه است</Tag>}
      </Space>
      {error && <Alert className="mb-3" type="error" showIcon message={error} />}
      {!loading && !error && !overview?.stores.length && <Alert type="info" showIcon message="فروشگاه فعال ووکامرس برای این سازمان ثبت نشده است." />}
      {state?.status === 'unlinked' && <Alert className="mb-3" type="info" showIcon message="این محصول را در تنظیمات اتصال فروشگاه به کالای متناظر متصل کنید." />}
      {state?.error && <Alert className="mb-3" type="error" showIcon message={state.error} />}
      {hasUnsavedChanges && <Alert className="mb-3" type="warning" showIcon message="قبل از انتقال، تغییرات فرم را ذخیره کنید." />}
      {state && <Table size="small" rowKey="connectionId" loading={loading} pagination={false} scroll={{ x: 650 }}
        dataSource={[state]} columns={[
          { title: 'فروشگاه', dataIndex: 'connectionName' },
          { title: 'آخرین تغییر اپ', render: (_, row) => displayDate(row.localUpdatedAt) },
          { title: 'آخرین تغییر سایت', render: (_, row) => displayDate(row.remoteUpdatedAt) },
          { title: 'آخرین انتقال کامل', render: (_, row) => displayDate(row.lastSyncedAt) },
          { title: 'وضعیت', render: (_, row) => statusTag(row.status) },
          { title: 'عملیات', render: (_, row) => <Space wrap>
            <Button size="small" disabled={!canTransfer || !row.hasDraft || row.policy === 'woocommerce'
              || (row.status === 'site_changed' && row.policy !== 'taze')}
              onClick={() => confirmSync('to_site')}>ارسال به فروشگاه</Button>
            <Button size="small" disabled={!canTransfer || row.policy === 'taze'
              || (row.status === 'app_changed' && row.policy !== 'woocommerce')}
              onClick={() => confirmSync('from_site')}>دریافت از فروشگاه</Button>
          </Space> },
        ]} />}
      {overview && <Table className="mt-4" title={() => 'سوابق همگام‌سازی همین محصول'} size="small" rowKey="id" loading={loading}
        dataSource={overview.events} scroll={{ x: 640 }} locale={{ emptyText: 'هنوز سابقه‌ای برای این محصول ثبت نشده است.' }}
        pagination={{ current: page, pageSize: 10, total: overview.total, onChange: setPage, showSizeChanger: false }}
        columns={[
          { title: 'زمان', render: (_, row) => displayDate(row.started_at) },
          { title: 'فروشگاه', render: (_, row) => storeNames.get(row.connection_id) || 'فروشگاه غیرفعال' },
          { title: 'جهت', render: (_, row) => row.direction === 'to_site' ? 'اپ به فروشگاه' : 'فروشگاه به اپ' },
          { title: 'نتیجه', render: (_, row) => <Space size={4} wrap>
            {statusTag(row.status)}
            {row.error_code && failureLabels[row.error_code] && <Typography.Text type="secondary">{failureLabels[row.error_code]}</Typography.Text>}
          </Space> },
          { title: 'تغییرات', render: (_, row) => row.changed_fields.map((field) => labels[field]).filter(Boolean).join('، ') || '—' },
        ]} />}
    </Card>
  );
}
