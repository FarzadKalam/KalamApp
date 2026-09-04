import React, { useEffect, useState } from 'react';
import { App, Alert, Form, Input, Modal, Radio } from 'antd';
import { supabase } from '../../supabaseClient';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type BillboardStatusChangeDecisionModalProps = {
  open: boolean;
  requestId: string;
  requestStatus?: string | null;
  onClose: () => void;
  onChanged: () => void;
};

const BillboardStatusChangeDecisionModal: React.FC<BillboardStatusChangeDecisionModalProps> = ({
  open,
  requestId,
  requestStatus,
  onClose,
  onChanged,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const decision = Form.useWatch('decision', form);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ decision: 'approve', note: '' });
  }, [form, open]);

  const submit = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      const { error } = await supabase.rpc('decide_billboard_status_change', {
        p_change_id: requestId,
        p_decision: values.decision,
        p_note: values.note || null,
      });
      if (error) throw error;
      if (values.decision === 'approve') {
        const { data: refreshedRequest } = await supabase
          .from('billboard_status_changes')
          .select('request_status')
          .eq('id', requestId)
          .maybeSingle();
        if (refreshedRequest?.request_status === 'needs_review') {
          message.warning('وضعیت تابلو پس از ثبت درخواست تغییر کرده است؛ درخواست نیازمند بازبینی شد.');
        } else {
          message.success('درخواست بررسی و تأیید شد.');
        }
      } else {
        message.success('درخواست رد شد.');
      }
      onChanged();
      onClose();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(toFaErrorMessage(error, 'ثبت تصمیم ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="بررسی درخواست تغییر وضعیت" okText="ثبت تصمیم" cancelText="انصراف" onCancel={onClose} onOk={() => void submit()} confirmLoading={saving} destroyOnHidden>
      {requestStatus !== 'pending_approval' ? <Alert className="mb-4" type="info" showIcon message="این درخواست دیگر در انتظار تأیید نیست و فقط برای مشاهده باز شده است." /> : null}
      <Form form={form} layout="vertical">
        <Form.Item name="decision" label="تصمیم" rules={[{ required: true }]}>
          <Radio.Group disabled={requestStatus !== 'pending_approval'}>
            <Radio value="approve">تأیید و اعمال وضعیت</Radio>
            <Radio value="reject">رد درخواست</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="note" label={decision === 'reject' ? 'دلیل رد' : 'یادداشت تأیید'} rules={[{ required: decision === 'reject', message: 'دلیل رد را وارد کنید.' }]}>
          <Input.TextArea rows={3} disabled={requestStatus !== 'pending_approval'} placeholder={decision === 'reject' ? 'دلیل رد درخواست' : 'یادداشت اختیاری'} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default BillboardStatusChangeDecisionModal;
