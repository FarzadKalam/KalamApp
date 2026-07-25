import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Progress, Space, Spin, Tag, Typography } from 'antd';
import { ArrowRightOutlined, RobotOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toFaErrorMessage } from '../utils/errorMessageFa';
import { calculateMbtiResult, MBTI_TYPE_TITLES, type MbtiAxisResult } from '../utils/mbtiAssessment';
import { hasCurrentOrgPlanFeature } from '../utils/saasPlanFeatures';

const { Paragraph, Text, Title } = Typography;

const AXIS_LABELS: Record<MbtiAxisResult['axis'], string> = {
  ei: 'دریافت انرژی: E / I',
  sn: 'دریافت اطلاعات: S / N',
  tf: 'تصمیم‌گیری: T / F',
  jp: 'شیوه برخورد با کارها: J / P',
};

const axisPercent = (axis: MbtiAxisResult) => {
  const total = axis.positiveScore + axis.negativeScore;
  return total > 0 ? Math.round((Math.max(axis.positiveScore, axis.negativeScore) / total) * 100) : 0;
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
    } catch (error) {
      message.error(toFaErrorMessage(error, 'بارگذاری گزارش نتیجه ناموفق بود.'));
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  useEffect(() => { void loadRecord(); }, [loadRecord]);
  useEffect(() => {
    let cancelled = false;
    void hasCurrentOrgPlanFeature('mbti_ai_analysis').then((enabled) => {
      if (!cancelled) setAiFeatureEnabled(enabled);
    });
    return () => { cancelled = true; };
  }, []);

  const result = useMemo(() => calculateMbtiResult(record || {}), [record]);
  const jobContext = String(record?.position_title || '').trim();

  const runAiAnalysis = async () => {
    if (!id || !record?.mbti_type) {
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
    } catch (error) {
      message.error(toFaErrorMessage(error, 'تحلیل هوشمند نتیجه ناموفق بود.'));
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

      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="rounded-2xl bg-blue-50 px-6 py-4 text-center dark:bg-blue-950/30">
            <div className="text-4xl font-black tracking-wider text-blue-700 dark:text-blue-300">{result.type || '—'}</div>
            <div className="mt-1 text-sm text-blue-800 dark:text-blue-200">{result.type ? MBTI_TYPE_TITLES[result.type] : 'نیازمند تکمیل یا بررسی بیشتر'}</div>
          </div>
          <Paragraph className="!mb-0 max-w-2xl text-sm leading-7">
            این کد فقط بیانگر ترجیح‌های پاسخ‌دهنده در زمان تکمیل فرم است. نزدیکی امتیازها یعنی هر دو شیوه ممکن است برای فرد قابل استفاده باشند.
          </Paragraph>
        </div>
      </Card>

      <Card title="چهار محور نتیجه">
        <div className="grid gap-5 md:grid-cols-2">
          {result.axes.map((axis) => (
            <div key={axis.axis} className="rounded-2xl border border-gray-100 p-4 dark:border-gray-700">
              <div className="mb-2 flex items-center justify-between gap-3">
                <Text strong>{AXIS_LABELS[axis.axis]}</Text>
                <Tag color={axis.preference ? 'blue' : 'gold'}>{axis.preference || 'نزدیک'} · {axis.clarity}</Tag>
              </div>
              <Progress percent={axisPercent(axis)} showInfo={false} strokeColor="#2563eb" trailColor="#e5e7eb" />
              <div className="mt-2 flex justify-between text-sm text-gray-500">
                <span>{axis.positive}: {axis.positiveScore}</span>
                <span>{axis.negative}: {axis.negativeScore}</span>
              </div>
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
            disabled={aiFeatureEnabled !== true || !result.type}
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
