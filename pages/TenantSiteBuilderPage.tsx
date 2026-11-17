import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Input, List, Modal, Select, Space, Spin, Tag, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { renderSiteBlocks, validateSiteBlocks, type SiteBlock } from '../utils/tenantSiteBuilder';

const NEW_PAGE_JSON = '[\n  {"type":"heading","text":"صفحهٔ تازه","level":2},\n  {"type":"paragraph","text":"محتوای خود را ویرایش کنید."}\n]';

const TenantSiteBuilderPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [pages, setPages] = useState<any[]>([]);
  const [page, setPage] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [orgSlug, setOrgSlug] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [json, setJson] = useState(NEW_PAGE_JSON);
  const [savedSnapshot, setSavedSnapshot] = useState({ title: '', slug: '', json: NEW_PAGE_JSON });
  const [publishedSlug, setPublishedSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('site_pages').select('*').order('updated_at', { ascending: false });
    if (error) { message.error('بارگذاری صفحات ناموفق بود.'); return; }
    setPages(data || []);
    const current = id ? (data || []).find((row: any) => row.id === id) : null;
    setPage(current || null);
    if (current) {
      const [{ data: draft }, { data: history }, { data: org }, { data: published }] = await Promise.all([
        current.draft_version_id ? supabase.from('site_page_versions').select('blocks').eq('id', current.draft_version_id).maybeSingle() : Promise.resolve({ data: null } as any),
        supabase.from('site_page_versions').select('id,version_number,title,slug,created_at').eq('page_id', current.id).order('version_number', { ascending: false }),
        supabase.from('saas_org_settings').select('slug').eq('org_id', current.org_id).maybeSingle(),
        current.published_version_id ? supabase.from('site_page_versions').select('title,slug').eq('id', current.published_version_id).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      const nextTitle = String(current.title || '');
      const nextSlug = String(current.slug || '');
      const nextJson = draft?.blocks ? JSON.stringify(draft.blocks, null, 2) : NEW_PAGE_JSON;
      setTitle(nextTitle); setSlug(nextSlug); setJson(nextJson);
      setSavedSnapshot({ title: nextTitle, slug: nextSlug, json: nextJson });
      setVersions(history || []);
      setOrgSlug(String(org?.slug || ''));
      setPublishedSlug(String(published?.slug || ''));
    } else {
      setTitle(''); setSlug(''); setJson(NEW_PAGE_JSON); setSavedSnapshot({ title: '', slug: '', json: NEW_PAGE_JSON });
      setVersions([]); setOrgSlug(''); setPublishedSlug('');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  let blocks: SiteBlock[] = [];
  let parseError = '';
  try { blocks = JSON.parse(json); parseError = validateSiteBlocks(blocks) || ''; } catch { parseError = 'JSON معتبر نیست.'; }
  const hasUnsavedChanges = title !== savedSnapshot.title || slug !== savedSnapshot.slug || json !== savedSnapshot.json;
  const replaceBlocks = (next: SiteBlock[]) => setJson(JSON.stringify(next, null, 2));
  const goTo = (path: string) => {
    const proceed = () => navigate(path);
    if (hasUnsavedChanges) {
      Modal.confirm({ title: 'تغییرات ذخیره‌نشده', content: 'اگر خارج شوید، تغییرات فعلی از دست می‌روند.', okText: 'خروج بدون ذخیره', cancelText: 'بازگشت', onOk: proceed });
      return;
    }
    proceed();
  };
  const startNewPage = () => {
    const proceed = () => {
      setPage(null); setTitle(''); setSlug(''); setJson(NEW_PAGE_JSON);
      setSavedSnapshot({ title: '', slug: '', json: NEW_PAGE_JSON }); setVersions([]); setOrgSlug(''); setPublishedSlug('');
      navigate('/site-builder');
    };
    if (hasUnsavedChanges) {
      Modal.confirm({ title: 'تغییرات ذخیره‌نشده', content: 'صفحهٔ جدید باز شود و تغییرات فعلی کنار گذاشته شود؟', okText: 'صفحهٔ جدید', cancelText: 'بازگشت', onOk: proceed });
      return;
    }
    proceed();
  };
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [hasUnsavedChanges]);
  const saveDraft = async () => {
    if (parseError) { message.error(parseError); return; }
    if (!title.trim() || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) { message.error('عنوان و slug معتبر لازم است.'); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('save_tenant_site_page_draft', {
        p_page_id: page?.id || null, p_slug: slug, p_title: title.trim(), p_blocks: blocks,
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (!result?.page_id) throw new Error('پاسخ ذخیرهٔ پیش‌نویس معتبر نیست.');
      setTitle(title.trim());
      setSavedSnapshot({ title: title.trim(), slug, json: JSON.stringify(blocks, null, 2) });
      message.success('نسخهٔ پیش‌نویس ذخیره شد.');
      if (result.page_id !== id) navigate(`/site-builder/${result.page_id}`, { replace: true });
      else await load();
    } catch (e: any) { message.error(e?.message || 'ذخیره ناموفق بود.'); }
    finally { setBusy(false); }
  };
  const publish = () => {
    if (!page?.draft_version_id) { message.warning('ابتدا پیش‌نویس را ذخیره کنید.'); return; }
    Modal.confirm({ title: 'انتشار دستی صفحه؟', content: 'نسخهٔ پیش‌نویس فعلی به‌صورت عمومی منتشر می‌شود. این کار فقط با تأیید صریح شما انجام می‌شود.', okText: 'انتشار', cancelText: 'انصراف', onOk: async () => {
      setBusy(true);
      try {
        const { error } = await supabase.rpc('publish_tenant_site_page', { p_page_id: page.id });
        if (error) throw error;
        message.success('نسخه منتشر شد.');
        await load();
      } catch (error: any) { message.error(error?.message || 'انتشار صفحه ناموفق بود.'); }
      finally { setBusy(false); }
    } });
  };
  const restore = async (versionId: string) => {
    const { data, error } = await supabase.from('site_page_versions').select('title,slug,blocks').eq('id', versionId).maybeSingle();
    if (error || !data) { message.error('نسخه در دسترس نیست.'); return; }
    setTitle(data.title); setSlug(data.slug);
    setJson(JSON.stringify(data.blocks, null, 2));
  };
  return <div style={{ padding: 24, maxWidth: 1180, margin: 'auto' }} dir="rtl">
    <Typography.Title level={2}>سازندهٔ سایت سازمان</Typography.Title>
    <Alert type="info" showIcon message="پیش‌نویس‌ها عمومی نیستند. انتشار فقط با دکمهٔ انتشار و تأیید نهایی انجام می‌شود." style={{ marginBottom: 16 }} />
    <Space wrap style={{ marginBottom: 16 }}><Button type="primary" onClick={startNewPage}>صفحهٔ جدید</Button>{pages.map((item) => <Button key={item.id} type={item.id === page?.id ? 'primary' : 'default'} onClick={() => goTo(`/site-builder/${item.id}`)}>{item.title || item.slug}</Button>)}</Space>
    {busy && <Spin />}
    <Card title={page ? 'ویرایش صفحه' : 'صفحهٔ جدید'}>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Input aria-label="عنوان صفحه" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان صفحه" />
        <Input aria-label="slug صفحه" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="slug (مثلاً about-us)" />
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
        <Space wrap><Button type="primary" loading={busy} onClick={() => void saveDraft()}>ذخیرهٔ پیش‌نویس</Button><Button disabled={Boolean(parseError)} onClick={() => setPreview(true)}>پیش‌نمایش محلی</Button><Button danger disabled={!page?.draft_version_id || busy || hasUnsavedChanges} onClick={publish}>انتشار دستی…</Button>{page?.published_version_id && <Tag color="green">منتشرشده</Tag>}</Space>
      </Space>
    </Card>
    {page?.published_version_id && orgSlug && publishedSlug && <Alert type="success" showIcon style={{ marginTop: 16 }} message="نسخهٔ منتشرشده تا انتشار بعدی جداگانه حفظ می‌شود." description={<Typography.Link href={`/site/${encodeURIComponent(orgSlug)}/${encodeURIComponent(publishedSlug)}`} target="_blank" rel="noreferrer">بازکردن نسخهٔ عمومی منتشرشده</Typography.Link>} />}
    <Card title="تاریخچهٔ نسخه‌ها" style={{ marginTop: 16 }}><List dataSource={versions} locale={{ emptyText: 'هنوز نسخه‌ای ذخیره نشده است.' }} renderItem={(v) => <List.Item actions={[<Button key="restore" onClick={() => void restore(v.id)}>بارگذاری در ویرایشگر</Button>]}><span>نسخهٔ {v.version_number}: {v.title || v.slug} — {new Date(v.created_at).toLocaleString('fa-IR')}</span></List.Item>} /></Card>
    <Modal open={preview} title={`پیش‌نمایش محلی: ${title}`} footer={<Button onClick={() => setPreview(false)}>بستن</Button>} onCancel={() => setPreview(false)}><div>{renderSiteBlocks(blocks)}</div><Typography.Text type="secondary">این پیش‌نمایش فقط از وضعیت فعلی ویرایشگر است و انتشار عمومی محسوب نمی‌شود.</Typography.Text></Modal>
  </div>;
};
export default TenantSiteBuilderPage;
