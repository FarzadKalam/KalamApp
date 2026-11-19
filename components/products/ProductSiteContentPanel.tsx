import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, Col, Form, Input, Modal, Progress, Row, Space, Spin, Tag, Typography } from 'antd';
import { BulbOutlined, EyeOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { getProductSiteSeoChecklist } from '../../utils/productSiteSeoChecklist';
import { richTextToPlainText } from '../../utils/richText';
import { FieldType, type ModuleField } from '../../types';
import { normalizeProductSiteSlug } from '../../supabase/functions/_shared/product-site-slug';
import RecordFilesManager from '../RecordFilesManager';
import RichTextContent from '../RichTextContent';
import SmartFieldRenderer from '../SmartFieldRenderer';
import ProductWooSyncTable from './ProductWooSyncTable';

const { Text, Title } = Typography;

interface ProductSiteContent {
  id?: string;
  org_id: string;
  product_id: string;
  title: string;
  short_description: string;
  description: string;
  slug: string;
  seo_title: string;
  seo_description: string;
  focus_keyword: string;
  site_image_url: string;
  site_image_alt: string;
  status: 'draft' | 'review';
  updated_at?: string;
}

interface ProductSiteContentPanelProps {
  product: Record<string, any>;
  canEdit: boolean;
}

const blank = (product: Record<string, any>): ProductSiteContent => ({
  org_id: String(product.org_id || ''),
  product_id: String(product.id || ''),
  title: String(product.name || ''),
  short_description: '',
  description: '',
  slug: '',
  seo_title: '',
  seo_description: '',
  focus_keyword: '',
  site_image_url: '',
  site_image_alt: '',
  status: 'draft',
});
const contentFingerprint = (content: ProductSiteContent) => JSON.stringify([
  content.title, content.short_description, content.description, content.slug,
  content.seo_title, content.seo_description, content.focus_keyword, content.site_image_url, content.site_image_alt,
]);
const displaySlug = (slug: string) => {
  try { return decodeURIComponent(slug); } catch { return slug; }
};
const textFields = {
  title: { key: 'title', type: FieldType.TEXT, labels: { fa: 'عنوان محصول در سایت' } },
  short_description: { key: 'short_description', type: FieldType.LONG_TEXT, labels: { fa: 'توضیح کوتاه' } },
  description: { key: 'description', type: FieldType.SUPER_LONG_TEXT, labels: { fa: 'توضیحات کامل' } },
  seo_title: { key: 'seo_title', type: FieldType.TEXT, labels: { fa: 'عنوان سئو' } },
  seo_description: { key: 'seo_description', type: FieldType.TEXT, labels: { fa: 'توضیح متا' } },
  focus_keyword: { key: 'focus_keyword', type: FieldType.TEXT, labels: { fa: 'عبارت کلیدی پیشنهادی' } },
} satisfies Record<string, ModuleField>;

export default function ProductSiteContentPanel({ product, canEdit }: ProductSiteContentPanelProps) {
  const { message, modal } = App.useApp();
  const [value, setValue] = useState<ProductSiteContent>(() => blank(product));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState<Partial<ProductSiteContent> | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState(() => contentFingerprint(blank(product)));
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [syncingContent, setSyncingContent] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const currentProduct = useRef(product);
  currentProduct.current = product;
  const editable = canEdit && !loading && !loadFailed && !saving && !syncingContent;

  const load = useCallback(async (showSpinner = true) => {
    if (!product?.id || !product?.org_id) { setLoading(false); return; }
    if (showSpinner) setLoading(true);
    setLoadFailed(false);
    try {
      const { data, error } = await supabase.from('product_site_content')
        .select('id,org_id,product_id,title,short_description,description,slug,seo_title,seo_description,focus_keyword,site_image_url,site_image_alt,status,updated_at')
        .eq('org_id', product.org_id).eq('product_id', product.id).maybeSingle();
      if (error) throw error;
      const nextValue = { ...blank(currentProduct.current), ...data, slug: displaySlug(data?.slug || '') };
      setValue(nextValue);
      setSavedFingerprint(contentFingerprint(nextValue));
    } catch (error: any) {
      setLoadFailed(true);
      message.error(error?.message || 'بارگذاری محتوای سایت محصول ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [message, product?.id, product?.org_id]);

  useEffect(() => { void load(); }, [load]);

  const checklist = useMemo(() => getProductSiteSeoChecklist({
    title: value.title,
    shortDescription: richTextToPlainText(value.short_description),
    description: richTextToPlainText(value.description),
    slug: value.slug,
    seoTitle: value.seo_title,
    seoDescription: value.seo_description,
    imageUrl: value.site_image_url,
    imageAlt: value.site_image_alt,
    focusKeyword: value.focus_keyword,
  }), [value]);
  const score = checklist.length ? Math.round(checklist.filter((item) => item.passed).length * 100 / checklist.length) : 0;

  const update = (key: keyof ProductSiteContent, next: string) => setValue((previous) => ({ ...previous, [key]: next }));
  const renderText = (field: keyof typeof textFields) => (
    <Form.Item label={textFields[field].labels.fa}>
      <SmartFieldRenderer field={textFields[field]} standalone forceEditMode={editable}
        moduleId="products" recordId={String(product.id)} allValues={product}
        value={value[field]} onChange={(next) => update(field, String(next ?? ''))} />
    </Form.Item>
  );
  const hasUnsavedChanges = contentFingerprint(value) !== savedFingerprint;

  const requestAiSuggestion = async () => {
    if (!editable || !product?.id) return;
    modal.confirm({
      title: 'دریافت پیشنهاد متنی با هوش مصنوعی',
      content: 'نام و چند ویژگی غیرمالی محصول برای ساخت پیش‌نویس به سرویس هوش مصنوعی سازمان فرستاده می‌شود. متن فقط پیشنهاد است؛ چیزی ذخیره یا منتشر نمی‌شود.',
      okText: 'ادامه',
      cancelText: 'انصراف',
      onOk: async () => {
        setGenerating(true);
        try {
          const { data, error } = await supabase.functions.invoke('ai-assistant', {
            body: { action: 'suggest_product_site_content', productId: product.id },
          });
          if (error) throw error;
          if (!data?.success || !data?.suggestion) throw new Error(data?.message || 'پیشنهاد متنی دریافت نشد.');
          setSuggestion(data.suggestion);
          setSuggestionOpen(true);
          message.success('پیشنهاد آماده شد؛ برای افزودن به فرم، آن را بازبینی کنید.');
        } catch (error: any) {
          message.error(error?.message || 'تولید پیشنهاد ناموفق بود.');
        } finally {
          setGenerating(false);
        }
      },
    });
  };

  const applySuggestion = () => {
    if (!suggestion || !editable) return;
    setValue((previous) => ({
      ...previous,
      short_description: suggestion.short_description ?? previous.short_description,
      description: suggestion.description ?? previous.description,
      seo_title: suggestion.seo_title ?? previous.seo_title,
      seo_description: suggestion.seo_description ?? previous.seo_description,
      slug: suggestion.slug ?? previous.slug,
      focus_keyword: suggestion.focus_keyword ?? previous.focus_keyword,
    }));
    setSuggestionOpen(false);
  };

  const saveDraft = async () => {
    if (!editable) return;
    if (!value.org_id || !value.product_id) { message.error('شناسهٔ سازمان یا محصول معتبر نیست.'); return; }
    let slug: string;
    try { slug = normalizeProductSiteSlug(value.slug); } catch {
      message.error('نشانی کوتاه باید شامل حروف، عدد و خط تیره باشد.');
      return;
    }
    if (value.title.length > 180 || value.seo_title.length > 180 || value.seo_description.length > 320
        || value.focus_keyword.length > 120 || richTextToPlainText(value.short_description).trim().length > 800
        || richTextToPlainText(value.description).trim().length > 12000 || value.short_description.length > 8000
        || value.description.length > 60000) {
      message.error('طول عنوان، توضیح کوتاه، توضیحات یا متن سئو بیش از اندازهٔ مجاز است.');
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { id, updated_at, ...fields } = value;
      const payload = {
        ...fields,
        slug,
        status: 'draft' as const,
        updated_by: userData.user?.id || null,
        updated_at: new Date().toISOString(),
      };
      const table = supabase.from('product_site_content');
      const write = id && updated_at
        ? table.update(payload).eq('org_id', value.org_id).eq('product_id', value.product_id).eq('updated_at', updated_at)
        : table.insert(payload);
      const { data, error } = await write.select('*').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('پیش‌نویس در جای دیگری تغییر کرده است. پیش از بارگذاری دوباره، متن فعلی را نگه دارید.');
      const nextValue = { ...blank(product), ...data, slug: displaySlug(data.slug) };
      setValue(nextValue);
      setSavedFingerprint(contentFingerprint(nextValue));
      message.success('پیش‌نویس محتوای سایت ذخیره شد؛ چیزی منتشر نشده است.');
    } catch (error: any) {
      message.error(error?.message || 'ذخیرهٔ پیش‌نویس ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Card className="my-4"><div className="flex justify-center py-8"><Spin /></div></Card>;

  return (
    <Card className="my-4" title={<Space><span>محتوای سایت و SEO محصول</span><Tag color="blue">پیش‌نویس</Tag></Space>}>
      {loadFailed && <Alert className="mb-4" type="error" showIcon message="پیش‌نویس بارگذاری نشد." action={<Button onClick={() => void load()}>بارگذاری دوباره</Button>} />}
      <Row gutter={[16, 8]}>
        <Col xs={24} md={12}>
          <Form layout="vertical">
            {renderText('title')}
            {renderText('short_description')}
            {renderText('description')}
            <Form.Item label="تصویر مخصوص سایت">
              <Space.Compact style={{ width: '100%' }}>
                <Input dir="ltr" maxLength={2000} value={value.site_image_url} onChange={(event) => update('site_image_url', event.target.value)} disabled={!editable} placeholder="https://…" />
                <Button disabled={!editable || !product?.id} onClick={() => setFileManagerOpen(true)}>انتخاب از فایل‌منیجر محصول</Button>
              </Space.Compact>
              <Text type="secondary">برای ارسال تصویر به فروشگاه، فایل باید از نشانی عمومی HTTPS قابل‌دسترسی باشد.</Text>
            </Form.Item>
            <Form.Item label="متن جایگزین تصویر"><Input maxLength={250} value={value.site_image_alt} onChange={(event) => update('site_image_alt', event.target.value)} disabled={!editable} /></Form.Item>
          </Form>
        </Col>
        <Col xs={24} md={12}>
          <Form layout="vertical">
            <Form.Item label="نشانی کوتاه"><Input dir="ltr" maxLength={180} value={value.slug} onChange={(event) => update('slug', event.target.value)} disabled={!editable} placeholder="sample-product" /></Form.Item>
            {renderText('seo_title')}
            {renderText('seo_description')}
            {renderText('focus_keyword')}
          </Form>
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="mb-2 flex items-center justify-between"><Text strong>چک‌لیست آمادگی SEO KalamApp</Text><Text>{score}%</Text></div>
            <Progress percent={score} showInfo={false} />
            <ul className="mt-3 space-y-2 text-sm">
              {checklist.map((item) => <li key={item.key} className="flex gap-2"><span aria-hidden="true">{item.passed ? '✓' : '○'}</span><span><b>{item.label}</b><br /><Text type="secondary">{item.passed ? 'تکمیل شده' : item.hint}</Text></span></li>)}
            </ul>
            <Text className="mt-3 block" type="secondary">این چک‌لیست راهنمای داخلی است؛ امتیاز رسمی Google، Yoast یا Rank Math و تضمین رتبه نیست.</Text>
          </div>
        </Col>
      </Row>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button icon={<BulbOutlined />} onClick={() => void requestAiSuggestion()} loading={generating} disabled={!editable}>پیشنهاد توضیحات با هوش مصنوعی</Button>
        <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)} disabled={loadFailed}>پیش‌نمایش پیش‌نویس</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={() => void saveDraft()} loading={saving} disabled={!editable}>ذخیرهٔ پیش‌نویس</Button>
      </div>
      <ProductWooSyncTable orgId={String(product.org_id)} productId={String(product.id)} canEdit={canEdit && !loadFailed}
        hasUnsavedChanges={hasUnsavedChanges} saving={saving} revision={value.updated_at}
        onReceived={() => load(false)} onBusyChange={setSyncingContent} />
      <RecordFilesManager open={fileManagerOpen} onClose={() => setFileManagerOpen(false)} moduleId="products"
        recordId={String(product?.id || '')} mainImage={value.site_image_url}
        onMainImageChange={(url) => update('site_image_url', url || '')}
        canEdit={editable} canUpload={editable} canDelete={false} />
      <Modal open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={<Button onClick={() => setPreviewOpen(false)}>بستن</Button>} title="پیش‌نمایش محتوای محصول" width={720}>
        <article dir="rtl" className="mx-auto max-w-2xl">
          {value.site_image_url ? <img src={value.site_image_url} alt={value.site_image_alt} className="mb-4 max-h-72 w-full rounded-xl object-cover" /> : null}
          <Title level={2}>{value.title || 'عنوان محصول'}</Title>
          {value.short_description ? <RichTextContent value={value.short_description} className="text-base font-medium" /> : null}
          {value.description ? <RichTextContent value={value.description} className="leading-8" /> : <Text type="secondary">توضیحات کامل هنوز وارد نشده است.</Text>}
          {value.slug ? <Text type="secondary" dir="ltr" className="block">/{value.slug}</Text> : null}
        </article>
      </Modal>
      <Modal open={suggestionOpen} onCancel={() => setSuggestionOpen(false)} onOk={applySuggestion}
        okText="اعمال پیشنهاد در فرم" cancelText="رد کردن" title="بازبینی پیشنهاد هوش مصنوعی" width={720}>
        <Alert className="mb-3" type="warning" showIcon message="متن را پیش از ذخیره بررسی کنید؛ AI ممکن است اشتباه کند. این کار هنوز ذخیره یا منتشر نمی‌کند." />
        <div dir="rtl" className="space-y-3">
          {suggestion?.short_description ? <section><Text strong>توضیح کوتاه</Text><p className="whitespace-pre-wrap">{suggestion.short_description}</p></section> : null}
          {suggestion?.description ? <section><Text strong>توضیحات کامل</Text><p className="whitespace-pre-wrap">{suggestion.description}</p></section> : null}
          {suggestion?.seo_title ? <section><Text strong>عنوان SEO</Text><p>{suggestion.seo_title}</p></section> : null}
          {suggestion?.seo_description ? <section><Text strong>توضیح متا</Text><p>{suggestion.seo_description}</p></section> : null}
          {suggestion?.slug ? <section><Text strong>نشانی پیشنهادی</Text><p dir="ltr">{suggestion.slug}</p></section> : null}
        </div>
      </Modal>
    </Card>
  );
}
