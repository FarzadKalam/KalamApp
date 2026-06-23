import React, { useMemo, useState } from 'react';
import { Segmented } from 'antd';
import ProcessCardsV2, {
  type ProcessV2CardData,
  type ProcessV2RunCard,
  type ProcessV2TemplateCard,
  type ProcessV2TemplateOption,
  type ProcessV2Variant,
} from '../components/processes/ProcessCardsV2';

const templatesSeed: ProcessV2TemplateCard[] = [
  {
    mode: 'template',
    id: 'template_sales',
    title: 'الگوی فرآیند فروش سازمانی',
    moduleLabel: 'سرنخ و مشتری',
    activatorLabel: 'ثبت یا تغییر وضعیت سرنخ',
    lanes: [
      {
        id: 'lane_sales_main',
        title: 'ردیف اصلی فروش',
        stages: [
          { id: 'stage_sales_1', title: 'بررسی اولیه', kind: 'draft', status: 'draft', assigneeLabel: 'کارشناس فروش', activityTypeLabel: 'بررسی', actionCount: 2 },
          { id: 'stage_sales_2', title: 'ارسال پیشنهاد', kind: 'draft', status: 'draft', assigneeLabel: 'مدیر فروش', activityTypeLabel: 'ارسال سند', actionCount: 3 },
          { id: 'stage_sales_3', title: 'پیگیری قرارداد', kind: 'draft', status: 'draft', assigneeLabel: 'مسئول قرارداد', activityTypeLabel: 'پیگیری', actionCount: 4 },
        ],
      },
      {
        id: 'lane_sales_finance',
        title: 'ردیف مالی',
        stages: [
          { id: 'stage_finance_1', title: 'کنترل اعتبار', kind: 'draft', status: 'draft', assigneeLabel: 'مالی', activityTypeLabel: 'کنترل', actionCount: 2 },
          { id: 'stage_finance_2', title: 'تایید شرایط پرداخت', kind: 'draft', status: 'draft', assigneeLabel: 'مدیر مالی', activityTypeLabel: 'تایید', actionCount: 3 },
        ],
      },
    ],
  },
  {
    mode: 'template',
    id: 'template_delivery',
    title: 'الگوی تحویل پروژه',
    moduleLabel: 'پروژه ها',
    activatorLabel: 'شروع پروژه یا تغییر فاز',
    lanes: [
      {
        id: 'lane_delivery_main',
        title: 'تحویل و تایید',
        stages: [
          { id: 'stage_delivery_1', title: 'آماده سازی', kind: 'draft', status: 'draft', assigneeLabel: 'تیم اجرا', activityTypeLabel: 'آماده سازی', actionCount: 5 },
          { id: 'stage_delivery_2', title: 'تحویل به مشتری', kind: 'draft', status: 'draft', assigneeLabel: 'مدیر پروژه', activityTypeLabel: 'تحویل', actionCount: 2 },
        ],
      },
    ],
  },
];

const runsSeed: ProcessV2RunCard[] = [
  {
    mode: 'run',
    id: 'run_sales_1',
    title: 'فروش سازمانی شرکت آفتاب',
    templateId: 'template_sales',
    templateTitle: 'الگوی فرآیند فروش سازمانی',
    relatedRecordLabel: 'رکورد مرتبط: شرکت آفتاب',
    statusLabel: 'فعال',
    lanes: [
      {
        id: 'run_lane_sales_main',
        title: 'ردیف اصلی فروش',
        stages: [
          { id: 'run_stage_1', title: 'بررسی اولیه', kind: 'activity', status: 'done', assigneeLabel: 'سارا احمدی', activityTypeLabel: 'تماس خروجی', dueLabel: 'امروز ۱۰:۳۰', actionCount: 4 },
          { id: 'run_stage_2', title: 'ارسال پیشنهاد', kind: 'activity', status: 'active', assigneeLabel: 'رضا نوری', activityTypeLabel: 'ارسال سند', dueLabel: 'فردا ۱۲:۰۰', actionCount: 3 },
          { id: 'run_stage_3', title: 'پیگیری قرارداد', kind: 'draft', status: 'draft', assigneeLabel: 'در انتظار ارجاع', activityTypeLabel: 'پیگیری', actionCount: 2 },
        ],
      },
      {
        id: 'run_lane_sales_finance',
        title: 'ردیف مالی',
        stages: [
          { id: 'run_stage_4', title: 'کنترل اعتبار', kind: 'activity', status: 'blocked', assigneeLabel: 'واحد مالی', activityTypeLabel: 'کنترل', dueLabel: 'امروز ۱۵:۰۰', actionCount: 6 },
          { id: 'run_stage_5', title: 'تایید شرایط پرداخت', kind: 'draft', status: 'draft', assigneeLabel: 'مدیر مالی', activityTypeLabel: 'تایید', actionCount: 3 },
        ],
      },
    ],
  },
  {
    mode: 'run',
    id: 'run_delivery_1',
    title: 'تحویل کمپین بهار',
    templateId: 'template_delivery',
    templateTitle: 'الگوی تحویل پروژه',
    relatedRecordLabel: 'رکورد مرتبط: پروژه کمپین بهار',
    statusLabel: 'در انتظار',
    lanes: [
      {
        id: 'run_lane_delivery',
        title: 'تحویل و تایید',
        collapsed: true,
        stages: [
          { id: 'run_stage_6', title: 'آماده سازی', kind: 'activity', status: 'active', assigneeLabel: 'تیم اجرا', activityTypeLabel: 'آماده سازی', dueLabel: 'پس فردا', actionCount: 5 },
          { id: 'run_stage_7', title: 'تحویل به مشتری', kind: 'draft', status: 'draft', assigneeLabel: 'مدیر پروژه', activityTypeLabel: 'تحویل', actionCount: 2 },
        ],
      },
    ],
  },
];

