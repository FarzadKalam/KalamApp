import React, { useEffect, useMemo, useState } from 'react';
import { App, Alert, Form, Input, Modal, Select, Spin } from 'antd';
import PersianDatePicker from '../PersianDatePicker';
import SmartFieldRenderer from '../SmartFieldRenderer';
import { supabase } from '../../supabaseClient';
import { FieldType, ModuleField } from '../../types';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import {
  BILLBOARD_STATUS_OPTIONS,
  isBillboardOccupancyStatus,
} from '../../utils/billboardStatusChanges';
import { doesProcessTemplateSupportModule } from '../../utils/processTargets';

type Option = { value: string; label: string };

type BillboardStatusChangeModalProps = {
  open: boolean;
  billboardIds?: string[];
  onClose: () => void;
  onCreated?: (result: any) => void;
};

const labelForBillboard = (row: any) => {
  const title = String(row?.name || row?.address || '').trim() || 'تابلو بدون عنوان';
  const code = String(row?.system_code || row?.manual_code || '').trim();
  return code ? `${title} — ${code}` : title;
};

// سطح مودال درخواست از پنجره‌های عمومی بالاتر است؛ همهٔ pickerها باید در
// ریشهٔ overlay قرار بگیرند تا در موبایل و دسکتاپ زیر mask یا محتوای مودال نروند.
const BILLBOARD_STATUS_MODAL_Z_INDEX = 15100;
const BILLBOARD_STATUS_PICKER_Z_INDEX = BILLBOARD_STATUS_MODAL_Z_INDEX + 220;

const statusChangeRelationFields: Record<'customer' | 'invoice' | 'marketingLead', ModuleField> = {
  customer: { key: 'customer_id', labels: { fa: 'نام مشتری', en: 'Customer' }, type: FieldType.RELATION, relationConfig: { targetModule: 'customers', targetField: 'business_name' } },
  invoice: { key: 'invoice_id', labels: { fa: 'فاکتور مرتبط', en: 'Invoice' }, type: FieldType.RELATION, relationConfig: { targetModule: 'invoices', targetField: 'name' } },
  marketingLead: { key: 'marketing_lead_id', labels: { fa: 'لید مرتبط', en: 'Related lead' }, type: FieldType.RELATION, relationConfig: { targetModule: 'marketing_leads', targetField: 'name' } },
};

const toOptions = (rows: any[], label: (row: any) => string): Option[] =>
  (rows || []).map((row) => ({ value: String(row.id), label: label(row) })).filter((item) => item.value);

