import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Input, List, Modal, Select, Space, Spin, Tag, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { renderSiteBlocks, validateSiteBlocks, type SiteBlock } from '../utils/tenantSiteBuilder';

const TenantSiteBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pages, setPages] = useState<any[]>([]);
  const [page, setPage] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [orgSlug, setOrgSlug] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [json, setJson] = useState('[\n  {"type":"heading","text":"صفحهٔ تازه"},\n  {"type":"paragraph","text":"محتوای خود را ویرایش کنید."}\n]');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('site_pages').select('*').order('updated_at', { ascending: false });
    if (error) { message.error('بارگذاری صفحات ناموفق بود.'); return; }
    setPages(data || []);
    const current = (data || []).find((row: any) => row.id === id) || (!id ? (data || [])[0] : null);
    setPage(current || null);
    if (current) {
      setTitle(current.title); setSlug(current.slug);
      const [{ data: draft }, { data: history }, { data: org }] = await Promise.all([
        current.draft_version_id ? supabase.from('site_page_versions').select('blocks').eq('id', current.draft_version_id).maybeSingle() : Promise.resolve({ data: null } as any),
        supabase.from('site_page_versions').select('id,version_number,created_at').eq('page_id', current.id).order('version_number', { ascending: false }),
        supabase.from('saas_org_settings').select('slug').eq('org_id', current.org_id).maybeSingle(),
      ]);
      if (draft?.blocks) setJson(JSON.stringify(draft.blocks, null, 2));
      setVersions(history || []);
      setOrgSlug(String(org?.slug || ''));
    } else { setTitle(''); setSlug(''); setVersions([]); setOrgSlug(''); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  let blocks: SiteBlock[] = [];
  let parseError = '';
  try { blocks = JSON.parse(json); parseError = validateSiteBlocks(blocks) || ''; } catch { parseError = 'JSON معتبر نیست.'; }
  const replaceBlocks = (next: SiteBlock[]) => setJson(JSON.stringify(next, null, 2));
  const saveDraft = async () => {
    if (parseError) { message.error(parseError); return; }
    if (!title.trim() || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) { message.error('عنوان و slug معتبر لازم است.'); return; }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      let target = page;
      if (!target) {
        const { data, error } = await supabase.from('site_pages').insert({ title: title.trim(), slug, created_by: userData.user?.id || null, updated_by: userData.user?.id || null }).select().single();
        if (error) throw error; target = data;
      } else {
        const { data, error } = await supabase.from('site_pages').update({ title: title.trim(), slug, updated_by: userData.user?.id || null, updated_at: new Date().toISOString() }).eq('id', target.id).select().single();
        if (error) throw error; target = data;
      }
      const { data: latest } = await supabase.from('site_page_versions').select('version_number').eq('page_id', target.id).order('version_number', { ascending: false }).limit(1).maybeSingle();
      const { data: version, error: versionError } = await supabase.from('site_page_versions').insert({ page_id: target.id, org_id: target.org_id, version_number: (latest?.version_number || 0) + 1, blocks, created_by: userData.user?.id || null }).select().single();
      if (versionError) throw versionError;
      const { error: updateError } = await supabase.from('site_pages').update({ draft_version_id: version.id, updated_at: new Date().toISOString() }).eq('id', target.id);
      if (updateError) throw updateError;
      message.success('نسخهٔ پیش‌نویس ذخیره شد.');
      navigate(`/site-builder/${target.id}`, { replace: true });
      await load();
    } catch (e: any) { message.error(e?.message || 'ذخیره ناموفق بود.'); }
    finally { setBusy(false); }
  };
  const publish = () => {
    if (!page?.draft_version_id) { message.warning('ابتدا پیش‌نویس را ذخیره کنید.'); return; }
    Modal.confirm({ title: 'انتشار دستی صفحه؟', content: 'نسخهٔ پیش‌نویس فعلی به‌صورت عمومی منتشر می‌شود. این کار فقط با تأیید صریح شما انجام می‌شود.', okText: 'انتشار', cancelText: 'انصراف', onOk: async () => {
      setBusy(true);
      const { data: userData } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const { error } = await supabase.from('site_pages').update({ published_version_id: page.draft_version_id, published_at: now, published_by: userData.user?.id || null, updated_by: userData.user?.id || null, updated_at: now }).eq('id', page.id);
      setBusy(false); if (error) { message.error(error.message); return; } message.success('نسخه منتشر شد.'); await load();
    } });
  };
  const restore = async (versionId: string) => {
    const { data, error } = await supabase.from('site_page_versions').select('blocks').eq('id', versionId).maybeSingle();
    if (error || !data) { message.error('نسخه در دسترس نیست.'); return; }
    setJson(JSON.stringify(data.blocks, null, 2));
  };
  return <div style={{ padding: 24, maxWidth: 1180, margin: 'auto' }} dir="rtl">
    <Typography.Title level={2}>سازندهٔ سایت سازمان</Typography.Title>
    <Alert type="info" showIcon message="پیش‌نویس‌ها عمومی نیستند. انتشار فقط با دکمهٔ انتشار و تأیید نهایی انجام می‌شود." style={{ marginBottom: 16 }} />
    <Space wrap style={{ marginBottom: 16 }}><Button type="primary" onClick={() => { navigate('/site-builder'); setPage(null); setTitle(''); setSlug(''); setJson('[\n  {"type":"heading","text":"صفحهٔ تازه"}\n]'); }}>صفحهٔ جدید</Button>{pages.map((item) => <Button key={item.id} type={item.id === page?.id ? 'primary' : 'default'} onClick={() => navigate(`/site-builder/${item.id}`)}>{item.title || item.slug}</Button>)}</Space>
    {busy && <Spin />}
    <Card title={page ? 'ویرایش صفحه' : 'صفحهٔ جدید'}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Input aria-label="عنوان صفحه" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان صفحه" />
        <Input aria-label="slug صفحه" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="slug (مثلاً درباره-ما)" />
        <Typography.Text strong>محتوای صفحه</Typography.Text>
        <Space wrap>
          <Button icon={<PlusOutlined />} onClick={() => replaceBlocks([...blocks, { type: 'heading', text: 'تیتر تازه', level: 2 }])}>افزودن تیتر</Button>
          <Button icon={<PlusOutlined />} onClick={() => replaceBlocks([...blocks, { type: 'paragraph', text: 'متن تازه' }])}>افزودن متن</Button>
          <Button icon={<PlusOutlined />} onClick={() => replaceBlocks([...blocks, { type: 'button', text: 'پیوند تازه', href: '/' }])}>افزودن پیوند</Button>
        </Space>
        {!parseError && blocks.map((block, index) => <Card size="small" key={index} title={`بلوک ${index + 1}`} extra={<Button danger type="text" aria-label={`حذف بلوک ${index + 1}`} icon={<DeleteOutlined />} onClick={() => replaceBlocks(blocks.filter((_, itemIndex) => itemIndex !== index))} />}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Select aria-label="نوع بلوک" value={block.type} options={[
              { value: 'heading', label: 'تیتر' }, { value: 'paragraph', label: 'متن' }, { value: 'button', label: 'پیوند' },
            ]} onChange={(type: SiteBlock['type']) => replaceBlocks(blocks.map((item, itemIndex) => itemIndex === index ? { ...item, type } : item))} />
            <Input.TextArea aria-label={`متن بلوک ${index + 1}`} rows={block.type === 'paragraph' ? 4 : 2} maxLength={10000} value={block.text}
              onChange={(event) => replaceBlocks(blocks.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} />
            {block.type === 'button' && <Input aria-label={`نشانی پیوند ${index + 1}`} dir="ltr" value={block.href || ''} placeholder="/about یا https://example.com"
              onChange={(event) => replaceBlocks(blocks.map((item, itemIndex) => itemIndex === index ? { ...item, href: event.target.value } : item))} />}
          </Space>
        </Card>)}
        <details>
          <summary style={{ cursor: 'pointer' }}>ویرایش پیشرفتهٔ JSON</summary>
          <Input.TextArea aria-label="JSON بلوک‌ها" rows={12} value={json} onChange={(e) => setJson(e.target.value)} style={{ fontFamily: 'monospace', direction: 'ltr', marginTop: 8 }} />
        </details>
        {parseError && <Alert type="error" message={parseError} />}
        <Space wrap><Button type="primary" loading={busy} onClick={() => void saveDraft()}>ذخیرهٔ پیش‌نویس</Button><Button onClick={() => setPreview(true)}>پیش‌نمایش محلی</Button><Button danger disabled={!page?.draft_version_id} onClick={publish}>انتشار دستی…</Button>{page?.published_version_id && <Tag color="green">منتشرشده</Tag>}</Space>
      </Space>
    </Card>
    {page?.published_version_id && orgSlug && <Alert type="success" showIcon style={{ marginTop: 16 }} message="صفحه منتشر شده است." description={<Typography.Link href={`/site/${encodeURIComponent(orgSlug)}/${encodeURIComponent(page.slug)}`} target="_blank" rel="noreferrer">بازکردن صفحهٔ عمومی</Typography.Link>} />}
    <Card title="تاریخچهٔ نسخه‌ها" style={{ marginTop: 16 }}><List dataSource={versions} locale={{ emptyText: 'هنوز نسخه‌ای ذخیره نشده است.' }} renderItem={(v) => <List.Item actions={[<Button key="restore" onClick={() => void restore(v.id)}>بارگذاری در ویرایشگر</Button>]}><span>نسخهٔ {v.version_number} — {new Date(v.created_at).toLocaleString('fa-IR')}</span></List.Item>} /></Card>
    <Modal open={preview} title={`پیش‌نمایش محلی: ${title}`} footer={<Button onClick={() => setPreview(false)}>بستن</Button>} onCancel={() => setPreview(false)}><div>{renderSiteBlocks(blocks)}</div><Typography.Text type="secondary">این پیش‌نمایش فقط از وضعیت فعلی ویرایشگر است و انتشار عمومی محسوب نمی‌شود.</Typography.Text></Modal>
  </div>;
};
export default TenantSiteBuilderPage;
