import React, { useEffect, useState } from 'react';
import { Form, Input, Button, message, Upload, Select } from 'antd';
import { SaveOutlined, UploadOutlined, CloudUploadOutlined, GlobalOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { BRAND_PALETTE_PRESETS, BRANDING_UPDATED_EVENT, DEFAULT_BRANDING } from '../../theme/brandTheme';

const CompanyTab: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data } = await supabase
      .from('company_settings')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (data) {
      form.setFieldsValue({
        ...data,
        company_full_name: data.company_full_name || data.company_name || '',
        trade_name: data.trade_name || data.company_name || '',
        company_name_en: data.company_name_en || '',
        palette_key: data.brand_palette_key || DEFAULT_BRANDING.paletteKey,
      });
      setRecordId(data.id);
      setLogoUrl(data.logo_url || null);
      setIconUrl(data.icon_url || null);
      return;
    }

    form.setFieldsValue({
      company_full_name: DEFAULT_BRANDING.brandName,
      trade_name: DEFAULT_BRANDING.shortName,
      company_name_en: '',
      palette_key: DEFAULT_BRANDING.paletteKey,
    });
  };

  const handleUpload = async (file: File, type: 'logo' | 'icon') => {
    try {
      const fileName = `company-${type}-${Date.now()}.${file.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('images').upload(fileName, file);
      if (error) throw error;
      const { data } = supabase.storage.from('images').getPublicUrl(fileName);

      if (type === 'logo') {
        setLogoUrl(data.publicUrl);
        form.setFieldValue('logo_url', data.publicUrl);
      } else {
        setIconUrl(data.publicUrl);
        form.setFieldValue('icon_url', data.publicUrl);
      }
      message.success('آپلود شد');
    } catch {
      message.error('خطا در آپلود');
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
        ...rest
      } = values;

      const fullName = String(company_full_name || '').trim();
      const tradeName = String(trade_name || '').trim() || fullName;
      const englishName = String(company_name_en || '').trim();

      const payload = {
        ...rest,
        company_name: fullName, // backward compatibility for existing parts
        company_full_name: fullName,
        trade_name: tradeName,
        company_name_en: englishName || null,
        brand_palette_key: palette_key || DEFAULT_BRANDING.paletteKey,
        logo_url: logoUrl,
        icon_url: iconUrl,
      };

      if (recordId) {
        await supabase.from('company_settings').update(payload).eq('id', recordId);
      } else {
        const { data } = await supabase.from('company_settings').insert([payload]).select().single();
        if (data?.id) setRecordId(String(data.id));
      }

      window.dispatchEvent(new CustomEvent(BRANDING_UPDATED_EVENT));
      message.success('تنظیمات شرکت ذخیره شد');
    } catch {
      message.error('خطا در ذخیره سازی');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6">
      <Form form={form} layout="vertical" onFinish={onFinish} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 mb-2">
          <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 flex items-center gap-4 group hover:border-leather-500 transition-colors">
            <div className="w-16 h-16 flex items-center justify-center bg-white rounded-lg shadow-sm overflow-hidden">
              {logoUrl ? <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" /> : <CloudUploadOutlined className="text-2xl text-gray-300" />}
            </div>
            <div className="flex-1">
              <div className="mb-1 text-sm font-bold text-gray-700 dark:text-gray-300">لوگوی اصلی</div>
              <div className="text-xs text-gray-400 mb-2">نمایش در هدر و فاکتورها</div>
              <Upload showUploadList={false} beforeUpload={(f) => handleUpload(f, 'logo')}>
                <Button icon={<UploadOutlined />} size="small" className="text-xs">تغییر لوگو</Button>
              </Upload>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 flex items-center gap-4 group hover:border-leather-500 transition-colors">
            <div className="w-16 h-16 flex items-center justify-center bg-white rounded-lg shadow-sm overflow-hidden">
              {iconUrl ? <img src={iconUrl} alt="Icon" className="w-full h-full object-contain" /> : <GlobalOutlined className="text-2xl text-gray-300" />}
            </div>
            <div className="flex-1">
              <div className="mb-1 text-sm font-bold text-gray-700 dark:text-gray-300">آیکون سایت (Favicon)</div>
              <div className="text-xs text-gray-400 mb-2">نمایش در تب مرورگر</div>
              <Upload showUploadList={false} beforeUpload={(f) => handleUpload(f, 'icon')}>
                <Button icon={<UploadOutlined />} size="small" className="text-xs">تغییر آیکون</Button>
              </Upload>
            </div>
          </div>
        </div>

        <Form.Item label={<span className="dark:text-gray-300">نام کامل شرکت/سازمان</span>} name="company_full_name" rules={[{ required: true }]}>
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">نام تجاری</span>} name="trade_name" rules={[{ required: true }]}>
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
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

        <Form.Item label={<span className="dark:text-gray-300">نام مدیرعامل</span>} name="ceo_name">
          <Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
        </Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">شناسه ملی / کد اقتصادی</span>} name="national_id">
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
        <Form.Item label={<span className="dark:text-gray-300">آدرس پستی</span>} name="address" className="md:col-span-2">
          <Input.TextArea rows={3} className="dark:bg-white/5 dark:border-gray-700 dark:text-white" />
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
    </div>
  );
};

export default CompanyTab;

