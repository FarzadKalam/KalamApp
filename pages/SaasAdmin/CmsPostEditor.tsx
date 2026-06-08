import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Button, Form, Input, Select, Switch, DatePicker, message,
  Spin, Space, Tag, Row, Col, Card, Breadcrumb, Divider, Upload,
} from 'antd';
import {
  SaveOutlined, EyeOutlined, ArrowRightOutlined,
  GlobalOutlined, EditOutlined, FileImageOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { supabase } from '../../supabaseClient';
import BlockEditor, { type Block } from '../../components/cms/BlockEditor';
import SeoEditor, { type SeoData } from '../../components/cms/SeoEditor';
import { calculateReadingTime, generateSlug } from '../../utils/seoHelpers';

type PostType = 'blog' | 'tutorial';

interface CmsPost {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content_blocks: Block[];
  cover_image_url: string;
  author_id: string | null;
  status: 'draft' | 'published' | 'archived';
  is_featured: boolean;
  published_at: string | null;
  reading_time_minutes: number;
  // tutorial-only
  difficulty_level?: string;
  duration_minutes?: number;
  series_id?: string | null;
  series_order?: number | null;
  // seo
  seo_title: string;
  seo_description: string;
  og_image_url: string;
  canonical_url: string;
  focus_keyword: string;
}

const emptyPost: CmsPost = {
  title: '', slug: '', excerpt: '', content_blocks: [],
  cover_image_url: '', author_id: null,
  status: 'draft', is_featured: false, published_at: null,
  reading_time_minutes: 1,
  seo_title: '', seo_description: '', og_image_url: '',
  canonical_url: '', focus_keyword: '',
};

// ──────────────────────────────────────────────────
export default function CmsPostEditor() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const postType: PostType = (searchParams.get('type') as PostType) ?? 'blog';
  const navigate = useNavigate();

  const [post, setPost] = useState<CmsPost>(emptyPost);
  const [loading, setLoading] = useState(!!id && id !== 'new');
  const [saving, setSaving] = useState(false);
  const [seriesList, setSeriesList] = useState<{ value: string; label: string }[]>([]);
  const [slugEdited, setSlugEdited] = useState(false);

  const tableName = postType === 'blog' ? 'cms_blog_posts' : 'cms_tutorial_posts';
  const typeLabel = postType === 'blog' ? 'پست بلاگ' : 'آموزش';
  const listPath = postType === 'blog' ? '/cms_blog_posts' : '/cms_tutorial_posts';

  // load existing post
  useEffect(() => {
    if (!id || id === 'new') return;
    setLoading(true);
    supabase.from(tableName).select('*').eq('id', id).single()
      .then(({ data, error }) => {
        if (error || !data) { message.error('خطا در بارگذاری'); navigate(listPath); return; }
        setPost({ ...emptyPost, ...data, content_blocks: data.content_blocks ?? [] });
        setSlugEdited(true);
      })
      .finally(() => setLoading(false));
  }, [id, tableName]);

  // load series list for tutorials
  useEffect(() => {
    if (postType !== 'tutorial') return;
    supabase.from('cms_tutorial_series').select('id, title').order('sort_order')
      .then(({ data }) => {
        setSeriesList((data ?? []).map(s => ({ value: s.id, label: s.title })));
      });
  }, [postType]);

  // auto-slug from title
  const handleTitleChange = (title: string) => {
    const next: Partial<CmsPost> = { title };
    if (!slugEdited) next.slug = generateSlug(title);
    setPost(p => ({ ...p, ...next }));
  };

  // reading time
  const readingTime = useMemo(
    () => calculateReadingTime(post.content_blocks as any),
    [post.content_blocks]
  );

  // content text for SEO analysis
  const contentText = useMemo(() => {
    return post.content_blocks
      .map((b: any) => b.content ?? b.items?.map((i: any) => i.text).join(' ') ?? '')
      .join(' ')
      .replace(/<[^>]+>/g, ' ');
  }, [post.content_blocks]);

  const seoData: SeoData = {
    seo_title: post.seo_title,
    seo_description: post.seo_description,
    og_image_url: post.og_image_url,
    canonical_url: post.canonical_url,
    focus_keyword: post.focus_keyword,
  };

  const handleSeoChange = (data: SeoData) => setPost(p => ({ ...p, ...data }));

  const handleSave = async (publish?: boolean) => {
    if (!post.title.trim()) { message.warning('عنوان الزامی است'); return; }
    if (!post.slug.trim()) { message.warning('Slug الزامی است'); return; }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content_blocks: post.content_blocks,
        cover_image_url: post.cover_image_url || null,
        author_id: post.author_id || null,
        status: publish ? 'published' : post.status,
        is_featured: post.is_featured,
        published_at: publish
          ? new Date().toISOString()
          : post.published_at || null,
        reading_time_minutes: readingTime,
        seo_title: post.seo_title || null,
        seo_description: post.seo_description || null,
        og_image_url: post.og_image_url || null,
        canonical_url: post.canonical_url || null,
        focus_keyword: post.focus_keyword || null,
      };

      if (postType === 'tutorial') {
        payload.difficulty_level = post.difficulty_level || null;
        payload.duration_minutes = post.duration_minutes || null;
        payload.series_id = post.series_id || null;
        payload.series_order = post.series_order || null;
      }

      let result;
      if (id && id !== 'new') {
        result = await supabase.from(tableName).update(payload).eq('id', id).select('id').single();
      } else {
        result = await supabase.from(tableName).insert(payload).select('id').single();
      }

      if (result.error) throw result.error;

      message.success(publish ? 'منتشر شد!' : 'ذخیره شد');
      if (!id || id === 'new') {
        navigate(`/taze-system/${postType === 'blog' ? 'blog' : 'tutorials'}/${result.data.id}`);
      } else {
        setPost(p => ({ ...p, status: publish ? 'published' : p.status, reading_time_minutes: readingTime }));
      }
    } catch (e: any) {
      message.error(e?.message ?? 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Spin size="large" tip="در حال بارگذاری..." />
    </div>
  );

  const statusColor: Record<string, string> = {
    draft: 'default', published: 'green', archived: 'red',
  };

  return (
    <div className="min-h-screen bg-zinc-50 pb-16" dir="rtl">
      {/* Topbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-6 py-3 flex items-center gap-3">
        <Button
          type="text"
          icon={<ArrowRightOutlined />}
          onClick={() => navigate(listPath)}
        />
        <Breadcrumb
          items={[
            { title: 'تازه سیستم' },
            { title: typeLabel + 'ها', href: listPath },
            { title: post.title || `${typeLabel} جدید` },
          ]}
        />
        <div className="flex-1" />
        <Tag color={statusColor[post.status] ?? 'default'}>
          {post.status === 'draft' ? 'پیش‌نویس' : post.status === 'published' ? 'منتشرشده' : 'آرشیو'}
        </Tag>
        <Space>
          <Button
            icon={<SaveOutlined />}
            onClick={() => handleSave(false)}
            loading={saving}
          >
            ذخیره
          </Button>
          {post.status !== 'published' && (
            <Button
              type="primary"
              icon={<GlobalOutlined />}
              onClick={() => handleSave(true)}
              loading={saving}
            >
              انتشار
            </Button>
          )}
          {post.slug && post.status === 'published' && (
            <Button
              icon={<EyeOutlined />}
              href={`/${postType === 'blog' ? 'blog' : 'learn'}/${post.slug}`}
              target="_blank"
            >
              مشاهده
            </Button>
          )}
        </Space>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Row gutter={24} align="top">
          {/* Main content area */}
          <Col xs={24} lg={16}>
            <div className="space-y-4">
              {/* Title + slug */}
              <Card bordered={false} className="shadow-sm">
                <Form layout="vertical" size="large">
                  <Form.Item label="عنوان" required>
                    <Input
                      value={post.title}
                      onChange={e => handleTitleChange(e.target.value)}
                      placeholder={`عنوان ${typeLabel}...`}
                      style={{ fontSize: 20, fontWeight: 700 }}
                    />
                  </Form.Item>
                  <Form.Item label="Slug (URL)" extra={`/${postType === 'blog' ? 'blog' : 'learn'}/${post.slug || '...'}`}>
                    <Input
                      value={post.slug}
                      onChange={e => { setSlugEdited(true); setPost(p => ({ ...p, slug: e.target.value })); }}
                      placeholder="blog-post-slug"
                      dir="ltr"
                      prefix="/"
                    />
                  </Form.Item>
                  <Form.Item label="خلاصه (excerpt)">
                    <Input.TextArea
                      value={post.excerpt}
                      onChange={e => setPost(p => ({ ...p, excerpt: e.target.value }))}
                      placeholder="خلاصه کوتاه برای نمایش در لیست و SEO..."
                      rows={3}
                    />
                  </Form.Item>
                </Form>
              </Card>

              {/* Block editor */}
              <Card
                bordered={false}
                className="shadow-sm"
                title={<span className="font-medium">محتوا</span>}
                extra={
                  <span className="text-xs text-zinc-400">
                    زمان مطالعه: ~{readingTime} دقیقه
                  </span>
                }
              >
                <BlockEditor
                  value={post.content_blocks}
                  onChange={blocks => setPost(p => ({ ...p, content_blocks: blocks }))}
                />
              </Card>

              {/* SEO */}
              <Card bordered={false} className="shadow-sm">
                <SeoEditor
                  value={seoData}
                  onChange={handleSeoChange}
                  postTitle={post.title}
                  postExcerpt={post.excerpt}
                  postSlug={post.slug}
                  postType={postType}
                  readingTime={readingTime}
                  contentText={contentText}
                />
              </Card>
            </div>
          </Col>

          {/* Sidebar */}
          <Col xs={24} lg={8}>
            <div className="space-y-4 sticky top-20">
              {/* Publish settings */}
              <Card
                bordered={false}
                className="shadow-sm"
                title={<span className="font-medium">تنظیمات انتشار</span>}
              >
                <Form layout="vertical" size="middle">
                  <Form.Item label="وضعیت">
                    <Select
                      value={post.status}
                      onChange={v => setPost(p => ({ ...p, status: v }))}
                      options={[
                        { value: 'draft', label: 'پیش‌نویس' },
                        { value: 'published', label: 'منتشرشده' },
                        { value: 'archived', label: 'آرشیو' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item label="تاریخ انتشار">
                    <DatePicker
                      style={{ width: '100%' }}
                      value={post.published_at ? dayjs(post.published_at) : null}
                      onChange={d => setPost(p => ({ ...p, published_at: d?.toISOString() ?? null }))}
                      showTime
                    />
                  </Form.Item>
                  <Form.Item label="پست ویژه (نمایش در اسلایدر)">
                    <Switch
                      checked={post.is_featured}
                      onChange={v => setPost(p => ({ ...p, is_featured: v }))}
                      checkedChildren="ویژه"
                      unCheckedChildren="عادی"
                    />
                  </Form.Item>
                </Form>
              </Card>

              {/* Cover image */}
              <Card
                bordered={false}
                className="shadow-sm"
                title={<span className="font-medium">تصویر کاور</span>}
              >
                {post.cover_image_url && (
                  <img
                    src={post.cover_image_url}
                    alt="cover"
                    className="w-full h-32 object-cover rounded-xl mb-3"
                  />
                )}
                <Input
                  value={post.cover_image_url}
                  onChange={e => setPost(p => ({ ...p, cover_image_url: e.target.value }))}
                  placeholder="URL تصویر کاور..."
                  prefix={<FileImageOutlined className="text-zinc-400" />}
                />
              </Card>

              {/* Tutorial-specific */}
              {postType === 'tutorial' && (
                <Card
                  bordered={false}
                  className="shadow-sm"
                  title={<span className="font-medium">تنظیمات آموزش</span>}
                >
                  <Form layout="vertical" size="middle">
                    <Form.Item label="سطح دشواری">
                      <Select
                        value={post.difficulty_level}
                        onChange={v => setPost(p => ({ ...p, difficulty_level: v }))}
                        placeholder="انتخاب سطح..."
                        allowClear
                        options={[
                          { value: 'beginner', label: 'مبتدی' },
                          { value: 'intermediate', label: 'متوسط' },
                          { value: 'advanced', label: 'پیشرفته' },
                          { value: 'expert', label: 'حرفه‌ای' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item label="مدت آموزش (دقیقه)">
                      <Input
                        type="number"
                        value={post.duration_minutes ?? ''}
                        onChange={e => setPost(p => ({ ...p, duration_minutes: +e.target.value || undefined }))}
                        placeholder="مثلاً: ۳۰"
                      />
                    </Form.Item>
                    <Form.Item label="دوره آموزشی">
                      <Select
                        value={post.series_id ?? undefined}
                        onChange={v => setPost(p => ({ ...p, series_id: v ?? null }))}
                        placeholder="انتخاب دوره (اختیاری)..."
                        allowClear
                        options={seriesList}
                      />
                    </Form.Item>
                    {post.series_id && (
                      <Form.Item label="ترتیب در دوره">
                        <Input
                          type="number"
                          value={post.series_order ?? ''}
                          onChange={e => setPost(p => ({ ...p, series_order: +e.target.value || null }))}
                          placeholder="۱، ۲، ۳..."
                        />
                      </Form.Item>
                    )}
                  </Form>
                </Card>
              )}
            </div>
          </Col>
        </Row>
      </div>
    </div>
  );
}
