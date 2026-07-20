import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App } from 'antd';
import { supabase } from '../../supabaseClient';
import { OPEN_TASK_PROCESS_MODAL_EVENT } from '../../utils/taskProcessModalEvents';
import { resolveTaskSourceLink } from '../../utils/taskMeta';
import { markModuleListChanged } from '../../utils/moduleListLive';
import { fetchAssigneeDirectory } from '../../utils/referenceData';
import { resolveAssigneePresentation } from '../../utils/assigneePresentation';
import ProcessTaskModalV2 from '../processes/ProcessTaskModalV2';
import type { ProcessV2CardData, ProcessV2Stage } from '../processes/ProcessCardsV2';
import { mapTaskStatusToStageStatus } from '../processes/ProcessCardsV2';
import {
  loadProcessTaskModalContext,
  mergeProcessTaskModalContext,
} from '../../utils/processTaskModalContext';

type TaskProcessTarget = {
  moduleId: string;
  recordId: string;
  lineId: string | null;
};

type ModalSession = {
  key: number;
  task: any;
};

const isProcessRunStagePreviewTask = (task: any) => {
  if (!task || typeof task !== 'object') return false;
  if (task?.isProcessRunStagePreview && !task?.task_id) return true;
  return String(task?.id || '').trim().startsWith('process_run_stage:');
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

const normalizeText = (value: unknown) => String(value || '').trim();

const parseObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const buildTaskProcessCard = (
  task: any,
  target: TaskProcessTarget | null,
  directory: { users?: any[]; roles?: any[] } | null = null,
): { process: ProcessV2CardData; stage: ProcessV2Stage } | null => {
  const taskId = normalizeText(task?.id);
  if (!taskId) return null;
  const recurrence = parseObject(task?.recurrence_info);
  const metadata = parseObject(task?.metadata);
  const processGroup = parseObject(recurrence?.process_group || metadata?.process_group);
  const source = {
    ...(task || {}),
    recurrence_info: recurrence,
    metadata,
    task_id: taskId,
    __process_v2_has_real_task: true,
  };
  const assignee = resolveAssigneePresentation({
    source: task,
    allUsers: directory?.users || [],
    allRoles: directory?.roles || [],
  });
  const stage: ProcessV2Stage = {
    id: normalizeText(task?.process_run_stage_id || task?.id),
    title: normalizeText(task?.name) || 'فعالیت',
    kind: 'activity',
    status: mapTaskStatusToStageStatus(normalizeText(task?.status) || 'todo'),
    layoutSlot: Number(task?.sort_order || 0) || 0,
    assigneeLabel: assignee.label || normalizeText(task?.assignee_name || task?.assignee_label || task?.assignee_role_title) || 'تعیین نشده',
    assigneeAvatarUrl: assignee.avatarUrl || undefined,
    activityTypeLabel: normalizeText(task?.task_type) || undefined,
    dueLabel: normalizeText(task?.due_date) || undefined,
    actionCount: 0,
    source,
  };
  const templateTitle = normalizeText(processGroup?.template_name || metadata?.source_template_name) || 'فرآیند فعالیت';
  const process: ProcessV2CardData = {
    mode: 'run',
    id: normalizeText(task?.process_run_id || task?.process_group_id || `task:${taskId}`),
    title: templateTitle,
    templateId: normalizeText(task?.source_template_id || processGroup?.template_id),
    templateTitle,
    relatedRecordLabel: target ? `${target.moduleId}:${target.recordId}` : '',
    statusLabel: normalizeText(task?.status) || 'todo',
    lanes: [{
      id: normalizeText(task?.process_group_id || 'task_lane'),
      title: 'ردیف فعالیت',
      stages: [stage],
    }],
  };
  return { process, stage };
};

const GlobalTaskProcessModalHost: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<ModalSession | null>(null);
  const [assigneeDirectory, setAssigneeDirectory] = useState<{ users?: any[]; roles?: any[] } | null>(null);
  const mountedRef = useRef(true);
  const sessionKeyRef = useRef(0);

  const task = session?.task || null;
  const target = useMemo(() => resolveTaskProcessTarget(task), [task]);
  const modalPayload = useMemo(() => buildTaskProcessCard(task, target, assigneeDirectory), [assigneeDirectory, task, target]);

  useEffect(() => {
    let cancelled = false;
    fetchAssigneeDirectory(supabase)
      .then((directory) => {
        if (!cancelled) setAssigneeDirectory(directory || null);
      })
      .catch(() => {
        if (!cancelled) setAssigneeDirectory(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openSession = (nextTask: any) => {
    sessionKeyRef.current += 1;
    setSession({
      key: sessionKeyRef.current,
      task: nextTask,
    });
  };

  const closeSession = () => {
    if (!mountedRef.current) return;
    setSession(null);
  };

  useEffect(() => {
    mountedRef.current = true;
    const handleOpen = async (event: Event) => {
      const detail = (event as CustomEvent<any>)?.detail || {};
      const providedTask = detail?.task && typeof detail.task === 'object' ? detail.task : null;
      const resolvedTaskId = String(detail?.taskId || providedTask?.id || '').trim();
      if (!resolvedTaskId) return;
      if (!mountedRef.current) return;
      if (isProcessRunStagePreviewTask(providedTask) || resolvedTaskId.startsWith('process_run_stage:')) {
        message.info('این مرحله هنوز به فعالیت واقعی تبدیل نشده است.');
        return;
      }
      setLoading(true);
      try {
        const nextTask = await loadProcessTaskModalContext(supabase, providedTask, {
          taskId: resolvedTaskId,
          processRunStageId: providedTask?.process_run_stage_id || null,
        });
        if (!nextTask) {
          message.warning('فعالیت موردنظر پیدا نشد.');
          return;
        }
        if (!mountedRef.current) return;
        openSession(nextTask);
      } catch {
        if (providedTask) {
          openSession(mergeProcessTaskModalContext(providedTask));
        } else {
          message.error('باز کردن جزئیات فعالیت ناموفق بود.');
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
      {!loading && modalPayload ? (
        <ProcessTaskModalV2
          key={`${session?.key || 0}-${String(task?.id || '')}`}
          open
          process={modalPayload.process}
          stage={modalPayload.stage}
          laneTitle="ردیف فعالیت"
          onClose={closeSession}
          onStageStatusChange={(_stageId, status, sourcePatch) => {
            const nextTask = {
              ...(task || {}),
              ...(sourcePatch || {}),
              status,
            };
            const taskId = normalizeText(nextTask?.id || nextTask?.task_id);
            if (taskId) {
              markModuleListChanged({
                org_id: nextTask?.org_id || null,
                module_id: 'tasks',
                record_id: taskId,
                action: 'update',
                updated_at: new Date().toISOString(),
              });
            }
            const sourceLink = resolveTaskSourceLink(nextTask);
            if (sourceLink.moduleId && sourceLink.recordId) {
              markModuleListChanged({
                org_id: nextTask?.org_id || null,
                module_id: sourceLink.moduleId,
                record_id: sourceLink.recordId,
                action: 'update',
                updated_at: new Date().toISOString(),
              });
            }
            setSession((current) => current ? {
              ...current,
              task: {
                ...(current.task || {}),
                ...(sourcePatch || {}),
                status,
              },
            } : current);
          }}
        />
      ) : null}
    </>
  );
};

export default GlobalTaskProcessModalHost;