const BillboardStatusChangeModal: React.FC<BillboardStatusChangeModalProps> = ({
  open,
  billboardIds = [],
  onClose,
  onCreated,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [billboards, setBillboards] = useState<Option[]>([]);
  const [templates, setTemplates] = useState<Option[]>([]);
  const targetStatus = Form.useWatch('target_status', form);
  const formValues = Form.useWatch([], form) || {};
  const isBulk = billboardIds.length > 1;
  const occupancyRequired = isBillboardOccupancyStatus(targetStatus);
  const blocked = String(targetStatus || '') === 'blocked';

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (billboardIds.length === 1) form.setFieldValue('billboard_id', billboardIds[0]);
    let active = true;
    setOptionsLoading(true);
    void Promise.all([
      supabase.from('billboards').select('id,name,address,system_code,manual_code').order('name').limit(250),
      supabase.from('process_templates').select('id,name,module_id,module_ids').order('name').limit(250),
    ]).then(([billboardsResult, templatesResult]) => {
      if (!active) return;
      if (billboardsResult.error) throw billboardsResult.error;
      if (templatesResult.error) throw templatesResult.error;
      setBillboards(toOptions(billboardsResult.data || [], labelForBillboard));
      setTemplates(toOptions(
        (templatesResult.data || []).filter((row: any) => doesProcessTemplateSupportModule(row, 'billboard_status_changes')),
        (row) => String(row.name || 'فرآیند بدون عنوان'),
      ));
    }).catch((error) => {
      if (active) message.error(toFaErrorMessage(error, 'بارگذاری گزینه‌های فرم ناموفق بود.'));
    }).finally(() => { if (active) setOptionsLoading(false); });
    return () => { active = false; };
  }, [billboardIds, form, message, open]);

  const initialNotice = useMemo(() => {
    if (!isBulk) return null;
    return `برای ${billboardIds.length.toLocaleString('fa-IR')} تابلو، درخواست‌های مستقل با اطلاعات مشترک ساخته می‌شود.`;
  }, [billboardIds.length, isBulk]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!isBulk && !values.billboard_id) return;
      setLoading(true);
      const payload = {
        ...values,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
      };
      const result = isBulk
        ? await supabase.rpc('request_billboard_status_changes_bulk', { p_billboard_ids: billboardIds, p_input: payload })
        : await supabase.rpc('request_billboard_status_change', { p_input: payload });
      if (result.error) throw result.error;
      message.success(isBulk ? 'درخواست‌های تغییر وضعیت ثبت شدند.' : 'درخواست تغییر وضعیت ثبت شد.');
      onCreated?.(result.data);
      onClose();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(toFaErrorMessage(error, 'ثبت درخواست تغییر وضعیت ناموفق بود.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={isBulk ? 'تغییر وضعیت گروهی تابلوها' : 'درخواست تغییر وضعیت تابلو'}
      okText="ثبت درخواست"
      cancelText="انصراف"
      onCancel={onClose}
      onOk={() => void handleSubmit()}
      confirmLoading={loading}
      destroyOnHidden
      width={680}
      zIndex={BILLBOARD_STATUS_MODAL_Z_INDEX}
    >
      {initialNotice ? <Alert className="mb-4" type="info" showIcon message={initialNotice} /> : null}
      {optionsLoading ? <div className="flex justify-center py-10"><Spin /></div> : (
        <Form form={form} layout="vertical" className="pt-2">
          {!isBulk ? (
            <Form.Item name="billboard_id" label="تابلو" rules={[{ required: true, message: 'تابلو را انتخاب کنید.' }]}>
              <Select showSearch optionFilterProp="label" options={billboards} placeholder="انتخاب تابلو" getPopupContainer={resolveOverlayPopupContainer} />
            </Form.Item>
          ) : null}
          <Form.Item name="target_status" label="وضعیت مقصد" rules={[{ required: true, message: 'وضعیت مقصد را انتخاب کنید.' }]}>
            <Select options={[...BILLBOARD_STATUS_OPTIONS]} placeholder="انتخاب وضعیت" getPopupContainer={resolveOverlayPopupContainer} />
          </Form.Item>
          {occupancyRequired ? <Alert className="mb-4" type="info" showIcon message="برای این وضعیت، مشتری و بازه اکران الزامی است." /> : null}
          <div className="grid grid-cols-1 gap-x-3 md:grid-cols-2">
            <Form.Item label="نام مشتری" required={occupancyRequired}>
              <Form.Item name="customer_id" rules={[{ required: occupancyRequired, message: 'مشتری را انتخاب کنید.' }]} noStyle><Input type="hidden" /></Form.Item>
              <SmartFieldRenderer field={statusChangeRelationFields.customer} value={formValues.customer_id} onChange={(value) => form.setFieldValue('customer_id', value)} allValues={formValues} moduleId="billboard_status_changes" forceEditMode standalone popupContainer={resolveOverlayPopupContainer} preferLocalPopupContainer overlayZIndexBase={BILLBOARD_STATUS_PICKER_Z_INDEX} />
            </Form.Item>
            <Form.Item label="فاکتور مرتبط">
              <Form.Item name="invoice_id" noStyle><Input type="hidden" /></Form.Item>
              <SmartFieldRenderer field={statusChangeRelationFields.invoice} value={formValues.invoice_id} onChange={(value) => form.setFieldValue('invoice_id', value)} allValues={formValues} moduleId="billboard_status_changes" forceEditMode standalone popupContainer={resolveOverlayPopupContainer} preferLocalPopupContainer overlayZIndexBase={BILLBOARD_STATUS_PICKER_Z_INDEX} />
            </Form.Item>
            <Form.Item label="لید مرتبط">
              <Form.Item name="marketing_lead_id" noStyle><Input type="hidden" /></Form.Item>
              <SmartFieldRenderer field={statusChangeRelationFields.marketingLead} value={formValues.marketing_lead_id} onChange={(value) => form.setFieldValue('marketing_lead_id', value)} allValues={formValues} moduleId="billboard_status_changes" forceEditMode standalone popupContainer={resolveOverlayPopupContainer} preferLocalPopupContainer overlayZIndexBase={BILLBOARD_STATUS_PICKER_Z_INDEX} />
            </Form.Item>
            <Form.Item name="start_date" label="شروع اکران" rules={[{ required: occupancyRequired, message: 'تاریخ شروع را وارد کنید.' }]}>
              <PersianDatePicker type="DATE" className="w-full" modalContainer={resolveOverlayPopupContainer} overlayZIndexBase={BILLBOARD_STATUS_PICKER_Z_INDEX} />
            </Form.Item>
            <Form.Item name="end_date" label="پایان اکران" rules={[{ required: occupancyRequired, message: 'تاریخ پایان را وارد کنید.' }]}>
              <PersianDatePicker type="DATE" className="w-full" modalContainer={resolveOverlayPopupContainer} overlayZIndexBase={BILLBOARD_STATUS_PICKER_Z_INDEX} />
            </Form.Item>
          </div>
          {blocked ? <Form.Item name="block_reason" label="دلیل مسدودسازی" rules={[{ required: true, message: 'دلیل مسدودسازی را وارد کنید.' }]}><Input.TextArea rows={2} /></Form.Item> : null}
          <Form.Item name="process_template_id" label="الگوی فرآیند (اختیاری)">
            <Select allowClear showSearch optionFilterProp="label" options={templates} placeholder="مثلاً فرآیند جمع‌آوری تابلو" getPopupContainer={resolveOverlayPopupContainer} />
          </Form.Item>
          <Form.Item name="description" label="توضیحات">
            <Input.TextArea rows={3} placeholder="شرح درخواست یا نکات اجرایی" />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
};

export default BillboardStatusChangeModal;
