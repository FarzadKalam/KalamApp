import React from 'react';
import { CheckCircleOutlined, ExclamationCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Tag } from 'antd';

type Props = { plan: any };

const RISK_LABEL: Record<string, string> = {
  low: 'کم‌ریسک',
  medium: 'نیازمند بررسی',
  high: 'پرریسک',
};

const AiAgentPlanCard: React.FC<Props> = ({ plan }) => {
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  if (!plan || steps.length === 0) return null;
  const risk = String(plan?.risk || 'medium');
  return (
    <div className="mt-2 rounded-xl border border-sky-200/80 bg-sky-50/70 p-2 text-right dark:border-sky-300/15 dark:bg-sky-400/[0.07]" dir="rtl">
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-sky-900 dark:text-sky-100">
        <SafetyCertificateOutlined />
        <span>برنامه عامل</span>
        <Tag color={risk === 'low' ? 'green' : risk === 'high' ? 'red' : 'gold'} className="m-0 text-[10px]">{RISK_LABEL[risk] || 'نیازمند بررسی'}</Tag>
      </div>
      <div className="space-y-1">
        {steps.map((step: any, index: number) => (
          <div key={String(step?.id || index)} className="flex items-start gap-1.5 text-[11px] leading-5 text-slate-600 dark:text-slate-200">
            {step?.requires_confirmation ? <ExclamationCircleOutlined className="mt-1 text-amber-500" /> : <CheckCircleOutlined className="mt-1 text-sky-500" />}
            <span>{String(step?.status_message || 'در حال آماده‌سازی عملیات…')}</span>
          </div>
        ))}
      </div>
      {Array.isArray(plan?.clarification_questions) && plan.clarification_questions.length > 0 ? (
        <div className="mt-2 border-t border-sky-200/80 pt-1.5 text-[11px] leading-5 text-slate-600 dark:border-white/10 dark:text-slate-200">
          {plan.clarification_questions.map((question: any, index: number) => <div key={index}>• {String(question)}</div>)}
        </div>
      ) : null}
    </div>
  );
};

export default AiAgentPlanCard;
