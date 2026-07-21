import React, { useEffect, useState } from 'react';
import { App, Button, Empty, List, Modal, Spin } from 'antd';
import { ArrowLeftOutlined, FormOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import {
  createRelatedSurveyWebFormPath,
  fetchActiveSurveyWebForms,
  type RelatedSurveyWebForm,
} from '../../utils/relatedSurveyWebForms';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

type RelatedSurveyWebFormModalProps = {
  open: boolean;
  relatedModuleId: string;
  relatedRecordId: string;
  onClose: () => void;
};

const RelatedSurveyWebFormModal: React.FC<RelatedSurveyWebFormModalProps> = ({
  open,
  relatedModuleId,
  relatedRecordId,
  onClose,
}) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [forms, setForms] = useState<RelatedSurveyWebForm[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingFormId, setStartingFormId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void fetchActiveSurveyWebForms(supabase)
      .then((items) => {
        if (!cancelled) setForms(items);
      })
      .catch((error) => {
        if (!cancelled) {
          setForms([]);
          message.error(toFaErrorMessage(error, 'خواندن وب‌فرم‌های نظرسنجی ناموفق بود.'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [message, open]);

  const handleStart = async (form: RelatedSurveyWebForm) => {
    if (startingFormId) return;
    try {
      setStartingFormId(form.id);
      const path = await createRelatedSurveyWebFormPath(supabase, {
        webFormId: form.id,
        relatedModuleId,
        relatedRecordId,
      });
      onClose();
      navigate(path);
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'باز کردن وب‌فرم نظرسنجی ناموفق بود.'));
    } finally {
      setStartingFormId(null);
    }
  };

  return (
    <Modal
      title="انتخاب وب‌فرم نظرسنجی"
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>انصراف</Button>}
      destroyOnHidden
      width={560}
      zIndex={12640}
    >
      <p className="mb-4 text-sm leading-7 text-gray-500">
        پس از انتخاب، همان وب‌فرم باز می‌شود و پاسخ ثبت‌شده خودکار به این رکورد مرتبط خواهد بود.
      </p>
      {loading ? (
        <div className="flex justify-center py-10"><Spin /></div>
      ) : forms.length === 0 ? (
        <Empty description="وب‌فرم نظرسنجی فعالی یافت نشد." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          dataSource={forms}
          renderItem={(form) => (
            <List.Item
              actions={[
                <Button
                  key="start"
                  type="primary"
                  className="kalam-btn-brand"
                  icon={<ArrowLeftOutlined />}
                  loading={startingFormId === form.id}
                  onClick={() => { void handleStart(form); }}
                >
                  شروع
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<FormOutlined className="mt-1 text-lg text-[rgba(var(--brand-600-rgb),1)]" />}
                title={<span className="font-bold">{form.name}</span>}
                description={form.description || 'بدون توضیح'}
              />
            </List.Item>
          )}
        />
      )}
    </Modal>
  );
};

export default RelatedSurveyWebFormModal;
