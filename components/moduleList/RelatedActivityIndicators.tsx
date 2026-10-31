import React from 'react';
import { Alert, Button, Modal, Spin, Tag, theme } from 'antd';
import { CheckCircleFilled, ClockCircleFilled, DownOutlined, MinusCircleOutlined, PlusOutlined, UnorderedListOutlined, WarningFilled } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import { getRecordTitle } from '../../utils/recordTitle';
import { toPersianNumber, safeJalaliFormat, parseDateValue } from '../../utils/persianNumberFormatter';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';
import { fetchCurrentUserRoleContext } from '../../utils/permissions';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { buildTaskSourceInitialValues } from '../../utils/taskMeta';
import { markModuleListChanged } from '../../utils/moduleListLive';
import { resolveParentOverlayZIndex } from '../../utils/popupContainer';

const ActivityQuickCreate = React.lazy(() => import('../SmartFieldRenderer').then((module) => ({ default: module.RelationQuickCreateHost })));

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

const ACTIVITY_STATES = {
  overdue: { icon: <WarningFilled />, label: 'عقب‌افتاده', className: 'text-red-600 dark:text-red-400', color: 'red' },
  upcoming: { icon: <ClockCircleFilled />, label: 'نزدیک (تا ۷ روز)', className: 'text-amber-700 dark:text-amber-400', color: 'gold' },
  completed: { icon: <CheckCircleFilled />, label: 'انجام‌شده', className: 'text-emerald-700 dark:text-emerald-400', color: 'green' },
  open: { icon: <ClockCircleFilled />, label: 'باز', className: 'text-sky-700 dark:text-sky-400', color: 'blue' },
  empty: { icon: <MinusCircleOutlined />, label: 'بدون فعالیت', className: 'text-slate-500 dark:text-slate-400', color: 'default' },
};

