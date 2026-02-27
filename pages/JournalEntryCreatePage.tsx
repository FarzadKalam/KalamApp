import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Empty, Form, Input, Select, Spin } from 'antd';
import { ArrowRightOutlined, SaveOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import PersianDatePicker from '../components/PersianDatePicker';
import {
  fetchCurrentUserRolePermissions,
  type PermissionMap,
} from '../utils/permissions';
import { generateNextJournalEntryNo } from '../utils/journalEntryNumbering';

type FiscalYearOption = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_closed: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

const JournalEntryCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [canCreate, setCanCreate] = useState(true);
  const [fiscalYears, setFiscalYears] = useState<FiscalYearOption[]>([]);

  const initialValuesFromState = useMemo(() => {
    return ((location.state as any)?.initialValues || {}) as Record<string, any>;
  }, [location.state]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        const permissions: PermissionMap | null = await fetchCurrentUserRolePermissions(supabase);
        const entryPerms = permissions?.journal_entries || {};
        const canEdit = entryPerms.edit !== false;
        if (active) setCanCreate(canEdit);

        const { data: years, error: yearsError } = await supabase
          .from('fiscal_years')
          .select('id, title, start_date, end_date, is_active, is_closed')
          .order('start_date', { ascending: false });
        if (yearsError) throw yearsError;

        const yearRows = (years || []) as FiscalYearOption[];
        if (active) {
          setFiscalYears(yearRows);
          const defaultYear =
            initialValuesFromState?.fiscal_year_id ||
            yearRows.find((y) => y.is_active && !y.is_closed)?.id ||
            yearRows.find((y) => !y.is_closed)?.id ||
            null;

          form.setFieldsValue({
            entry_no: initialValuesFromState?.entry_no || null,
            entry_date: initialValuesFromState?.entry_date || today(),
            fiscal_year_id: defaultYear,
            description: initialValuesFromState?.description || null,
          });
        }
      } catch (err: any) {
        message.error(`خطا در دریافت اطلاعات اولیه: ${err?.message || 'نامشخص'}`);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [form, initialValuesFromState, message]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (!canCreate) {
        message.error('دسترسی ایجاد سند حسابداری ندارید.');
        return;
      }

      setCreating(true);
      const manualEntryNo = values?.entry_no ? String(values.entry_no).trim() : '';
      const autoEntryNo = manualEntryNo
        ? null
        : await generateNextJournalEntryNo({
            supabase: supabase as any,
            fiscalYearId: values?.fiscal_year_id || null,
          });

      const payload = {
        entry_no: manualEntryNo || autoEntryNo || null,
        entry_date: values?.entry_date || today(),
        fiscal_year_id: values?.fiscal_year_id || null,
        description: values?.description ? String(values.description).trim() : null,
        status: 'draft',
      };

      const { data: inserted, error } = await supabase
        .from('journal_entries')
        .insert([payload])
        .select('id')
        .single();
      if (error) throw error;

      message.success('سند حسابداری ایجاد شد. حالا ردیف‌های سند را اضافه کنید.');
      navigate(`/journal_entries/${inserted.id}`);
    } catch (err: any) {
      if (Array.isArray(err?.errorFields)) return;
      message.error(`ایجاد سند ناموفق بود: ${err?.message || 'نامشخص'}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div className="h-[70vh] flex items-center justify-center">
        <Empty description="دسترسی ایجاد سند حسابداری ندارید" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[980px] mx-auto animate-fadeIn">
      <Card className="rounded-2xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Button
              icon={<ArrowRightOutlined />}
              type="text"
              onClick={() => navigate('/journal_entries')}
            />
            <h1 className="text-xl md:text-2xl font-black m-0 text-gray-800 dark:text-white">
              ایجاد سند حسابداری
            </h1>
          </div>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleCreate}
            loading={creating}
            className="bg-leather-600 border-none"
          >
            ایجاد سند
          </Button>
        </div>

        <Form form={form} layout="vertical">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Form.Item label="شماره سند" name="entry_no">
              <Input placeholder="اختیاری" allowClear />
            </Form.Item>

            <Form.Item
              label="تاریخ سند"
              name="entry_date"
              rules={[{ required: true, message: 'تاریخ سند الزامی است' }]}
            >
              <PersianDatePicker type="DATE" />
            </Form.Item>

            <Form.Item
              label="سال مالی"
              name="fiscal_year_id"
              rules={[{ required: true, message: 'سال مالی الزامی است' }]}
            >
              <Select
                placeholder="انتخاب سال مالی"
                options={fiscalYears.map((year) => ({
                  value: year.id,
                  label: `${year.title}${year.is_active ? ' (فعال)' : ''}${year.is_closed ? ' (بسته)' : ''}`,
                }))}
              />
            </Form.Item>
          </div>

          <Form.Item label="شرح سند" name="description">
            <Input.TextArea rows={4} placeholder="شرح کلی سند..." />
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default JournalEntryCreatePage;
