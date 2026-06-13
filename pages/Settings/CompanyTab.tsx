import React, { useEffect, useMemo, useState } from 'react';
import { App, Form, Input, Button, Upload, Select, Checkbox, Switch, Typography } from 'antd';
import { SaveOutlined, UploadOutlined, CloudUploadOutlined, GlobalOutlined, FileImageOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { BRAND_PALETTE_PRESETS, BRANDING_UPDATED_EVENT, DEFAULT_BRANDING } from '../../theme/brandTheme';
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, normalizeCurrencyConfig, persistCurrencyConfig } from '../../utils/currency';
import { isUploadCanceledError, uploadFileWithProgress } from '../../utils/uploadFileWithProgress';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../../utils/storageClient';
import { getResolvedCurrentOrgId, loadScopedCompanySettings } from '../../utils/companySettings';
import ResilientImage from '../../components/common/ResilientImage';
import PrintLetterheadDesignerModal from '../../components/settings/PrintLetterheadDesignerModal';
import {
  getPrintLetterheadBySlotId,
  getPrintLetterheadSlotLabel,
  normalizePrintLetterheads,
  type PrintLetterheadConfig,
  type PrintLetterheadSlotId,
} from '../../utils/printTemplates/letterheads';

const CompanyTab: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [printLetterheads, setPrintLetterheads] = useState<PrintLetterheadConfig[]>(normalizePrintLetterheads([]));
  const [editingLetterheadSlotId, setEditingLetterheadSlotId] = useState<PrintLetterheadSlotId | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const activeLetterhead = useMemo(
    () => (editingLetterheadSlotId ? getPrintLetterheadBySlotId(printLetterheads, editingLetterheadSlotId) : null),
    [editingLetterheadSlotId, printLetterheads],
  );

  const updateLetterhead = (slotId: PrintLetterheadSlotId, updater: (item: PrintLetterheadConfig) => PrintLetterheadConfig) => {
    setPrintLetterheads((prev) =>
      normalizePrintLetterheads(prev).map((item) => (item.slotId === slotId ? updater(item) : item)),
    );
  };

  const fetchData = async () => {
    const { data } = await loadScopedCompanySettings(supabase);

    if (data) {
      form.setFieldsValue({
        ...data,
        company_full_name: data.company_full_name || data.company_name || '',
        trade_name: data.trade_name || data.company_name || '',
        company_name_en: data.company_name_en || '',
        palette_key: data.brand_palette_key || DEFAULT_BRANDING.paletteKey,
        qr_scan_enabled: Boolean(data.qr_scan_enabled),
        currency_code: normalizeCurrencyConfig({
          code: data.currency_code,
          label: data.currency_label,
        }).code,
      });
      persistCurrencyConfig({
        code: data.currency_code,
        label: data.currency_label,
      });
      setRecordId(data.id);
      setLogoUrl(data.logo_url || null);
      setIconUrl(data.icon_url || null);
      setSignatureUrl(data.signature_image_url || null);
      setStampUrl(data.stamp_image_url || null);
      setPrintLetterheads(normalizePrintLetterheads(data.print_letterheads));
      return;
    }

    form.setFieldsValue({
      company_full_name: DEFAULT_BRANDING.brandName,
      trade_name: DEFAULT_BRANDING.shortName,
      company_name_en: '',
      palette_key: DEFAULT_BRANDING.paletteKey,
      qr_scan_enabled: false,
      currency_code: DEFAULT_CURRENCY.code,
    });
    setPrintLetterheads(normalizePrintLetterheads([]));
    persistCurrencyConfig(DEFAULT_CURRENCY);
  };

  const handleAssetUpload = async (file: File, type: 'logo' | 'icon' | 'signature' | 'stamp') => {
    try {
      const fileName = `company-${type}-${Date.now()}.${file.name.split('.').pop()}`;
      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: fileName,
        file,
        upsert: true,
        label: file.name || `company-${type}`,
        detail:
          type === 'logo'
            ? 'لوگوی شرکت'
            : type === 'icon'
              ? 'آیکون سایت'
              : type === 'signature'
                ? 'امضای سازمانی'
                : 'مهر سازمانی',
      });
      const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(fileName);

      if (type === 'logo') {
        setLogoUrl(data.publicUrl);
        form.setFieldValue('logo_url', data.publicUrl);
      } else if (type === 'icon') {
        setIconUrl(data.publicUrl);
        form.setFieldValue('icon_url', data.publicUrl);
      } else if (type === 'signature') {
        setSignatureUrl(data.publicUrl);
        form.setFieldValue('signature_image_url', data.publicUrl);
      } else {
        setStampUrl(data.publicUrl);
        form.setFieldValue('stamp_image_url', data.publicUrl);
      }
      message.success('آپلود شد');
    } catch (error) {
      if (isUploadCanceledError(error)) return false;
      message.error('خطا در آپلود');
    }
    return false;
  };

  const handleLetterheadUpload = async (file: File, slotId: PrintLetterheadSlotId) => {
    try {
      const fileName = `company-letterhead-${slotId}-${Date.now()}.${file.name.split('.').pop()}`;
      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: fileName,
        file,
        upsert: true,
        label: file.name || slotId,
        detail: getPrintLetterheadSlotLabel(slotId),
      });
      const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(fileName);
      updateLetterhead(slotId, (item) => ({
        ...item,
        imageUrl: data.publicUrl,
      }));
      message.success('سربرگ آپلود شد');
    } catch (error) {
      if (isUploadCanceledError(error)) return false;
      message.error('خطا در آپلود سربرگ');
    }
    return false;
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const {
        company_full_name,
        trade_name,
        company_name_en,
        palette_key,
        currency_code,
        slogan,
        ...rest
      } = values;

      const fullName = String(company_full_name || '').trim();
      const tradeName = String(trade_name || '').trim() || fullName;
      const englishName = String(company_name_en || '').trim();

      const currency = normalizeCurrencyConfig({ code: currency_code });
      const payload = {
        ...rest,
        company_name: fullName,
        company_full_name: fullName,
        trade_name: tradeName,
        company_name_en: englishName || null,
        slogan: String(slogan || '').trim() || null,
        brand_palette_key: palette_key || DEFAULT_BRANDING.paletteKey,
        currency_code: currency.code,
        currency_label: currency.label,
        logo_url: form.getFieldValue('logo_url') || logoUrl,
        icon_url: form.getFieldValue('icon_url') || iconUrl,
        signature_image_url: form.getFieldValue('signature_image_url') || signatureUrl,
        stamp_image_url: form.getFieldValue('stamp_image_url') || stampUrl,
        print_letterheads: normalizePrintLetterheads(printLetterheads).map((item) => ({
          id: item.id,
          slotId: item.slotId,
          orientation: item.orientation,
          title: item.title,
          imageUrl: item.imageUrl,
          isActive: item.isActive,
          layout: item.layout,
          sortOrder: item.sortOrder,
        })),
      };

      if (recordId) {
        const { data: updated, error } = await supabase
          .from('company_settings')
          .update(payload)
          .eq('id', recordId)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!updated?.id) throw new Error('UPDATE_NO_ROW');
      } else {
        const currentOrgId = await getResolvedCurrentOrgId(supabase);
        const insertPayload = currentOrgId
          ? { ...payload, org_id: currentOrgId }
          : payload;
        const { data, error } = await supabase.from('company_settings').insert([insertPayload]).select('id').single();
        if (error) throw error;
        if (data?.id) setRecordId(String(data.id));
      }

      window.dispatchEvent(new CustomEvent(BRANDING_UPDATED_EVENT));
      persistCurrencyConfig(currency);
      await fetchData();
      message.success('تنظیمات شرکت ذخیره شد');
    } catch (error: any) {
      console.error('Company settings save failed', error);
      message.error('خطا در ذخیره سازی');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6">
      <Form form={form} layout="vertical" onFinish={onFinish} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-2">
          {[
            {
              key: 'logo',
              title: 'لوگوی اصلی',
              description: 'نمایش در هدر و فاکتورها',
              image: logoUrl,
              icon: <CloudUploadOutlined className="text-2xl text-gray-300" />,
              onUpload: (file: File) => handleAssetUpload(file, 'logo'),
            },
            {
              key: 'icon',
              title: 'آیکون سایت (Favicon)',
              description: 'نمایش در تب مرورگر',
              image: iconUrl,
              icon: <GlobalOutlined className="text-2xl text-gray-300" />,
              onUpload: (file: File) => handleAssetUpload(file, 'icon'),
            },
            {
              key: 'signature',
              title: 'امضای سازمانی',
              description: 'نمایش کنار امضای مدیرعامل در چاپ',
              image: signatureUrl,
              icon: <CloudUploadOutlined className="text-2xl text-gray-300" />,
              onUpload: (file: File) => handleAssetUpload(file, 'signature'),
            },
            {
              key: 'stamp',
              title: 'مهر سازمانی',
              description: 'نمایش کنار امضای مدیرعامل در چاپ',
              image: stampUrl,
              icon: <CloudUploadOutlined className="text-2xl text-gray-300" />,
              onUpload: (file: File) => handleAssetUpload(file, 'stamp'),
            },
          ].map((asset) => (
            <div key={asset.key} className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 flex items-center gap-4 group hover:border-leather-500 transition-colors">
              <div className="w-16 h-16 flex items-center justify-center bg-white rounded-lg shadow-sm overflow-hidden">
                {asset.image ? <ResilientImage src={asset.image} preset="gallery" alt={asset.title} className="w-full h-full object-contain" loading="lazy" decoding="async" /> : asset.icon}
              </div>
              <div className="flex-1">
                <div className="mb-1 text-sm font-bold text-gray-700 dark:text-gray-300">{asset.title}</div>
                <div className="text-xs text-gray-400 mb-2">{asset.description}</div>
                <Upload showUploadList={false} beforeUpload={asset.onUpload}>
                  <Button icon={<UploadOutlined />} size="small" className="text-xs">تغییر</Button>
                </Upload>
              </div>
            </div>
          ))}
        </div>

        <div className="md:col-span-2 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950/30 p-5">
          <div className="mb-4">
            <div className="text-base font-bold text-slate-800 dark:text-slate-100">سربرگ‌های چاپ</div>
            <Typography.Text type="secondary" className="text-[11px]">
              برای هر جهت صفحه می‌توانید تا دو سربرگ فعال داشته باشید. بهتر است فایل‌ها با فرمت PNG یا JPG یا WEBP، در فضای رنگی RGB یا sRGB و با نسبت نزدیک به A4 چاپی آماده شوند؛ PDF در این بخش پشتیبانی نمی‌شود و برای چیدمان راحت‌تر، بهتر است در بالای صفحه فضای کافی برای اطلاعات سربرگ و در پایین صفحه فضای امن برای امضاها و ناحیه پایانی باقی بگذارید.
            </Typography.Text>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {normalizePrintLetterheads(printLetterheads).map((letterhead) => (
              <div key={letterhead.slotId} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/30 p-4">
                <div className="flex items-start gap-4">
                  <div className="w-24 h-28 rounded-xl overflow-hidden bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center">
                    {letterhead.imageUrl ? (
                      <ResilientImage src={letterhead.imageUrl} preset="gallery" alt={letterhead.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    ) : (
                      <FileImageOutlined className="text-3xl text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{getPrintLetterheadSlotLabel(letterhead.slotId)}</div>
                      <Switch
                        checked={letterhead.isActive}
                        onChange={(checked) => updateLetterhead(letterhead.slotId, (item) => ({ ...item, isActive: checked }))}
                      />
                    </div>
                    <Input
                      value={letterhead.title}
                      onChange={(event) => updateLetterhead(letterhead.slotId, (item) => ({ ...item, title: event.target.value }))}
                      placeholder={getPrintLetterheadSlotLabel(letterhead.slotId)}
                      className="mb-3"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Upload showUploadList={false} beforeUpload={(file) => handleLetterheadUpload(file, letterhead.slotId)}>
                        <Button size="small" icon={<UploadOutlined />}>آپلود سربرگ</Button>
                      </Upload>
                      <Button size="small" disabled={!letterhead.imageUrl} onClick={() => setEditingLetterheadSlotId(letterhead.slotId)}>
                        شخصی‌سازی سربرگ
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Form.Item label={<span className="dark:text-gray-300">نام کامل شرکت/سازمان</span>} name="company_full_name" rules={[{ required: true }]}>
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">نام تجاری</span>} name="trade_name" rules={[{ required: true }]}>
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">شعار سازمان</span>} name="slogan">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" placeholder="مثلاً: کیفیت بی‌رقیب، خدمت بی‌نظیر" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">نام انگلیسی</span>} name="company_name_en">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">پالت رنگ سازمانی</span>} name="palette_key">
          <Select
            className="dark:bg-white/5 dark:border-gray-700 dark:text-white"
            options={Object.entries(BRAND_PALETTE_PRESETS).map(([key, value]) => ({
              value: key,
              label: value.label,
            }))}
          />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">واحد پولی</span>} name="currency_code" rules={[{ required: true }]}>
          <Select className="dark:bg-white/5 dark:border-gray-700 dark:text-white" options={CURRENCY_OPTIONS} />
        </Form.Item>
        <Form.Item name="qr_scan_enabled" valuePropName="checked" className="md:col-span-2">
          <Checkbox className="dark:text-gray-300">اسکن qr فعال باشد</Checkbox>
        </Form.Item>

        <Form.Item label={<span className="dark:text-gray-300">نام مدیرعامل</span>} name="ceo_name">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">شناسه ملی / کد اقتصادی</span>} name="national_id">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">شماره ثبت</span>} name="registration_number">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">کد اقتصادی</span>} name="economic_code" extra="برای ارسال فاکتور به سامانه مودیان از همین مقدار استفاده می‌شود.">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">کد پستی</span>} name="postal_code">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">شماره همراه (رسمی)</span>} name="mobile">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">تلفن ثابت</span>} name="phone">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">ایمیل</span>} name="email">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">آدرس وب‌سایت</span>} name="website">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">آیدی اینستاگرام</span>} name="instagram_id">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" placeholder="@brandname" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">آیدی تلگرام</span>} name="telegram_id">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" placeholder="@brandname" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">یوتیوب</span>} name="youtube_url">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" placeholder="@channel یا لینک کانال" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">واتساپ</span>} name="whatsapp_number">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" placeholder="شماره یا لینک واتساپ" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">آیدی ایتا</span>} name="eitaa_id">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" placeholder="@brandname" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">آیدی روبیکا</span>} name="rubika_id">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" placeholder="@brandname" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">آیدی بله</span>} name="bale_id">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" placeholder="@brandname" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">آدرس پستی</span>} name="address" className="md:col-span-2">
          <Input.TextArea rows={3} className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item name="logo_url" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="icon_url" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="signature_image_url" hidden>
          <Input />
        </Form.Item>
        <Form.Item name="stamp_image_url" hidden>
          <Input />
        </Form.Item>

        <div className="md:col-span-2 flex justify-end mt-4 sticky bottom-0 bg-white dark:bg-[#1a1a1a] py-4 border-t border-gray-100 dark:border-gray-800 z-10">
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={loading}
            className="bg-leather-600 hover:!bg-leather-500 border-none h-12 px-8 rounded-xl shadow-lg shadow-leather-500/30"
          >
            ذخیره تغییرات
          </Button>
        </div>
      </Form>

      <PrintLetterheadDesignerModal
        open={Boolean(editingLetterheadSlotId && activeLetterhead?.imageUrl)}
        letterhead={activeLetterhead}
        onClose={() => setEditingLetterheadSlotId(null)}
        onSave={(layout) => {
          if (!editingLetterheadSlotId) return;
          updateLetterhead(editingLetterheadSlotId, (item) => ({ ...item, layout }));
          setEditingLetterheadSlotId(null);
        }}
      />
    </div>
  );
};

export default CompanyTab;
