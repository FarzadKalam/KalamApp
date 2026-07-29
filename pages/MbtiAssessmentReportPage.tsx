import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Progress, Space, Spin, Tag, Typography } from 'antd';
import { ArrowRightOutlined, RobotOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import {
  calculateMbtiResult,
  getMbtiProfileSummary,
  MBTI_AXIS_GUIDES,
  MBTI_TYPE_TITLES,
  type MbtiAxisResult,
} from '../utils/mbtiAssessment';
import { hasCurrentOrgPlanFeature } from '../utils/saasPlanFeatures';

const { Paragraph, Text, Title } = Typography;

const axisPositivePercent = (axis: MbtiAxisResult) => {
  const total = axis.positiveScore + axis.negativeScore;
  return total > 0 ? Math.round((axis.positiveScore / total) * 100) : 0;
};

const MbtiAssessmentReportPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [record, setRecord] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiFeatureEnabled, setAiFeatureEnabled] = useState<boolean | null>(null);

  const loadRecord = useCallback(async () => {
    const recordId = String(id || '').trim();
    if (!recordId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mbti_assessments')
        .select('id,title,respondent_name,respondent_phone,respondent_email,position_title,related_employee_id,related_applicant_id,related_job_description_id,mbti_type,result_status,ei_score_e,ei_score_i,sn_score_s,sn_score_n,tf_score_t,tf_score_f,jp_score_j,jp_score_p,ai_analysis,ai_analysis_status,ai_analysis_error,ai_analysis_at,ai_analysis_model,created_at,ei_01,ei_02,ei_03,ei_04,ei_05,ei_06,ei_07,ei_08,sn_01,sn_02,sn_03,sn_04,sn_05,sn_06,sn_07,sn_08,tf_01,tf_02,tf_03,tf_04,tf_05,tf_06,tf_07,tf_08,jp_01,jp_02,jp_03,jp_04,jp_05,jp_06,jp_07,jp_08')
        .eq('id', recordId)
        .maybeSingle();
      if (error) throw error;
      setRecord(data || null);
    } catch (error: unknown) {
      message.error(toFaErrorMessage(error instanceof Error ? error : String(error || ''), 'بارگذاری گزارش نتیجه ناموفق بود.'));
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => { void loadRecord(); }, [loadRecord]);
  useEffect(() => {
    let cancelled = false;
    void hasCurrentOrgPlanFeature('mbti_ai_analysis', { defaultEnabled: true }).then((enabled) => {
      if (!cancelled) setAiFeatureEnabled(enabled);
    });
    return () => { cancelled = true; };
  }, []);

  const result = useMemo(() => calculateMbtiResult(record || {}), [record]);
  const jobContext = String(record?.position_title || '').trim();
  const profileSummary = useMemo(() => getMbtiProfileSummary(result.axes), [result.axes]);

  const runAiAnalysis = async () => {
    if (!id || !result.isComplete) {
      message.warning('برای تحلیل هوشمند، همه پرسش‌های اصلی باید پاسخ داده شده باشند.');
      return;
    }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { action: 'analyze_mbti_assessment', mbtiAssessmentId: id },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(String(data?.message || 'تحلیل هوشمند ناموفق بود.'));
      await loadRecord();
      message.success('تحلیل هوشمند آماده شد.');
    } catch (error: unknown) {
      message.error(toFaErrorMessage(error instanceof Error ? error : String(error || ''), 'تحلیل هوشمند نتیجه ناموفق بود.'));
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <div className="flex min-h-[320px] items-center justify-center"><Spin size="large" /></div>;
  if (!record) return <Alert type="warning" showIcon message="این تست در دسترس نیست یا مجوز مشاهده آن را ندارید." />;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button type="text" icon={<ArrowRightOutlined />} onClick={() => navigate(`/mbti_assessments/${record.id}`)}>بازگشت به تست</Button>
          <Title level={2} className="!mb-1">تحلیل و گزارش نتیجه</Title>
          <Text type="secondary">نتیجه یک خودارزیابی است و برای تشخیص، رتبه‌بندی یا تصمیم استخدامی استفاده نمی‌شود.</Text>
        </div>
        <Tag color={record.result_status === 'ready' ? 'green' : 'gold'}>{record.result_status === 'ready' ? 'نتیجه آماده' : 'پاسخ‌ها ناقص است'}</Tag>
      </div>

      <Card>
        <Descriptions column={{ xs: 1, sm: 2 }} size="small">
          <Descriptions.Item label="پاسخ‌دهنده">{record.respondent_name || 'بدون نام'}</Descriptions.Item>
          <Descriptions.Item label="جایگاه شغلی">{jobContext || 'از ارتباط شغلی تکمیل می‌شود'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="جمع‌بندی قابل فهم نتیجه">
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-2xl bg-blue-50 px-6 py-4 text-center dark:bg-blue-950/30">
            <div className="text-2xl font-black text-blue-700 dark:text-blue-300">{result.type ? `تیپ ${result.type}` : 'پروفایل ترکیبی'}</div>
            <div className="mt-1 text-sm text-blue-800 dark:text-blue-200">{result.type ? MBTI_TYPE_TITLES[result.type] : 'یک یا چند محور ترجیح متعادل دارد'}</div>
          </div>
          <div className="max-w-2xl">
            <Text strong className="text-base">ترجیح‌های دیده‌شده: {profileSummary || 'در انتظار تکمیل پاسخ‌ها'}</Text>
            <Paragraph className="!mb-0 mt-2 text-sm leading-7">
              {result.type
                ? 'کد چهارحرفی، خلاصه‌ای از ترجیح‌های غالب است؛ هر محور را پایین‌تر با زبان ساده ببینید.'
                : 'متعادل بودن یک محور «بی‌نتیجه» نیست؛ یعنی در این پاسخ‌ها برتری روشنی برای یکی از دو شیوه دیده نشده و هر دو شیوه می‌توانند برای فرد در دسترس باشند.'}
            </Paragraph>
          </div>
        </div>
        {!result.isComplete ? <Alert className="mt-4" type="warning" showIcon message="برای تکمیل جمع‌بندی، همه پرسش‌های اصلی باید پاسخ داده شوند." /> : null}
      </Card>

      <Card title="چهار محور نتیجه">
        <div className="grid gap-5 md:grid-cols-2">
          {result.axes.map((axis) => (
            <div key={axis.axis} className="rounded-2xl border border-gray-100 p-4 dark:border-gray-700">
              {(() => {
                const guide = MBTI_AXIS_GUIDES[axis.axis];
                const selected = axis.preference === guide.positive.code
                  ? guide.positive
                  : axis.preference === guide.negative.code ? guide.negative : guide.balanced;
                return <>
              <div className="mb-2 flex items-center justify-between gap-3">
                <Text strong>{guide.title}</Text>
                <Tag color={axis.preference ? 'blue' : 'gold'}>{axis.clarity === 'نامشخص' ? 'متعادل' : axis.clarity}</Tag>
              </div>
              <Text strong>{selected.label}</Text>
              <Paragraph className="!mb-3 mt-1 text-sm leading-7">{selected.description}</Paragraph>
              <Progress percent={axisPositivePercent(axis)} showInfo={false} strokeColor="#2563eb" trailColor="#dbeafe" />
              <Text type="secondary" className="mt-2 block text-xs leading-6">از ۸ پاسخ این محور: {axis.positiveScore} پاسخ نزدیک به «{guide.positive.label}» و {axis.negativeScore} پاسخ نزدیک به «{guide.negative.label}» بوده است.</Text>
                </>;
              })()}
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="تحلیل هوش مصنوعی"
        extra={aiFeatureEnabled === false ? <Tag>در ویژگی‌های پلن فعال نیست</Tag> : null}
      >
        <Space direction="vertical" size="middle" className="w-full">
          <Alert
            type="info"
            showIcon
            message="تحلیل، ترجیح‌های ثبت‌شده را در کنار جایگاه شغلی بررسی می‌کند؛ نتیجه نباید به‌تنهایی مبنای پذیرش، رد یا رتبه‌بندی افراد باشد."
          />
          {record.ai_analysis ? (
            <Paragraph className="whitespace-pre-wrap !mb-0 leading-8">{record.ai_analysis}</Paragraph>
          ) : (
            <Text type="secondary">هنوز تحلیلی ثبت نشده است.</Text>
          )}
          {record.ai_analysis_error ? <Alert type="warning" showIcon message="آخرین تلاش ناموفق بود" description={record.ai_analysis_error} /> : null}
          <Button
            type="primary"
            icon={analyzing ? <ReloadOutlined spin /> : <RobotOutlined />}
            loading={analyzing}
            disabled={aiFeatureEnabled !== true || !result.isComplete}
            onClick={() => void runAiAnalysis()}
          >
            {record.ai_analysis ? 'بازسازی تحلیل هوشمند' : 'تولید تحلیل هوشمند'}
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default MbtiAssessmentReportPage;
