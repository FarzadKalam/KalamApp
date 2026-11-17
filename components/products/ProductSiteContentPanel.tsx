import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Col, Form, Input, Modal, Progress, Row, Select, Space, Spin, Tag, Typography } from 'antd';
import { BulbOutlined, EyeOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { getProductSiteSeoChecklist } from '../../utils/productSiteSeoChecklist';
import RecordFilesManager from '../RecordFilesManager';

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
  const [connections, setConnections] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [loadingConnections, setLoadingConnections] = useState(false);
  const [syncingContent, setSyncingContent] = useState(false);

  const load = useCallback(async () => {
    if (!product?.id || !product?.org_id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('product_site_content').select('*')
        .eq('org_id', product.org_id).eq('product_id', product.id).maybeSingle();
      if (error) throw error;
      const nextValue = data ? { ...blank(product), ...data } : blank(product);
      setValue(nextValue);
      setSavedFingerprint(contentFingerprint(nextValue));
    } catch (error: any) {
      message.error(error?.message || 'بارگذاری محتوای سایت محصول ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [message, product?.id, product?.name, product?.org_id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    if (!product?.org_id) return undefined;
    setLoadingConnections(true);
    void supabase.functions.invoke('external-connectors', { body: { action: 'list', orgId: product.org_id } })
      .then(({ data, error }) => {
        if (!active) return;
        const available: Array<{ id: string; name: string; is_active: boolean }> = !error && Array.isArray(data?.connections)
          ? data.connections.filter((item: any) => item?.is_active === true).map((item: any) => ({ id: String(item.id), name: String(item.name || 'WooCommerce'), is_active: true }))
          : [];
        setConnections(available);
        setSelectedConnectionId((current) => available.some((item) => item.id === current) ? current : (available[0]?.id || ''));
      })
      .catch(() => { if (active) setConnections([]); })
      .finally(() => { if (active) setLoadingConnections(false); });
    return () => { active = false; };
  }, [product?.org_id]);

  const checklist = useMemo(() => getProductSiteSeoChecklist({
    title: value.title,
    shortDescription: value.short_description,
    description: value.description,
    slug: value.slug,
    seoTitle: value.seo_title,
    seoDescription: value.seo_description,
    imageUrl: value.site_image_url,
    imageAlt: value.site_image_alt,
    focusKeyword: value.focus_keyword,
  }), [value]);
  const score = checklist.length ? Math.round(checklist.filter((item) => item.passed).length * 100 / checklist.length) : 0;

  const update = (key: keyof ProductSiteContent, next: string) => setValue((previous) => ({ ...previous, [key]: next }));
  const hasUnsavedChanges = contentFingerprint(value) !== savedFingerprint;

  const requestAiSuggestion = async () => {
    if (!canEdit || !product?.id) return;
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
    if (!suggestion) return;
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
    if (!canEdit) return;
    if (!value.org_id || !value.product_id) { message.error('شناسهٔ سازمان یا محصول معتبر نیست.'); return; }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        ...value,
        status: 'draft' as const,
        updated_by: userData.user?.id || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('product_site_content').upsert(payload, { onConflict: 'org_id,product_id' }).select('*').single();
      if (error) throw error;
      const nextValue = { ...blank(product), ...data };
      setValue(nextValue);
      setSavedFingerprint(contentFingerprint(nextValue));
      message.success('پیش‌نویس محتوای سایت ذخیره شد؛ چیزی منتشر نشده است.');
    } catch (error: any) {
      message.error(error?.message || 'ذخیرهٔ پیش‌نویس ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  const syncSavedContentToWoo = () => {
    if (!canEdit || !value.id || hasUnsavedChanges || !selectedConnectionId) return;
    modal.confirm({
      title: 'ارسال محتوای ذخیره‌شده به WooCommerce؟',
      content: 'این کار عنوان، توضیح‌های غیرخالی، slug و در صورت انتخاب، تصویر را روی محصول متصل‌شده در فروشگاه به‌روزرسانی می‌کند. توضیح خالی نادیده گرفته می‌شود تا متن فعلی فروشگاه پاک نشود. تصویر باید از دامنهٔ ذخیره‌سازی همین برنامه یا CDN مجاز سرور باشد. وضعیت انتشار محصول در فروشگاه تغییر نمی‌کند؛ اما اگر محصول اکنون عمومی است، بازدیدکنندگان تغییر محتوا را خواهند دید. عنوان SEO و توضیح متا به افزونهٔ سئوی خاصی نگاشت نمی‌شوند.',
      okText: 'ارسال دستی به فروشگاه',
      cancelText: 'انصراف',
      onOk: async () => {
        setSyncingContent(true);
        try {
          const { data, error } = await supabase.functions.invoke('external-connectors', {
            body: { action: 'sync_product_content', orgId: product.org_id, id: selectedConnectionId, localId: product.id },
          });
          if (error) throw error;
          if (!data?.success) throw new Error(data?.message || 'ارسال محتوا ناموفق بود.');
          message.success('محتوای ذخیره‌شده به محصول متصل در WooCommerce ارسال شد؛ تاریخچهٔ همگام‌سازی ثبت شده است.');
        } catch (error: any) {
          message.error(error?.message || 'ارسال محتوای محصول ناموفق بود.');
        } finally {
          setSyncingContent(false);
        }
      },
    });
  };

  if (loading) return <Card className="my-4"><div className="flex justify-center py-8"><Spin /></div></Card>;

  return (
    <Card className="my-4" title={<Space><span>محتوای سایت و SEO محصول</span><Tag color="blue">پیش‌نویس</Tag></Space>}>
      <Alert className="mb-4" type="info" showIcon message="این محتوا از توضیحات داخلی محصول جداست. ذخیره فقط پیش‌نویس را نگه می‌دارد و هیچ چیزی به سایتی ارسال یا منتشر نمی‌شود. متن AI هم فقط پیشنهاد است و باید بازبینی شود." />
      <Row gutter={[16, 8]}>
        <Col xs={24} md={12}>
          <Form layout="vertical">
            <Form.Item label="عنوان محصول در سایت"><Input maxLength={180} value={value.title} onChange={(event) => update('title', event.target.value)} disabled={!canEdit} /></Form.Item>
            <Form.Item label="توضیح کوتاه"><Input.TextArea rows={3} maxLength={800} value={value.short_description} onChange={(event) => update('short_description', event.target.value)} disabled={!canEdit} /></Form.Item>
            <Form.Item label="توضیحات کامل"><Input.TextArea rows={8} maxLength={12000} value={value.description} onChange={(event) => update('description', event.target.value)} disabled={!canEdit} /></Form.Item>
            <Form.Item label="تصویر مخصوص سایت">
              <Space.Compact style={{ width: '100%' }}>
                <Input dir="ltr" maxLength={2000} value={value.site_image_url} onChange={(event) => update('site_image_url', event.target.value)} disabled={!canEdit} placeholder="https://…" />
                <Button disabled={!canEdit || !product?.id} onClick={() => setFileManagerOpen(true)}>انتخاب از فایل‌منیجر محصول</Button>
              </Space.Compact>
              <Text type="secondary">برای ارسال تصویر به فروشگاه، فایل باید از نشانی عمومی HTTPS قابل‌دسترسی باشد.</Text>
            </Form.Item>
            <Form.Item label="متن جایگزین تصویر"><Input maxLength={250} value={value.site_image_alt} onChange={(event) => update('site_image_alt', event.target.value)} disabled={!canEdit} /></Form.Item>
          </Form>
        </Col>
        <Col xs={24} md={12}>
          <Form layout="vertical">
            <Form.Item label="نشانی کوتاه (slug)"><Input dir="ltr" maxLength={180} value={value.slug} onChange={(event) => update('slug', event.target.value)} disabled={!canEdit} placeholder="sample-product" /></Form.Item>
            <Form.Item label="عنوان SEO"><Input maxLength={180} value={value.seo_title} onChange={(event) => update('seo_title', event.target.value)} disabled={!canEdit} /></Form.Item>
            <Form.Item label="توضیح متا"><Input.TextArea rows={3} maxLength={320} value={value.seo_description} onChange={(event) => update('seo_description', event.target.value)} disabled={!canEdit} /></Form.Item>
            <Form.Item label="عبارت کلیدی پیشنهادی"><Input maxLength={120} value={value.focus_keyword} onChange={(event) => update('focus_keyword', event.target.value)} disabled={!canEdit} /></Form.Item>
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
        <Button icon={<BulbOutlined />} onClick={() => void requestAiSuggestion()} loading={generating} disabled={!canEdit}>پیشنهاد توضیحات با هوش مصنوعی</Button>
        <Button icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>پیش‌نمایش</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={() => void saveDraft()} loading={saving} disabled={!canEdit}>ذخیرهٔ پیش‌نویس</Button>
      </div>
      <Card size="small" className="mt-4" title="همگام‌سازی دستی با WooCommerce">
        <Space wrap>
          <Typography.Text>فروشگاه فعال:</Typography.Text>
          <Select aria-label="فروشگاه WooCommerce" style={{ minWidth: 220 }} loading={loadingConnections} value={selectedConnectionId || undefined}
            placeholder={loadingConnections ? 'در حال دریافت…' : 'اتصال فعال را انتخاب کنید'} disabled={!canEdit || loadingConnections || connections.length === 0}
            onChange={setSelectedConnectionId} options={connections.map((item) => ({ value: item.id, label: item.name }))} />
          <Button danger loading={syncingContent} disabled={!canEdit || !value.id || hasUnsavedChanges || !selectedConnectionId || syncingContent}
            onClick={syncSavedContentToWoo}>ارسال دستی محتوای ذخیره‌شده به فروشگاه…</Button>
        </Space>
        {!connections.length && !loadingConnections && <Alert className="mt-3" type="info" showIcon message="اتصال فعال WooCommerce در دسترس نیست یا اجازهٔ مشاهدهٔ آن وجود ندارد." />}
        {hasUnsavedChanges && <Alert className="mt-3" type="warning" showIcon message="برای همگام‌سازی، ابتدا همین محتوا را ذخیره کنید." />}
        <Typography.Paragraph type="secondary" className="mt-3 mb-0">هیچ همگام‌سازی خودکاری انجام نمی‌شود. هر ارسال با دکمه و تأیید جداگانه ثبت می‌شود. عنوان SEO، توضیح متا و عبارت کلیدی در پیش‌نویس باقی می‌مانند؛ نگاشت آن‌ها به افزونهٔ سئوی فروشگاه نیازمند پیکربندی اختصاصی است.</Typography.Paragraph>
      </Card>
      <RecordFilesManager open={fileManagerOpen} onClose={() => setFileManagerOpen(false)} moduleId="products"
        recordId={String(product?.id || '')} mainImage={value.site_image_url}
        onMainImageChange={(url) => update('site_image_url', url || '')}
        canEdit={canEdit} canUpload={canEdit} canDelete={false} />
      <Modal open={previewOpen} onCancel={() => setPreviewOpen(false)} footer={<Button onClick={() => setPreviewOpen(false)}>بستن</Button>} title="پیش‌نمایش محتوای محصول" width={720}>
        <article dir="rtl" className="mx-auto max-w-2xl">
          {value.site_image_url ? <img src={value.site_image_url} alt={value.site_image_alt} className="mb-4 max-h-72 w-full rounded-xl object-cover" /> : null}
          <Title level={2}>{value.title || 'عنوان محصول'}</Title>
          {value.short_description ? <p className="text-base font-medium">{value.short_description}</p> : null}
          {value.description ? <p className="whitespace-pre-wrap leading-8">{value.description}</p> : <Text type="secondary">توضیحات کامل هنوز وارد نشده است.</Text>}
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
