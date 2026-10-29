import React from 'react';
import { App, Modal, Spin, Tag } from 'antd';
import { CheckCircleFilled, ClockCircleFilled, MinusCircleOutlined, WarningFilled } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { getRecordTitle } from '../../utils/recordTitle';
import { toPersianNumber, safeJalaliFormat, parseDateValue } from '../../utils/persianNumberFormatter';

export type RelatedActivitySummary = {
  total: number;
  completed: number;
  overdue: number;
  upcoming: number;
  open: number;
};

type Props = {
  moduleId: string;
  recordId: string;
  moduleConfig?: any;
  summary?: RelatedActivitySummary;
};

const EMPTY_SUMMARY: RelatedActivitySummary = { total: 0, completed: 0, overdue: 0, upcoming: 0, open: 0 };

const getActivityRelation = (moduleConfig: any, moduleId: string) => {
  const tab = (moduleConfig?.relatedTabs || []).find((item: any) => String(item?.targetModule || '') === 'tasks');
  if (tab?.foreignKey) return { foreignKey: String(tab.foreignKey), label: String(tab.title || 'فعالیت‌ها') };
  if (moduleId === 'marketing_leads') return { foreignKey: 'marketing_lead_id', label: 'فعالیت‌های لید' };
  return null;
};

const activityState = (row: any) => {
  const status = String(row?.status || '').toLowerCase();
  const done = ['done', 'completed', 'complete', 'closed', 'finished'].includes(status);
  if (done) return 'completed';
  const due = parseDateValue(row?.due_date);
  if (due && due.valueOf() < Date.now()) return 'overdue';
  if (due && due.valueOf() - Date.now() <= 7 * 86400000) return 'upcoming';
  return 'open';
};

const RelatedActivityIndicators: React.FC<Props> = ({ moduleId, recordId, moduleConfig, summary }) => {
  const { message } = App.useApp();
  const relation = React.useMemo(() => getActivityRelation(moduleConfig, moduleId), [moduleConfig, moduleId]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<any[]>([]);
  const effectiveSummary = summary || EMPTY_SUMMARY;

  const loadActivities = React.useCallback(async () => {
    if (!relation || !recordId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('id,name,title,description,status,due_date,priority')
      .eq(relation.foreignKey, recordId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(100);
    setLoading(false);
    if (error) {
      message.error('بارگذاری فعالیت‌های مرتبط انجام نشد.');
      return;
    }
    setRows(Array.isArray(data) ? data : []);
  }, [message, recordId, relation]);

  React.useEffect(() => {
    if (open) void loadActivities();
  }, [loadActivities, open]);

  if (!relation) return null;
  const indicators = effectiveSummary.total === 0
    ? [{ key: 'empty', icon: <MinusCircleOutlined />, label: 'فعالیتی ثبت نشده', className: 'text-slate-400' }]
    : [
        effectiveSummary.overdue > 0 ? { key: 'overdue', icon: <WarningFilled />, label: 'عقب‌افتاده', count: effectiveSummary.overdue, className: 'text-red-500' } : null,
        effectiveSummary.upcoming > 0 ? { key: 'upcoming', icon: <ClockCircleFilled />, label: 'نزدیک', count: effectiveSummary.upcoming, className: 'text-amber-500' } : null,
        effectiveSummary.completed > 0 ? { key: 'completed', icon: <CheckCircleFilled />, label: 'انجام‌شده', count: effectiveSummary.completed, className: 'text-emerald-500' } : null,
        effectiveSummary.open > 0 && effectiveSummary.overdue === 0 && effectiveSummary.upcoming === 0 ? { key: 'open', icon: <ClockCircleFilled />, label: 'باز', count: effectiveSummary.open, className: 'text-sky-500' } : null,
      ].filter(Boolean).slice(0, 2) as any[];

  return (
    <>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1 border-t border-slate-100 pt-1.5 dark:border-white/10" onClick={(event) => event.stopPropagation()}>
        <span className="text-[9px] text-slate-400">فعالیت</span>
        {indicators.map((item: any) => (
          <button key={item.key} type="button" className={`inline-flex min-h-6 items-center gap-1 rounded-full bg-slate-50 px-1.5 text-[10px] transition hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 ${item.className}`} onClick={() => setOpen(true)} title={item.label}>
            {item.icon}{item.count ? <span className="font-bold">{toPersianNumber(item.count)}</span> : null}
          </button>
        ))}
      </div>
      <Modal open={open} title={relation.label} footer={null} onCancel={() => setOpen(false)} destroyOnHidden>
        {loading ? <div className="flex justify-center py-8"><Spin /></div> : rows.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">فعالیتی برای این رکورد ثبت نشده است.</div> : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {rows.map((row) => {
              const state = activityState(row);
              const due = parseDateValue(row?.due_date);
              return <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-start justify-between gap-2"><div className="font-semibold text-slate-800 dark:text-slate-100">{getRecordTitle(row, MODULES.tasks, { fallback: 'فعالیت' })}</div><Tag color={state === 'completed' ? 'green' : state === 'overdue' ? 'red' : state === 'upcoming' ? 'gold' : 'blue'}>{state === 'completed' ? 'انجام‌شده' : state === 'overdue' ? 'عقب‌افتاده' : state === 'upcoming' ? 'نزدیک' : 'باز'}</Tag></div>
                {due ? <div className="mt-1 text-xs text-slate-500">موعد: {safeJalaliFormat(due, 'YYYY/MM/DD HH:mm')}</div> : null}
                {row.description ? <div className="mt-2 line-clamp-2 text-xs leading-6 text-slate-600 dark:text-slate-300">{row.description}</div> : null}
              </div>;
            })}
          </div>
        )}
      </Modal>
    </>
  );
};

export default RelatedActivityIndicators;
