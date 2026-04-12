import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { supabase } from '../../supabaseClient';
import ProductionStagesField from '../ProductionStagesField';
import { OPEN_TASK_PROCESS_MODAL_EVENT } from '../../utils/taskProcessModalEvents';

type TaskProcessTarget = {
  moduleId: string;
  recordId: string;
  lineId: string | null;
};

const resolveTaskProcessTarget = (task: any): TaskProcessTarget | null => {
  if (!task || typeof task !== 'object') return null;
  const relatedModuleId = String(task?.related_to_module || '').trim();
  const relatedRecordId =
    task?.related_production_order
    || task?.project_id
    || task?.marketing_lead_id
    || task?.related_customer
    || task?.related_supplier
    || task?.related_invoice
    || task?.purchase_invoice_id;
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
    recordId: String(relatedRecordId),
    lineId: task?.production_line_id ? String(task.production_line_id) : null,
  };
};

const TASK_MODAL_SELECT = 'id,name,title,status,related_to_module,related_production_order,project_id,marketing_lead_id,related_customer,related_supplier,related_invoice,purchase_invoice_id,production_line_id';

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
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('tasks')
          .select(TASK_MODAL_SELECT)
          .eq('id', resolvedTaskId)
          .maybeSingle();
        if (error) throw error;
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
        if (!mountedRef.current) return;
        setTask(providedTask);
        setHostKey((prev) => prev + 1);
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
            <ProductionStagesField
              key={`${hostKey}-${String(task.id)}`}
              recordId={target.recordId}
              moduleId={target.moduleId}
              autoOpenTaskId={String(task.id)}
              readOnly
              compact
              cardCompact
              allowReportEditInReadOnly
              lazyLoad={false}
              onlyLineId={target.lineId}
              forceProcessRecordMode
            />
          </div>
        ) : null
      )}
    </>
  );
};

export default GlobalTaskProcessModalHost;

