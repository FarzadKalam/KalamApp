import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { supabase } from '../../supabaseClient';
import { OPEN_TASK_PROCESS_MODAL_EVENT } from '../../utils/taskProcessModalEvents';
import { runSelectWithCompatibleColumns } from '../../utils/selectCompat';
import { resolveTaskSourceLink } from '../../utils/taskMeta';

const ProductionStagesField = React.lazy(() => import('../ProductionStagesField'));

type TaskProcessTarget = {
  moduleId: string;
  recordId: string;
  lineId: string | null;
};

const resolveTaskProcessTarget = (task: any): TaskProcessTarget | null => {
  if (!task || typeof task !== 'object') return null;
  const sourceLink = resolveTaskSourceLink(task);
  const relatedModuleId = String(sourceLink.moduleId || '').trim();
  const relatedRecordId = String(sourceLink.recordId || '').trim();
  if (!relatedModuleId || !relatedRecordId) {
    const taskId = String(task?.id || '').trim();
    if (!taskId) return null;
    return {
      moduleId: 'tasks',
      recordId: taskId,
      lineId: null,
    };
  }
  return {
    moduleId: relatedModuleId,
    recordId: relatedRecordId,
    lineId: task?.production_line_id ? String(task.production_line_id) : null,
  };
};

const TASK_MODAL_SELECT_COLUMNS = [
  'id',
  'name',
  'status',
  'related_to_module',
  'source_module_id',
  'source_record_id',
  'related_product',
  'related_production_order',
  'project_id',
  'marketing_lead_id',
  'related_customer',
  'related_supplier',
  'related_invoice',
  'purchase_invoice_id',
  'production_line_id',
  'assignee_id',
  'assignee_role_id',
  'assignee_type',
] as const;

const GlobalTaskProcessModalHost: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [task, setTask] = useState<any | null>(null);
  const [hostKey, setHostKey] = useState(0);
  const mountedRef = useRef(true);

  const target = useMemo(() => resolveTaskProcessTarget(task), [task]);

  useEffect(() => {
    mountedRef.current = true;
    const handleOpen = async (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail || {};
      const providedTask = detail?.task && typeof detail.task === 'object' ? detail.task : null;
      const resolvedTaskId = String(detail?.taskId || providedTask?.id || '').trim();
      if (!resolvedTaskId) return;
      if (!mountedRef.current) return;
      if (providedTask) {
        setTask(providedTask);
        setHostKey((prev) => prev + 1);
        return;
      }
      setLoading(true);
      try {
        const result = await runSelectWithCompatibleColumns<any>({
          cacheKey: 'tasks:modal',
          columns: TASK_MODAL_SELECT_COLUMNS,
          execute: (selectExpr) =>
            supabase
              .from('tasks')
              .select(selectExpr)
              .eq('id', resolvedTaskId)
              .maybeSingle(),
        });
        if (result.error) throw result.error;
        const data = result.data;
        const nextTask = data || providedTask;
        if (!nextTask) {
          message.warning('فعالیت موردنظر پیدا نشد.');
          return;
        }
        if (!mountedRef.current) return;
        setTask(nextTask);
        setHostKey((prev) => prev + 1);
      } catch {
        if (!providedTask) {
          message.error('باز کردن جزئیات فعالیت ناموفق بود.');
          return;
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    window.addEventListener(OPEN_TASK_PROCESS_MODAL_EVENT, handleOpen as EventListener);
    return () => {
      mountedRef.current = false;
      window.removeEventListener(OPEN_TASK_PROCESS_MODAL_EVENT, handleOpen as EventListener);
    };
  }, [message]);

  return (
    <>
      {loading ? null : (
        target && task?.id ? (
          <div style={{ display: 'none' }} aria-hidden="true">
            <React.Suspense fallback={null}>
              <ProductionStagesField
                key={`${hostKey}-${String(task.id)}`}
                recordId={target.recordId}
                moduleId={target.moduleId}
                autoOpenTaskId={String(task.id)}
                autoOpenTask={task}
                readOnly
                compact
                cardCompact
                allowReportEditInReadOnly
                lazyLoad={false}
                onlyLineId={target.lineId}
                forceProcessRecordMode
              />
            </React.Suspense>
          </div>
        ) : null
      )}
    </>
  );
};

export default GlobalTaskProcessModalHost;

