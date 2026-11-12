import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App, Form, Input, Modal, Select, Spin, Tag, Typography } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import {
  AGENT_TONE_STYLES,
  getAgentDefinition,
  type AgentKey,
  type AgentOnboardingQuestion,
  type AgentToneStyle,
} from '../../utils/aiAgentCatalog';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

const { Paragraph, Text } = Typography;

type AiAgentOnboardingWizardProps = {
  open: boolean;
  agentKey: AgentKey | null;
  onClose: () => void;
  onCompleted?: (result: { agentKey: AgentKey; policyJson: Record<string, any>; summaryFa?: string }) => void | Promise<void>;
};

const AiAgentOnboardingWizard: React.FC<AiAgentOnboardingWizardProps> = ({
  open,
  agentKey,
  onClose,
  onCompleted,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<AgentOnboardingQuestion[]>([]);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [savedSummaryFa, setSavedSummaryFa] = useState<string>('');
  const selectedToneStyle = Form.useWatch('toneStyle', form) as AgentToneStyle | undefined;

  const agentDef = getAgentDefinition(agentKey);

  const loadWizard = useCallback(async () => {
    if (!open || !agentKey) return;
    setLoading(true);
    setSavedSummaryFa('');
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'start_agent_onboarding_qa', agentKey },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'دریافت پرسش‌نامه ایجنت ناموفق بود.'));
      const nextQuestions = Array.isArray(data.questions) && data.questions.length > 0
        ? (data.questions as AgentOnboardingQuestion[])
        : (agentDef?.onboardingQuestions || []);
      const existingPolicy = (data.existingPolicy && typeof data.existingPolicy === 'object')
        ? (data.existingPolicy as Record<string, any>)
        : {};
      const initialAnswers: Record<string, string> = {};
      nextQuestions.forEach((q) => {
        const val = existingPolicy[q.policyField] ?? existingPolicy[q.key] ?? '';
        initialAnswers[q.key] = typeof val === 'string' ? val : (val ? JSON.stringify(val) : '');
      });
      setQuestions(nextQuestions);
      setCompletedAt(data.onboardingCompletedAt ? String(data.onboardingCompletedAt) : null);
      form.setFieldsValue({
        toneStyle: data.toneStyle || agentDef?.defaultToneStyle || 'friendly_warm',
        customToneNotes: String(existingPolicy.custom_tone_notes || ''),
        extraInstructions: String(existingPolicy.org_custom_notes || ''),
        answers: initialAnswers,
      });
    } catch (error: any) {
      message.error(toFaErrorMessage(error, 'بارگذاری پرسش‌نامه آنبوردینگ ایجنت ناموفق بود.'));
      setQuestions(agentDef?.onboardingQuestions || []);
    } finally {
      setLoading(false);
    }
  }, [agentDef?.defaultToneStyle, agentDef?.onboardingQuestions, agentKey, form, message, open]);

  useEffect(() => {
    if (open && agentKey) {
      void loadWizard();
    }
  }, [agentKey, loadWizard, open]);

  const handleSubmit = async () => {
    if (!agentKey) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const answersPayload: Record<string, any> = {
        ...(values.answers || {}),
      };
      if (String(values.customToneNotes || '').trim()) {
        answersPayload.custom_tone_notes = String(values.customToneNotes).trim();
      }
      if (String(values.extraInstructions || '').trim()) {
        answersPayload.org_custom_notes = String(values.extraInstructions).trim();
      }
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'submit_agent_onboarding_qa',
          agentKey,
          answers: answersPayload,
          toneStyle: values.toneStyle || 'friendly_warm',
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(String(data?.message || 'ثبت تنظیمات تخصصی ایجنت ناموفق بود.'));
      setSavedSummaryFa(String(data.summaryFa || ''));
      message.success(String(data.message || 'سیاست اختصاصی ایجنت با موفقیت ذخیره شد.'));
      await onCompleted?.({
        agentKey,
        policyJson: data.policyJson || {},
        summaryFa: data.summaryFa || '',
      });
      onClose();
    } catch (error: any) {
      if (Array.isArray(error?.errorFields)) return;
      message.error(toFaErrorMessage(error, 'ذخیره پرسش‌نامه ایجنت ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const formattedCompletedDate = completedAt
    ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(completedAt))
    : null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={() => void handleSubmit()}
      okText="ثبت و اعمال در رفتار ایجنت"
      cancelText="انصراف"
      confirmLoading={saving}
      width={680}
      destroyOnHidden
      title={(
        <div className="flex flex-wrap items-center gap-2" dir="rtl">
          <RobotOutlined style={{ color: agentDef?.badgeColor || undefined }} />
          <span>پرسش و پاسخ تکمیلی: {agentDef?.titleFa || 'ایجنت هوشمند'}</span>
          {formattedCompletedDate ? (
            <Tag color="green" className="m-0 text-[11px]">تکمیل‌شده: {formattedCompletedDate}</Tag>
          ) : null}
        </div>
      )}
    >
      <div dir="rtl" className="space-y-4">
        <Alert
          type="info"
          showIcon
          message="شخصی‌سازی رفتار ایجنت برای این سازمان"
          description={agentDef?.roleFocusFa || 'پاسخ‌های شما در پرامپت رسمی سازمان ذخیره می‌شود و از این پس همه اجراهای این ایجنت مطابق آن عمل می‌کنند.'}
        />

        {savedSummaryFa ? (
          <Alert type="success" showIcon message="خلاصه سیاست ذخیره‌شده" description={savedSummaryFa} />
        ) : null}

        {loading ? (
          <div className="flex justify-center py-8">
            <Spin />
          </div>
        ) : (
          <Form form={form} layout="vertical">
            <Form.Item name="toneStyle" label="لحن پیش‌فرض پاسخ‌گویی این ایجنت">
              <Select
                options={AGENT_TONE_STYLES.map((item) => ({
                  value: item.value,
                  label: `${item.labelFa} — ${item.descriptionFa}`,
                }))}
              />
            </Form.Item>

            {selectedToneStyle === 'custom' ? (
              <Form.Item
                name="customToneNotes"
                label="توضیح لحن سفارشی سازمان"
                extra="مثلاً: همیشه با «سلام همکار گرامی» شروع شود و خیلی کوتاه و مودبانه پاسخ دهد."
              >
                <Input.TextArea rows={2} placeholder="ویژگی‌های لحن دلخواه این ایجنت را بنویسید..." />
              </Form.Item>
            ) : null}

            {questions.map((question, index) => (
              <Form.Item
                key={question.key}
                name={['answers', question.key]}
                label={(
                  <span className="font-semibold">
                    {`${index + 1}. ${question.questionFa}`}
                  </span>
                )}
                extra={question.helperFa ? <Text type="secondary" className="text-xs">{question.helperFa}</Text> : undefined}
              >
                <Input.TextArea rows={2} placeholder={question.placeholderFa} />
              </Form.Item>
            ))}

            <Form.Item
              name="extraInstructions"
              label="قوانین یا استثناهای اضافه این سازمان (اختیاری)"
            >
              <Input.TextArea
                rows={2}
                placeholder="هر نکته، محدودیت یا نکته اختصاصی دیگری که این ایجنت باید بداند..."
              />
            </Form.Item>
            <Paragraph type="secondary" className="!mb-0 text-xs">
              هر زمان که نیاز داشتید می‌توانید همین پرسش‌نامه را دوباره باز و ویرایش کنید.
            </Paragraph>
          </Form>
        )}
      </div>
    </Modal>
  );
};

export default AiAgentOnboardingWizard;
