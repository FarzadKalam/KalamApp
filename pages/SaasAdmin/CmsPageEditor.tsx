import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button, Card, Form, Input, Select, Space, Spin, Tag, Breadcrumb, App,
} from 'antd';
import { ArrowRightOutlined, EyeOutlined, GlobalOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import BlockEditor, { type Block } from '../../components/cms/BlockEditor';
import SeoEditor, { type SeoData } from '../../components/cms/SeoEditor';
import { generateSlug } from '../../utils/seoHelpers';

interface CmsPage {
  id?: string;
  title: string;
  slug: string;
  content_blocks: Block[];
  status: 'draft' | 'published' | 'archived';
  seo_title: string;
  seo_description: string;
  og_image_url: string;
}

const emptyPage: CmsPage = {
  title: '', slug: '', content_blocks: [], status: 'published',
  seo_title: '', seo_description: '', og_image_url: '',
};

export default function CmsPageEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [page, setPage] = useState<CmsPage>(emptyPage);
  const [loading, setLoading] = useState(!!id && id !== 'new');
  const [saving, setSaving] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);

  const listPath = '/cms_pages';

  useEffect(() => {
    if (!id || id === 'new') return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from('cms_pages').select('*').eq('id', id).single();
        if (cancelled) return;
        if (error || !data) { message.error('خطا در بارگذاری'); navigate(listPath); return; }
        setPage({ ...emptyPage, ...data, content_blocks: data.content_blocks ?? [] });
        setSlugEdited(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleTitleChange = (title: string) => {
    setPage((p) => ({ ...p, title, slug: slugEdited ? p.slug : generateSlug(title) }));
  };

  const seoData: SeoData = {
    seo_title: page.seo_title,
    seo_description: page.seo_description,
    og_image_url: page.og_image_url,
    canonical_url: '',
    focus_keyword: '',
  };

  const contentText = useMemo(
    () => page.content_blocks.map((b: any) => b.content ?? '').join(' ').replace(/<[^>]+>/g, ' '),
    [page.content_blocks],
  );

  const save = async (publish?: boolean) => {
    if (!page.title.trim()) { message.warning('عنوان الزامی است'); return; }
    if (!page.slug.trim()) { message.warning('Slug الزامی است'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: page.title,
        slug: page.slug,
        content_blocks: page.content_blocks,
        status: publish ? 'published' : page.status,
        seo_title: page.seo_title || null,
        seo_description: page.seo_description || null,
        og_image_url: page.og_image_url || null,
      };
      const res = id && id !== 'new'
        ? await supabase.from('cms_pages').update(payload).eq('id', id).select('id').single()
        : await supabase.from('cms_pages').insert(payload).select('id').single();
      if (res.error) throw res.error;
      message.success(publish ? 'منتشر شد!' : 'ذخیره شد');
      if (!id || id === 'new') navigate(`/taze-system/page/${res.data.id}`);
      else setPage((p) => ({ ...p, status: publish ? 'published' : p.status }));
    } catch (e: any) {
      message.error(e?.message ?? 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><Spin size="large" /></div>;

  const statusColor: Record<string, string> = { draft: 'default', published: 'green', archived: 'red' };

  return (
    <div className="min-h-screen bg-gray-100 pb-16 dark:bg-dark-bg" dir="rtl">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3 dark:border-dark-border dark:bg-dark-surface">
        <Button type="text" icon={<ArrowRightOutlined />} onClick={() => navigate(listPath)} />
        <Breadcrumb items={[{ title: 'تازه سیستم' }, { title: 'صفحات سایت', href: listPath }, { title: page.title || 'صفحه جدید' }]} />
        <div className="flex-1" />
        <Tag color={statusColor[page.status] ?? 'default'}>
          {page.status === 'draft' ? 'پیش‌نویس' : page.status === 'published' ? 'منتشرشده' : 'آرشیو'}
        </Tag>
        <Space>
          <Button icon={<SaveOutlined />} onClick={() => save(false)} loading={saving}>ذخیره</Button>
          {page.status !== 'published' && (
            <Button type="primary" icon={<GlobalOutlined />} onClick={() => save(true)} loading={saving}>انتشار</Button>
          )}
          {page.slug && page.status === 'published' && (
            <Button icon={<EyeOutlined />} href={`/${page.slug}`} target="_blank">مشاهده</Button>
          )}
        </Space>
      </div>

      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <Card className="shadow-sm">
          <Form layout="vertical" size="large">
            <Form.Item label="عنوان" required>
              <Input value={page.title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="عنوان صفحه..." style={{ fontSize: 20, fontWeight: 700 }} />
            </Form.Item>
            <Form.Item label="Slug (URL)" extra={`/${page.slug || '...'}`}>
              <Input value={page.slug} onChange={(e) => { setSlugEdited(true); setPage((p) => ({ ...p, slug: e.target.value })); }} dir="ltr" prefix="/" />
            </Form.Item>
            <Form.Item label="وضعیت">
              <Select
                value={page.status}
                onChange={(v) => setPage((p) => ({ ...p, status: v }))}
                style={{ maxWidth: 220 }}
                options={[
                  { value: 'draft', label: 'پیش‌نویس' },
                  { value: 'published', label: 'منتشرشده' },
                  { value: 'archived', label: 'آرشیو' },
                ]}
              />
            </Form.Item>
          </Form>
        </Card>

        <Card className="shadow-sm" title="محتوا">
          <BlockEditor value={page.content_blocks} onChange={(blocks) => setPage((p) => ({ ...p, content_blocks: blocks }))} />
        </Card>

        <Card className="shadow-sm">
          <SeoEditor
            value={seoData}
            onChange={(data) => setPage((p) => ({ ...p, seo_title: data.seo_title, seo_description: data.seo_description, og_image_url: data.og_image_url }))}
            postTitle={page.title}
            postExcerpt=""
            postSlug={page.slug}
            postType="blog"
            readingTime={1}
            contentText={contentText}
          />
        </Card>
      </div>
    </div>
  );
}
