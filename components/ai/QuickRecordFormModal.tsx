import React, { useMemo } from 'react';
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
}) => {
  const selectedCount = useMemo(
    () => records.filter((record) => record.selected !== false).length,
    [records],
  );
  const verb = actionType === 'update_record_from_prompt' ? 'ویرایش' : 'ثبت';

  return (
    <Modal
      open={open}
      title={`${actionType === 'update_record_from_prompt' ? 'ویرایش' : 'افزودن سریع'}: ${String(moduleLabel || schema?.moduleLabel || 'رکورد')}`}
      okText={selectedCount > 0 ? `تایید و ${verb} ${selectedCount.toLocaleString('fa-IR')} مورد` : 'موردی برای اجرا انتخاب نشده است'}
      cancelText="بازگشت"
      okButtonProps={{ disabled: selectedCount === 0 }}
      confirmLoading={loading}
      onCancel={onCancel}
      onOk={onConfirm}
      destroyOnHidden
      width={typeof window !== 'undefined' && window.innerWidth < 768 ? 'calc(100vw - 0.75rem)' : 680}
      styles={{ body: { maxHeight: '70dvh', overflowY: 'auto' } }}
    >
      <p className="mb-3 text-xs leading-6 text-slate-500">
        همه فیلدهای قابل ویرایش این بخش در دسترس‌اند. در چند مورد، با فلش‌ها بین پیش‌نویس‌ها جابه‌جا شوید و هر مورد را جداگانه برای {verb} انتخاب کنید؛ اجرای نهایی فقط برای موارد انتخاب‌شده و پس از تایید انجام می‌شود.
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
};

export default QuickRecordFormModal;