const DETAIL_FIELDS = ['description', 'task_report', 'priority', 'start_date', 'completed_at'];

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
  const { token } = theme.useToken();
  const relation = React.useMemo(() => getActivityRelation(moduleConfig, moduleId), [moduleConfig, moduleId]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [rows, setRows] = React.useState<any[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = React.useState(false);
  const [listZIndex, setListZIndex] = React.useState(token.zIndexPopupBase + 100);
  const [createZIndex, setCreateZIndex] = React.useState(token.zIndexPopupBase + 200);
  const [createAccess, setCreateAccess] = React.useState<{ orgId: string; allowed: boolean } | null>(null);
  const createInitialValues = React.useMemo(() => buildTaskSourceInitialValues(moduleId, recordId), [moduleId, recordId]);
  React.useEffect(() => { setCreateOpen(false); }, [moduleId, recordId]);
  const effectiveSummary = summary || EMPTY_SUMMARY;
  const toggleDetails = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  React.useEffect(() => {
    if (!open || !relation || !recordId) return;
    let cancelled = false;
    setLoading(true);
    setRows([]);
    setError(null);
    setCreateAccess(null);
    setExpandedIds(new Set());
    void (async () => {
      try {
        const context = await fetchCurrentUserRoleContext(supabase);
        if (cancelled) return;
        if (!context.orgId || context.permissions?.tasks?.view === false) {
          throw new Error('دسترسی به فعالیت‌های این سازمان وجود ندارد.');
        }
        setCreateAccess({ orgId: context.orgId, allowed: context.permissions?.tasks?.edit !== false && MODULES.tasks?.disableCreate !== true && MODULES.tasks?.systemManaged !== true });
        const fields = context.permissions?.tasks?.fields;
        const columns = ['name', 'description', 'task_report', 'status', 'due_date', 'priority', 'start_date', 'completed_at']
          .filter((key) => {
            const field = MODULES.tasks?.fields?.find((item: any) => item.key === key);
            return fields?.[key] !== false && (!field?.blockId || fields?.[field.blockId] !== false);
          });
        const { data, error: queryError } = await supabase
          .from('tasks')
          .select(['id', ...columns].join(','))
          .eq('org_id', context.orgId)
          .eq(relation.foreignKey, recordId)
          .order('due_date', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true })
          .limit(100);
        if (queryError) throw queryError;
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (cause) {
        if (!cancelled) setError(toFaErrorMessage(cause, 'بارگذاری فعالیت‌های مرتبط انجام نشد.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, recordId, relation, reload]);

  if (!relation) return null;
  const indicators = !summary
    ? [{ key: 'all', icon: <UnorderedListOutlined />, label: 'فعالیت‌ها', className: 'text-slate-500 dark:text-slate-400', count: null }]
    : effectiveSummary.total === 0
    ? [{ key: 'empty', ...ACTIVITY_STATES.empty, count: 0 }]
    : [
        effectiveSummary.overdue > 0 ? { key: 'overdue', ...ACTIVITY_STATES.overdue, count: effectiveSummary.overdue } : null,
        effectiveSummary.upcoming > 0 ? { key: 'upcoming', ...ACTIVITY_STATES.upcoming, count: effectiveSummary.upcoming } : null,
        effectiveSummary.completed > 0 ? { key: 'completed', ...ACTIVITY_STATES.completed, count: effectiveSummary.completed } : null,
        effectiveSummary.open > 0 && effectiveSummary.overdue === 0 && effectiveSummary.upcoming === 0 ? { key: 'open', ...ACTIVITY_STATES.open, count: effectiveSummary.open } : null,
      ].filter(Boolean).slice(0, 2) as any[];

  return (
    <div className="min-w-0" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
        {indicators.map((item: any) => (
          <button key={item.key} type="button" className={`inline-flex min-h-8 min-w-8 items-center justify-center gap-1 rounded-full px-1.5 text-xs transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 dark:hover:bg-white/10 max-sm:min-h-11 max-sm:min-w-11 ${item.className}`} onClick={(event) => {
            setListZIndex(resolveParentOverlayZIndex(event.currentTarget, token.zIndexPopupBase) + 100);
            setOpen(true);
          }} title={item.label} aria-label={item.key === 'empty' || item.key === 'all' ? item.label : `${item.label}: ${toPersianNumber(item.count)}`}>
            {item.icon}{item.key !== 'all' && item.key !== 'empty' ? <span className="text-[11px] font-semibold">{toPersianNumber(item.count)}</span> : null}
          </button>
        ))}
      </div>
      <Modal open={open} title={<div className="flex items-center justify-between gap-2 pl-7">
        <span>{relation.label}</span>
        {createAccess?.allowed ? <Button type="primary" aria-label="ایجاد فعالیت" icon={<PlusOutlined />} onClick={(event) => {
          setCreateZIndex(resolveParentOverlayZIndex(event.currentTarget, listZIndex) + 100);
          setCreateOpen(true);
        }}>ایجاد فعالیت</Button> : null}
      </div>} zIndex={listZIndex} footer={null} onCancel={(event) => { event.stopPropagation(); setOpen(false); }} destroyOnHidden>
        <div className="max-h-[65vh] overflow-y-auto" dir="rtl">
          <div role="note" aria-label="راهنمای وضعیت فعالیت‌ها" style={{ backgroundColor: token.colorBgElevated }} className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 py-2 text-[11px] dark:border-white/10">
            {Object.entries(ACTIVITY_STATES).map(([key, state]) => (
              <span key={key} className={`inline-flex items-center gap-1 ${state.className}`}>
                {state.icon}<span>{state.label}</span>
              </span>
            ))}
          </div>
          {loading ? <div className="flex justify-center py-8"><Spin /></div> : error ? (
            <Alert type="error" showIcon message={error} action={<Button size="small" onClick={() => setReload((value) => value + 1)}>تلاش دوباره</Button>} />
          ) : rows.length === 0 ? <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-slate-500"><MinusCircleOutlined className="text-xl" /><span>فعالیتی برای این رکورد ثبت نشده است.</span></div> : (
          <div className="space-y-2">
            {rows.map((row) => {
              const state = activityState(row);
              const due = parseDateValue(row?.due_date);
              const meta = ACTIVITY_STATES[state];
              const title = getRecordTitle(row, MODULES.tasks, { fallback: 'فعالیت' });
              const expanded = expandedIds.has(row.id);
              return <div key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
                <button type="button" className="flex min-h-11 w-full items-start justify-between gap-2 rounded-md text-right focus-visible:outline focus-visible:outline-2" onClick={() => { setOpen(false); openTaskProcessModal({ taskId: row.id }); }} aria-label={`بازکردن فعالیت ${title}`}>
                  <span className="min-w-0">
                    <span className="block break-words font-semibold text-slate-800 hover:underline dark:text-slate-100">{title}</span>
                    {due ? <span className="mt-1 block text-xs text-slate-500">موعد: {safeJalaliFormat(due, 'YYYY/MM/DD HH:mm')}</span> : null}
                  </span>
                  <Tag className="!m-0 shrink-0 !border-0" color={meta.color}>{meta.label}</Tag>
                </button>
                {expanded ? <dl className="mt-3 space-y-3 text-xs leading-6 text-slate-600 dark:text-slate-300">
                  {DETAIL_FIELDS.filter((key) => row[key] !== undefined && row[key] !== null && row[key] !== '').map((key) => {
                    const field = MODULES.tasks?.fields?.find((item: any) => item.key === key);
                    const value = key === 'priority'
                      ? field?.options?.find((option: any) => String(option.value) === String(row[key]))?.label || 'ثبت شده'
                      : key.endsWith('_date') || key.endsWith('_at') ? safeJalaliFormat(row[key], 'YYYY/MM/DD HH:mm') : row[key];
                    return <div key={key}><dt className="font-semibold text-slate-500">{getFieldLabelFa(field, { moduleId: 'tasks', fieldKey: key })}</dt><dd className="m-0 whitespace-pre-wrap break-words">{value}</dd></div>;
                  })}
                  {!DETAIL_FIELDS.some((key) => row[key] !== undefined && row[key] !== null && row[key] !== '') ? <div>جزئیات بیشتری ثبت نشده است.</div> : null}
                </dl> : null}
                <button type="button" className="mt-1 flex min-h-9 w-full items-center justify-center gap-1 rounded-md text-xs text-slate-500 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 dark:hover:bg-white/5 max-sm:min-h-11" aria-expanded={expanded} aria-label={`${expanded ? 'بستن' : 'نمایش'} جزئیات ${title}`} onClick={() => toggleDetails(row.id)}>
                  <DownOutlined className={`transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} /><span>{expanded ? 'بستن جزئیات' : 'جزئیات'}</span>
                </button>
              </div>;
            })}
          </div>
        )}
        </div>
      </Modal>
      {createOpen ? <React.Suspense fallback={<Spin />}>
        <ActivityQuickCreate open targetModuleId="tasks" label="فعالیت" forceInline overlayZIndexBase={createZIndex}
          initialValues={createInitialValues} onCancel={() => setCreateOpen(false)}
          onCreated={({ id, values }) => {
            setCreateOpen(false);
            setReload((value) => value + 1);
            if (!createAccess?.orgId) return;
            markModuleListChanged({ org_id: createAccess.orgId, module_id: 'tasks', record_id: String(id || ''), action: 'insert', record_patch: values });
            markModuleListChanged({ org_id: createAccess.orgId, module_id: moduleId, record_id: recordId, action: 'update' });
          }} />
      </React.Suspense> : null}
    </div>
  );
};

export default RelatedActivityIndicators;
