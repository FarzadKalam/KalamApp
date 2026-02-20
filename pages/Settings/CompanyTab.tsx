import React, { useEffect, useState } from 'react';
import { Form, Input, Button, message, Upload } from 'antd';
// نکته مهم: Divider و BuildOutlined را کاملا حذف کردم تا هیچ اثری از هدر دوم نباشد
import { SaveOutlined, UploadOutlined, CloudUploadOutlined, GlobalOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';

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
    const { data } = await supabase.from('company_settings').select('*').limit(1).single();
    if (data) {
      form.setFieldsValue(data);
      setRecordId(data.id);
      setLogoUrl(data.logo_url);
      setIconUrl(data.icon_url);
    }
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
      } catch (e: any) {
          message.error('خطا در آپلود');
      }
      return false;
  };

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const payload = { ...values, logo_url: logoUrl, icon_url: iconUrl };
      if (recordId) {
        await supabase.from('company_settings').update(payload).eq('id', recordId);
      } else {
        const { data } = await supabase.from('company_settings').insert([payload]).select().single();
        if (data) setRecordId(data.id);
      }
      message.success('تنظیمات ذخیره شد');
    } catch (error) {
      message.error('خطا در ذخیره سازی');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-6">
      {/* اگر اینجا Divider ببینی یعنی فایل کش شده است. اینجا باید کاملا خالی از تیتر باشد */}
      
      <Form form={form} layout="vertical" onFinish={onFinish} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* بخش لوگو و آیکون */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
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

        <Form.Item label={<span className="dark:text-gray-300">نام شرکت / فروشگاه</span>} name="company_name" rules={[{ required: true }]}><Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" /></Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">نام مدیرعامل</span>} name="ceo_name"><Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" /></Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">شناسه ملی / کد اقتصادی</span>} name="national_id"><Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" /></Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">شماره همراه (رسمی)</span>} name="mobile"><Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" /></Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">تلفن ثابت</span>} name="phone"><Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" /></Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">ایمیل</span>} name="email"><Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" /></Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">آدرس وب‌سایت</span>} name="website"><Input className="dark:bg-white/5 dark:border-gray-700 dark:text-white" /></Form.Item>
        <Form.Item label={<span className="dark:text-gray-300">آدرس پستی</span>} name="address" className="md:col-span-2"><Input.TextArea rows={3} className="dark:bg-white/5 dark:border-gray-700 dark:text-white" /></Form.Item>
        
        <div className="md:col-span-2 flex justify-end mt-4 sticky bottom-0 bg-white dark:bg-[#1a1a1a] py-4 border-t border-gray-100 dark:border-gray-800 z-10">
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading} className="bg-leather-600 hover:!bg-leather-500 border-none h-12 px-8 rounded-xl shadow-lg shadow-leather-500/30">ذخیره تغییرات</Button>
        </div>
      </Form>
    </div>
  );
};

export default CompanyTab;