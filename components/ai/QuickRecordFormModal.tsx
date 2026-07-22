import React from 'react';
import { Modal } from 'antd';
import AiRecordMutationApprovalCard, { type AiRecordMutationDraft } from './AiRecordMutationApprovalCard';

type Props = {
  open: boolean;
  actionType: 'create_record_from_prompt' | 'update_record_from_prompt';
  moduleId: string;
  moduleLabel?: string | null;
  schema: any;
  records: AiRecordMutationDraft[];
  loading?: boolean;
  onChange: (records: AiRecordMutationDraft[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

const QuickRecordFormModal: React.FC<Props> = ({
  open,
  actionType,
  moduleId,
  moduleLabel,
  schema,
  records,
  loading = false,
  onChange,
  onCancel,
  onConfirm,
}) => (
  <Modal
    open={open}
    title={`${actionType === 'update_record_from_prompt' ? 'ویرایش' : 'افزودن سریع'}: ${String(moduleLabel || schema?.moduleLabel || 'رکورد')}`}
    okText="تایید و اجرا"
    cancelText="بازگشت"
    confirmLoading={loading}
    onCancel={onCancel}
    onOk={onConfirm}
    destroyOnHidden
    width={typeof window !== 'undefined' && window.innerWidth < 768 ? 'calc(100vw - 0.75rem)' : 680}
    styles={{ body: { maxHeight: '70dvh', overflowY: 'auto' } }}
  >
    <p className="mb-3 text-xs leading-6 text-slate-500">
      همه فیلدهای قابل ویرایش این بخش در دسترس‌اند. اطلاعات را بررسی یا کامل کنید؛ ثبت نهایی فقط پس از تایید انجام می‌شود.
    </p>
    <AiRecordMutationApprovalCard
      actionType={actionType}
      moduleId={moduleId}
      schema={schema}
      records={records}
      onChange={onChange}
    />
  </Modal>
);

export default QuickRecordFormModal;
