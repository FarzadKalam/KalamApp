import React, { useMemo, useState } from 'react';
import { Avatar, Button, Segmented, Select, Tag, Tooltip } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import TaskActionButtons from '../components/tasks/TaskActionButtons';
import ProcessCardsV2, {
  type ProcessV2CardData,
  type ProcessV2RunCard,
  type ProcessV2TemplateCard,
  type ProcessV2TemplateOption,
  type ProcessV2Variant,
} from '../components/processes/ProcessCardsV2';

type ActivityCardPreview = {
  id: string;
  title: string;
  status: string;
  assignee: string;
  role?: string;
  due: string;
  actionCount: number;
  tags: Array<{ label: string; color: string }>;
  process: ProcessV2RunCard;
  statusOptions?: Array<{ value: string; label: string; color?: string; icon?: string }>;
};

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

const activityCardsSeed: ActivityCardPreview[] = [
  {
    id: 'activity_1',
    title: 'ارسال پیشنهاد اصلاح شده برای شرکت آفتاب',
    status: 'manager_approval',
    assignee: 'رضا نوری',
    role: 'مدیر فروش',
    due: 'امروز ۱۲:۰۰',
    actionCount: 3,
    tags: [
      { label: 'مشتری مهم', color: '#d97706' },
      { label: 'فروش', color: '#2563eb' },
    ],
    process: runsSeed[0],
    statusOptions: [
      { value: 'manager_approval', label: 'منتظر تایید مدیر', color: 'gold', icon: 'approve' },
      { value: 'delivery_check', label: 'کنترل تحویل', color: 'blue', icon: 'delivery' },
      { value: 'purchase_followup', label: 'پیگیری خرید', color: 'purple', icon: 'shopping' },
    ],
  },
  {
    id: 'activity_2',
    title: 'هماهنگی حمل و تحویل کالا',
    status: 'delivery_check',
    assignee: 'واحد عملیات',
    role: 'تیم اجرا',
    due: 'فردا ۰۹:۳۰',
    actionCount: 5,
    tags: [
      { label: 'عملیات', color: '#059669' },
      { label: 'فوری', color: '#dc2626' },
    ],
    process: runsSeed[1],
    statusOptions: [
      { value: 'delivery_check', label: 'کنترل حمل', color: 'blue', icon: 'delivery' },
      { value: 'question_pending', label: 'نیازمند بررسی', color: 'orange', icon: 'question' },
    ],
  },
];

const ActivityCardV2Preview: React.FC<{ item: ActivityCardPreview }> = ({ item }) => {
  const [status, setStatus] = useState(item.status);
  const [locked, setLocked] = useState(false);
  const statusTask = { id: item.id, name: item.title, status, recurrence_info: { process_task_status_options: item.statusOptions || [] } };
  const statusOptions = [
    { value: 'todo', label: 'انجام نشده' },
    { value: 'in_progress', label: 'در حال انجام' },
    { value: 'review', label: 'بازبینی' },
    { value: 'done', label: 'تکمیل شده' },
    ...(item.statusOptions || []),
  ];

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-dark-surface">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 px-3 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 line-clamp-2 text-sm font-black leading-6 text-slate-900 dark:text-white">
            {item.title}
          </h2>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-400">
            {locked ? (
              <span className="inline-flex items-center gap-1 text-red-500">
                <LockOutlined />
                <span>قفل شده</span>
              </span>
            ) : null}
            {item.tags.slice(0, 3).map((tag) => (
              <Tag
                key={tag.label}
                className="!m-0 !rounded-full !border-0 !px-1.5 !py-0 !text-[10px] !font-bold !text-white"
                style={{ backgroundColor: tag.color }}
              >
                {tag.label}
              </Tag>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-50 px-2 py-1.5 dark:bg-white/5">
          <Avatar size={28} className="!bg-[rgb(var(--brand-600-rgb))] !text-xs !font-black">
            {item.assignee.slice(0, 1)}
          </Avatar>
          <div className="min-w-0 text-right">
            <div className="max-w-[8rem] truncate text-xs font-black text-slate-700 dark:text-slate-100">{item.assignee}</div>
            <div className="max-w-[8rem] truncate text-[10px] font-semibold text-slate-400">{item.role || 'مسئول'}</div>
          </div>
        </div>
      </div>
      <div className="mx-3 mb-2 rounded-xl border border-slate-100 bg-slate-50/80 px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <Tooltip title={locked ? 'قفل شده' : 'قفل کردن'}>
              <Button
                type="text"
                size="small"
                shape="circle"
                icon={<LockOutlined />}
                onClick={() => setLocked((current) => !current)}
                className={locked ? '!text-red-600' : '!text-slate-500'}
                aria-label={locked ? 'باز کردن قفل نمونه' : 'قفل کردن نمونه'}
              />
            </Tooltip>
            <TaskActionButtons
              task={statusTask}
              disabled={locked}
              showReview
              localOnly
              statusOptions={statusOptions}
              onTaskUpdated={async (nextTask) => {
                if (nextTask?.status) setStatus(String(nextTask.status));
              }}
            />
          </div>
          <Select
            size="small"
            value={status}
            options={statusOptions.map((option) => ({ label: option.label, value: option.value }))}
            onChange={(value) => setStatus(String(value))}
            disabled={locked}
            className="min-w-[132px] [&_.ant-select-selector]:!rounded-lg [&_.ant-select-selector]:!border-0 [&_.ant-select-selector]:!bg-white dark:[&_.ant-select-selector]:!bg-white/10"
          />
        </div>
      </div>
      <div className="px-2 pb-2">
        <ProcessCardsV2 item={item.process} variant="compact" />
      </div>
    </article>
  );
};

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

        <section className="grid gap-4">
          <div className="text-sm font-black text-slate-700 dark:text-slate-100">کارت های فعالیت ها</div>
          <div className="grid gap-3 xl:grid-cols-2">
            {activityCardsSeed.map((activity) => (
              <ActivityCardV2Preview key={activity.id} item={activity} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};

export default ProcessCardsV2Lab;
