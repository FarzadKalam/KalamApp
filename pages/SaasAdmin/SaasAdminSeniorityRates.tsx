import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Alert, Button, Card, Col, Form, Input, InputNumber, Row, Space, Spin, Table, Typography } from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { formatPersianPrice, toPersianNumber } from '../../utils/persianNumberFormatter';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type SeniorityRateRow = {
  id: string;
  persian_year: number;
  daily_rate_rials: number;
  monthly_rate_30day_rials: number;
  monthly_rate_31day_rials: number;
  notes: string | null;
  updated_at: string | null;
};

type RateFormValues = {
  persian_year: number;
  daily_rate_rials: number;
  notes?: string;
};

const { Title, Text } = Typography;

const SaasAdminSeniorityRates: React.FC = () => {
  const { message } = App.useApp();
  const [form] = Form.useForm<RateFormValues>();
  const [rows, setRows] = useState<SeniorityRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const dailyRate = Form.useWatch('daily_rate_rials', form) || 0;

  const monthly30 = useMemo(() => Math.max(0, Number(dailyRate) || 0) * 30, [dailyRate]);
  const monthly31 = useMemo(() => Math.max(0, Number(dailyRate) || 0) * 31, [dailyRate]);

  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('saas_seniority_annual_rates')
        .select('id, persian_year, daily_rate_rials, monthly_rate_30day_rials, monthly_rate_31day_rials, notes, updated_at')
        .order('persian_year', { ascending: false });
      if (error) throw error;
      setRows((data || []) as SeniorityRateRow[]);
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'دریافت نرخ‌های سنوات ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { void loadRates(); }, [loadRates]);

  const resetEditor = () => {
    setEditingId(null);
    form.resetFields();
  };

  const handleEdit = (row: SeniorityRateRow) => {
    setEditingId(row.id);
    form.setFieldsValue({
      persian_year: Number(row.persian_year),
      daily_rate_rials: Number(row.daily_rate_rials),
      notes: row.notes || '',
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const dailyRateRials = Math.round(Number(values.daily_rate_rials || 0));
      const payload = {
        persian_year: Math.round(Number(values.persian_year || 0)),
        daily_rate_rials: dailyRateRials,
        monthly_rate_30day_rials: dailyRateRials * 30,
        monthly_rate_31day_rials: dailyRateRials * 31,
        notes: String(values.notes || '').trim() || null,
        updated_at: new Date().toISOString(),
      };
      setSaving(true);
      const response = editingId
        ? await supabase.from('saas_seniority_annual_rates').update(payload).eq('id', editingId)
        : await supabase.from('saas_seniority_annual_rates').insert(payload);
      if (response.error) throw response.error;
      message.success(editingId ? 'نرخ سنوات به‌روزرسانی شد.' : 'نرخ سنوات سال جدید ثبت شد.');
      resetEditor();
      await loadRates();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(toFaErrorMessage(error, 'ذخیره نرخ سنوات ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6" dir="rtl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Title level={2} className="!mb-1">نرخ سالانه پایه سنوات</Title>
          <Text type="secondary">مرجع سراسری نرخ‌های مصوب قانون کار برای همه سازمان‌ها</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => void loadRates()} loading={loading}>بروزرسانی</Button>
      </div>

      <Alert
        className="mb-5"
        type="info"
        showIcon
        message="این نرخ‌ها برای همه سازمان‌ها مشترک هستند. مبلغ ماهانه به‌صورت خودکار از نرخ روزانه و تعداد روزهای ماه محاسبه می‌شود."
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={15}>
          <Card title="نرخ‌های ثبت‌شده">
            {loading ? <div className="flex justify-center py-12"><Spin /></div> : (
              <Table
                rowKey="id"
                pagination={false}
                dataSource={rows}
                columns={[
                  { title: 'سال شمسی', dataIndex: 'persian_year', width: 120, render: (value: number) => <span className="persian-number font-bold">{toPersianNumber(value)}</span> },
                  { title: 'نرخ روزانه (ریال)', dataIndex: 'daily_rate_rials', render: (value: number) => <span className="persian-number">{formatPersianPrice(value)}</span> },
                  { title: 'ماه ۳۰ روزه', dataIndex: 'monthly_rate_30day_rials', render: (value: number) => <span className="persian-number">{formatPersianPrice(value)}</span> },
                  { title: 'ماه ۳۱ روزه', dataIndex: 'monthly_rate_31day_rials', render: (value: number) => <span className="persian-number">{formatPersianPrice(value)}</span> },
                  { title: 'یادداشت', dataIndex: 'notes', render: (value: string | null) => value || '-' },
                  { title: 'عملیات', key: 'actions', width: 100, render: (_: unknown, row: SeniorityRateRow) => <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(row)}>ویرایش</Button> },
                ]}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card
            title={editingId ? 'ویرایش نرخ سالانه' : 'افزودن نرخ سالانه'}
            extra={editingId ? <Button type="link" onClick={resetEditor}>افزودن نرخ جدید</Button> : null}
          >
            <Form form={form} layout="vertical" onFinish={handleSave}>
              <Form.Item name="persian_year" label="سال شمسی" rules={[{ required: true, message: 'سال شمسی را وارد کنید.' }]}>
                <InputNumber className="w-full" min={1300} max={1600} precision={0} controls={false} />
              </Form.Item>
              <Form.Item name="daily_rate_rials" label="نرخ روزانه پایه سنوات (ریال)" rules={[{ required: true, message: 'نرخ روزانه را وارد کنید.' }, { type: 'number', min: 1, message: 'نرخ باید بیشتر از صفر باشد.' }]}>
                <InputNumber className="w-full" min={1} precision={0} controls={false} />
              </Form.Item>
              <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">
                <div><div className="text-xs text-gray-500">مبلغ ماه ۳۰ روزه</div><div className="persian-number mt-1 font-black">{formatPersianPrice(monthly30)}</div></div>
                <div><div className="text-xs text-gray-500">مبلغ ماه ۳۱ روزه</div><div className="persian-number mt-1 font-black">{formatPersianPrice(monthly31)}</div></div>
              </div>
              <Form.Item name="notes" label="یادداشت">
                <Input.TextArea rows={3} placeholder="مثلاً شماره و تاریخ بخشنامه" />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" icon={editingId ? <SaveOutlined /> : <PlusOutlined />} loading={saving}>{editingId ? 'ذخیره تغییرات' : 'ثبت نرخ'}</Button>
                {editingId ? <Button onClick={resetEditor}>انصراف</Button> : null}
              </Space>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SaasAdminSeniorityRates;
