import { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Empty, Input, Modal, Space, Spin, Table, Tabs, Tag, Timeline, Typography, Upload } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useInstallationDetail } from '../../hooks/useLocalInstallations';
import { installationRpc, installationStatuses, jobKinds, jobStatuses, reportIsStale, safeDiagnosticReport, stageTitles, type InstallationJob } from '../../utils/localInstallations';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { supabase } from '../../supabaseClient';

const date = (value?: string | null) => value ? new Date(value).toLocaleString('fa-IR') : 'ثبت نشده';
export default function LocalInstallationShow() {
  const { id } = useParams(); const query = useInstallationDetail(id); const navigate = useNavigate(); const { message } = App.useApp();
  const [busy, setBusy] = useState<string | null>(null); const [confirmOpen, setConfirmOpen] = useState(false); const [confirmation, setConfirmation] = useState('');
  const [ticketCode, setTicketCode] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false); const [reviewCode, setReviewCode] = useState('');
  const issueReportToken = async () => {
    if (busy) return; setBusy('report-token');
    try {
      const { token } = await installationRpc<{ token: string }>('issue_report_token', id);
      Modal.info({ title: 'کلید ارسال گزارش', content: <Space direction="vertical"><Typography.Paragraph>این کلید فقط همین‌بار نمایش داده می‌شود و کلید قبلی را باطل می‌کند. آن را در تنظیمات خصوصی سرور مقصد وارد کنید؛ داخل تیکت یا گزارش نفرستید.</Typography.Paragraph><Typography.Text copyable={{ text: token }}>کپی کلید خصوصی ارسال گزارش</Typography.Text></Space>, okText: 'بستن' });
    } catch (error) { message.error(toFaErrorMessage(error)); } finally { setBusy(null); }
  };
  const run = async (action: string, payload: unknown = {}) => {
    if (busy) return; setBusy(action);
    try { await installationRpc(action, id, payload); await query.refetch(); message.success('درخواست ثبت شد. نتیجه در سابقهٔ عملیات نمایش داده می‌شود.'); return true; }
    catch (e) { message.error(toFaErrorMessage(e)); return false; } finally { setBusy(null); }
  };
  const download = async (job: InstallationJob) => {
    setBusy(job.id);
    try {
      const { data, error } = await supabase.functions.invoke('local-installations', { body: { action: 'download', installation_id: id, job_id: job.id, org_id: query.access.data?.orgId } });
      if (error) throw error;
      if (!Array.isArray(data?.files) || !data.files.length) throw new Error(data?.message || 'آماده‌سازی لینک دریافت ناموفق بود.');
      const files = data.files.map((f: { title: string; url: string }) => {
        const url = new URL(f.url); if (url.protocol !== 'https:') throw new Error('لینک دریافت امن نیست.');
        return { title: f.title, url: url.href };
      });
      Modal.info({ title: 'دریافت فایل‌های نصب', content: <Space direction="vertical"><Typography.Paragraph>لینک‌ها دو دقیقه اعتبار دارند. کلید اعتماد انتشار را از مسیر مستقل دریافت کنید.</Typography.Paragraph>{files.map((f: { title: string; url: string }) => <a key={f.title} href={f.url} target="_blank" rel="noopener noreferrer">{f.title}</a>)}</Space>, okText: 'بستن' });
    } catch (e) { message.error(toFaErrorMessage(e)); } finally { setBusy(null); }
  };
  if (query.access.isLoading || (query.isLoading && query.access.data?.view)) return <Spin />;
  const error = query.error || query.access.error;
  if (error) return <Alert type="error" showIcon message={toFaErrorMessage(error)} action={<Button onClick={() => void query.refetch()}>تلاش دوباره</Button>} />;
  if (!query.access.data?.view) return <Alert type="warning" message="اجازهٔ مشاهدهٔ نصب‌های اختصاصی را ندارید." />;
  if (!query.data) return <Empty description="پروندهٔ نصب در دسترس نیست." />;
  const { installation: install, jobs, events, report, release, tickets, recovery_key_configured } = query.data;
  const access = query.access.data; const active = jobs.some(j => ['queued', 'running', 'needs_review'].includes(j.status));
  const canFinal = jobs.some(j => j.kind === 'export_trial' && j.status === 'succeeded' && j.result.restore_verified);
  const operations = <Table<InstallationJob> rowKey="id" dataSource={jobs} pagination={false} scroll={{ x: 750 }} columns={[
    { title: 'عملیات', dataIndex: 'kind', render: v => jobKinds[v] || 'عملیات نصب' },
    { title: 'وضعیت', dataIndex: 'status', render: v => <Tag color={v === 'failed' || v === 'needs_review' ? 'red' : v === 'succeeded' ? 'green' : 'blue'}>{jobStatuses[v] || 'نامشخص'}</Tag> },
    { title: 'مرحله', dataIndex: 'stage', render: v => stageTitles[v] || 'بررسی عملیات' },
    { title: 'شروع / پایان', render: (_, j) => <>{date(j.started_at || j.requested_at)}<br />{date(j.finished_at)}</> },
    { title: 'نتیجه', render: (_, j) => <Space direction="vertical"><span>{j.message}</span>{j.error_code && <Typography.Text code>{j.error_code}</Typography.Text>}{j.result.expires_at && <span>مهلت دریافت: {date(j.result.expires_at)}</span>}</Space> },
    { title: 'دریافت', render: (_, j) => j.status === 'succeeded' && (j.kind === 'prepare' ? access.build : access.export) ? <Button loading={busy === j.id} disabled={busy !== null} onClick={() => void download(j)}>دریافت بسته</Button> : null },
  ]} />;
  return <Space direction="vertical" size="large" className="w-full">
    <Card title={install.title} extra={<Button onClick={() => navigate('/saas_local_installations')}>فهرست نصب‌ها</Button>}>
      <Descriptions column={{ xs: 1, sm: 2 }} items={[
        { key: 'code', label: 'کد نصب', children: install.system_code }, { key: 'customer', label: 'مشتری', children: install.customer_name },
        { key: 'state', label: 'وضعیت', children: installationStatuses[install.status] }, { key: 'url', label: 'نشانی مقصد', children: <Typography.Text dir="ltr">{install.public_url}</Typography.Text> },
        { key: 'release', label: 'نسخهٔ جاری تأییدشده', children: release?.version || 'بستهٔ لوکال تأییدشده ثبت نشده است' },
        { key: 'telemetry', label: 'گزارش خودکار', children: install.telemetry_enabled ? 'با رضایت مشتری فعال' : 'خاموش' },
      ]} />
      {!release && <Alert className="my-4" type="warning" showIcon message="نسخهٔ مرکزی هنوز بستهٔ لوکال تأییدشده ندارد." description="آماده‌سازی پس از ثبت بسته‌ای که آزمون نصب آفلاین و دیتابیس را گذرانده باشد فعال می‌شود." />}
      {query.data.source_frozen && <Alert className="my-4" type="warning" showIcon message="نسخهٔ ابری این مشتری برای انتقال فقط‌خواندنی است." description="بازکردن نوشتن در ابر باید پس از اطمینان از توقف مقصد و بررسی اپراتور انجام شود." />}
      {install.install_kind === 'migration' && access.export && !recovery_key_configured && <Card size="small" title="کلید عمومی بازیابی مشتری" className="my-4">
        <Typography.Paragraph>مشتری کلید بازیابی را روی سرور خود می‌سازد و فقط بخش عمومی را تحویل می‌دهد. کلید خصوصی و رمز آن در مرکز ثبت نمی‌شوند.</Typography.Paragraph>
        <Input.TextArea dir="ltr" aria-label="کلید عمومی بازیابی" rows={4} value={publicKey} onChange={e => setPublicKey(e.target.value)} placeholder="-----BEGIN PUBLIC KEY-----" />
        <Button className="mt-3" disabled={!publicKey || !!busy} onClick={() => void run('set_recovery_key', { public_key: publicKey })}>ثبت کلید عمومی</Button>
      </Card>}
      <Space wrap>
        {access.build && <Button type="primary" disabled={!release || active || !!busy} loading={busy === 'prepare'} onClick={() => void run('prepare')}>آماده‌سازی بسته</Button>}
        {install.install_kind === 'migration' && access.export && <Button disabled={!release || !recovery_key_configured || active || !!busy} onClick={() => void run('export_trial')}>تهیهٔ خروجی آزمایشی</Button>}
        {install.install_kind === 'migration' && access.cutover && <Button danger disabled={!canFinal || active || !!busy} onClick={() => setConfirmOpen(true)}>انتقال نهایی</Button>}
        {access.build && jobs[0]?.status === 'failed' && jobs[0]?.kind === 'prepare' && <Button disabled={!!busy} onClick={() => void run('retry')}>تلاش دوبارهٔ آماده‌سازی</Button>}
        <Button onClick={() => void query.refetch()}>تازه‌سازی وضعیت</Button>
        {access.build && jobs.some(j => j.status === 'needs_review' && (j.kind === 'prepare' || access.cutover)) && <Button danger disabled={!!busy} onClick={() => setReviewOpen(true)}>ثبت بررسی اجرای قطع‌شده</Button>}
      </Space>
    </Card>
    <Tabs items={[
      { key: 'jobs', label: 'بسته‌ها و عملیات', children: <Card>{operations}
        {access.cutover && jobs.filter(j => j.kind.startsWith('export_') && j.status === 'succeeded' && !j.result.restore_verified).map(j => <Upload key={j.id} accept=".json" showUploadList={false} beforeUpload={file => {
          if (file.size > 32768) { message.error('فایل رسید بزرگ‌تر از حد مجاز است.'); return false; }
          setBusy('receipt');
          void file.text().then(text => JSON.parse(text)).then(async receipt => {
            const { data, error } = await supabase.functions.invoke('local-installations', { body: { action: 'receipt', installation_id: id, org_id: access.orgId, job_id: j.id, payload: receipt.payload, signature: receipt.signature } });
            if (error || !data?.success) throw error || new Error(data?.message || 'رسید بازیابی تأیید نشد.');
            await query.refetch(); message.success('بازیابی و ورود با رمز قبلی تأیید شد.');
          }).catch(e => message.error(toFaErrorMessage(e))).finally(() => setBusy(null)); return false;
        }}><Button className="mt-3" disabled={!!busy}>ورود رسید امضاشدهٔ {jobKinds[j.kind]}</Button></Upload>)}
      </Card> },
      { key: 'health', label: 'سلامت و عیب‌یابی', children: <Card>
        <Alert type="info" showIcon message="آخرین گزارش دریافتی، وضعیت زندهٔ سرور نیست." description="دریافت‌نشدن گزارش تازه به معنی خرابی نصب نیست. گزارش دستی را با دستور doctor روی سرور مشتری تهیه کنید." />
        {install.telemetry_enabled && access.build && <Button className="mt-3" disabled={!!busy} onClick={() => void issueReportToken()}>صدور کلید ارسال گزارش</Button>}
        {report ? <><Typography.Paragraph className="mt-4">دریافت گزارش: {date(report.received_at)} — تولید گزارش: {date(report.report.generated_at)} {reportIsStale(report.report.generated_at) && <Tag color="orange">گزارش قدیمی</Tag>}</Typography.Paragraph>
          <Descriptions items={[{ key: 'v', label: 'نسخه', children: report.report.version }, { key: 'disk', label: 'فضای آزاد', children: `${(report.report.disk_free_bytes / 1024 ** 3).toFixed(1)} گیگابایت` }, { key: 'backup', label: 'آخرین پشتیبان‌گیری', children: date(report.report.last_backup_at) }]} />
          <Table rowKey="name" size="small" pagination={false} dataSource={report.report.services} columns={[{ title: 'سرویس', dataIndex: 'name' }, { title: 'وضعیت', dataIndex: 'status', render: value => ({ healthy: 'سالم', unhealthy: 'ناسالم', running: 'در حال اجرا', stopped: 'متوقف', unknown: 'نامشخص' })[value as string] || 'نامشخص' }]} /></> : <Empty className="my-4" description="هنوز گزارشی دریافت نشده است." />}
        <Upload accept=".json" showUploadList={false} beforeUpload={file => {
          if (file.size > 65536) { message.error('حجم گزارش باید کمتر از ۶۴ کیلوبایت باشد.'); return false; }
          void file.text().then(text => safeDiagnosticReport(JSON.parse(text))).then(data => run('import_report', data)).catch(e => message.error(toFaErrorMessage(e))); return false;
        }}><Button className="mt-4" disabled={!!busy}>ورود گزارش عیب‌یابی</Button></Upload>
      </Card> },
      { key: 'history', label: 'سابقهٔ تغییرات', children: <Card><Timeline items={events.map(e => ({ children: <><Typography.Text type="secondary">{date(e.created_at)}</Typography.Text><div>{e.message}</div></> }))} /></Card> },
      { key: 'support', label: 'پشتیبانی', children: <Card><Space direction="vertical" className="w-full">
        <Typography.Paragraph>تیکت نصب را در پشتیبانی مشتری ایجاد کنید و کد آن را به این پرونده پیوند دهید.</Typography.Paragraph>
        <Space.Compact><Input value={ticketCode} onChange={e => setTicketCode(e.target.value)} placeholder="کد تیکت" /><Button disabled={!ticketCode || !!busy} onClick={() => void run('link_ticket_code', { code: ticketCode })}>پیوند تیکت</Button></Space.Compact>
        {tickets.map(t => <Button key={t.id} type="link" onClick={() => navigate(`/taze-system/tickets/${t.id}`)}>{t.code} — {t.subject}</Button>)}
        <Button onClick={() => navigate('/taze-system/tickets')}>پشتیبانی تازه سیستم</Button>
      </Space></Card> },
    ]} />
    <Modal open={confirmOpen} title="انتقال نهایی اطلاعات مشتری" okText="ثبت انتقال نهایی" cancelText="انصراف" confirmLoading={busy === 'export_final'} okButtonProps={{ danger: true, disabled: confirmation !== install.system_code }} onCancel={() => setConfirmOpen(false)} onOk={() => { void run('export_final', { confirmation }).then(ok => { if (ok) setConfirmOpen(false); }); }}>
      <Alert type="warning" showIcon message="تغییر اطلاعات و کارهای خودکار نسخهٔ ابری متوقف می‌شوند." description="ابتدا بازیابی آزمایشی باید بررسی شده باشد. کد نصب را برای تأیید وارد کنید." />
      <Typography.Paragraph className="mt-4">کد نصب: {install.system_code}</Typography.Paragraph><Input aria-label="تأیید کد نصب" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
    </Modal>
    <Modal open={reviewOpen} title="بررسی اجرای قطع‌شده" okText="ثبت بررسی" cancelText="انصراف" onCancel={() => setReviewOpen(false)} confirmLoading={busy === 'review_interrupted'} okButtonProps={{ danger: true, disabled: reviewCode !== install.system_code }} onOk={() => { void run('review_interrupted', { confirmation: reviewCode }).then(ok => { if (ok) setReviewOpen(false); }); }}>
      <Alert type="warning" showIcon message="ابتدا توقف worker، خروجی‌های موقت و وضعیت قفل انتقال را بررسی کنید." description="این اقدام فقط بررسی توقف را ثبت می‌کند. عملیات دوباره اجرا نمی‌شود و قفل نسخهٔ ابری باز نمی‌شود." />
      <Typography.Paragraph className="mt-3">کد نصب: {install.system_code}</Typography.Paragraph><Input aria-label="کد تأیید بررسی اجرا" value={reviewCode} onChange={e => setReviewCode(e.target.value)} />
    </Modal>
  </Space>;
}