let runSeed = 0;
const cloneCard = <T extends ProcessV2CardData>(card: T): T => {
  runSeed += 1;
  return {
    ...card,
    id: `${card.id}_copy_${runSeed}`,
    title: `${card.title} کپی`,
    lanes: card.lanes.map((lane) => ({
      ...lane,
      id: `${lane.id}_copy_${runSeed}`,
      stages: lane.stages.map((stage) => ({ ...stage, id: `${stage.id}_copy_${runSeed}` })),
    })),
  };
};

const ProcessCardsV2Lab: React.FC = () => {
  const [templates, setTemplates] = useState<ProcessV2TemplateCard[]>(templatesSeed);
  const [runs, setRuns] = useState<ProcessV2RunCard[]>(runsSeed);
  const [variant, setVariant] = useState<ProcessV2Variant>('full');

  const templateOptions = useMemo<ProcessV2TemplateOption[]>(
    () => templates.map((template) => ({ id: template.id, title: template.title })),
    [templates],
  );

  const addRun = () => {
    const source = runs[0];
    if (!source) return;
    setRuns((current) => [cloneCard(source), ...current]);
  };

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 dark:bg-dark-bg md:px-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-dark-surface">
          <div className="min-w-0">
            <h1 className="m-0 text-lg font-black text-slate-900 dark:text-white">نمونه آزمایشی کارت های فرآیند V2</h1>
          </div>
          <Segmented
            size="small"
            value={variant}
            onChange={(value) => setVariant(value as ProcessV2Variant)}
            options={[
              { label: 'نمای اصلی', value: 'full' },
              { label: 'فشرده', value: 'compact' },
              { label: 'ستونی', value: 'column' },
            ]}
          />
        </header>

        <section className="grid gap-4">
          <div className="text-sm font-black text-slate-700 dark:text-slate-100">الگوهای فرآیند</div>
          <div className={variant === 'column' ? 'grid gap-4 xl:grid-cols-2' : 'grid gap-4'}>
            {templates.map((template) => (
              <ProcessCardsV2
                key={template.id}
                item={template}
                variant={variant}
                onChange={(next) => setTemplates((current) => current.map((item) => item.id === next.id ? next as ProcessV2TemplateCard : item))}
                onDelete={(id) => setTemplates((current) => current.filter((item) => item.id !== id))}
              />
            ))}
          </div>
        </section>

        <section className="grid gap-4">
          <div className="text-sm font-black text-slate-700 dark:text-slate-100">فرآیندهای در حال اجرا</div>
          <div className={variant === 'column' ? 'grid gap-4 xl:grid-cols-2' : 'grid gap-4'}>
            {runs.map((run) => (
              <ProcessCardsV2
                key={run.id}
                item={run}
                templates={templateOptions}
                variant={variant}
                onChange={(next) => setRuns((current) => current.map((item) => item.id === next.id ? next as ProcessV2RunCard : item))}
                onDelete={(id) => setRuns((current) => current.filter((item) => item.id !== id))}
                onCopy={(id) => setRuns((current) => {
                  const source = current.find((item) => item.id === id);
                  return source ? [cloneCard(source), ...current] : current;
                })}
                onAddRun={addRun}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};

export default ProcessCardsV2Lab;
