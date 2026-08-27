import React from 'react';
import { Skeleton } from 'antd';
import { resolveTaskSourceLink } from '../../utils/taskMeta';

const ProcessCardsV2RuntimeBlock = React.lazy(() => import('../processes/ProcessCardsV2RuntimeBlock'));

const PROCESS_SOURCE_MODULE_IDS = new Set([
  'projects',
  'customers',
  'invoices',
  'purchase_invoices',
  'marketing_leads',
]);

export type TaskRelatedProcessTarget = {
  moduleId: string;
  recordId: string;
};

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

export const resolveTaskRelatedProcessTarget = (
  task: any,
  options?: { preferProcessRun?: boolean },
): TaskRelatedProcessTarget | null => {
  if (!task || typeof task !== 'object') return null;

  if (options?.preferProcessRun) {
    const recurrence = parseObject(task?.recurrence_info);
    const processRunId = String(task?.process_run_id || recurrence?.process_run_id || '').trim();
    if (processRunId) return { moduleId: 'process_runs', recordId: processRunId };
  }

  const sourceLink = resolveTaskSourceLink(task);
  const moduleId = String(sourceLink.moduleId || '').trim();
  const recordId = String(sourceLink.recordId || '').trim();

  if (!moduleId || !recordId || !PROCESS_SOURCE_MODULE_IDS.has(moduleId)) return null;
  return { moduleId, recordId };
};

type TaskRelatedProcessBarProps = {
  task: any;
  variant?: 'full' | 'compact' | 'column';
  className?: string;
  stopClickPropagation?: boolean;
};

const TaskRelatedProcessBar: React.FC<TaskRelatedProcessBarProps> = ({
  task,
  variant = 'compact',
  className = '',
  stopClickPropagation = false,
}) => {
  const target = React.useMemo(
    () => resolveTaskRelatedProcessTarget(task, { preferProcessRun: variant === 'full' }),
    [task, variant],
  );
  const recordData = React.useMemo(() => target ? ({
    id: target.recordId,
    module_id: target.moduleId,
    org_id: task?.org_id || null,
  }) : null, [target, task?.org_id]);

  if (!target) return null;

  return (
    <div
      className={className}
      onClick={stopClickPropagation ? (event) => event.stopPropagation() : undefined}
      data-task-related-process-bar={variant}
    >
      <React.Suspense
        fallback={(
          <Skeleton
            active
            title={variant === 'full'}
            paragraph={{ rows: variant === 'full' ? 3 : 1 }}
          />
        )}
      >
        <ProcessCardsV2RuntimeBlock
          recordId={target.recordId}
          moduleId={target.moduleId}
          recordData={recordData}
          variant={variant}
          enabled
          highlightedTaskId={String(task?.id || task?.task_id || '')}
          highlightedRunStageId={String(task?.process_run_stage_id || '')}
        />
      </React.Suspense>
    </div>
  );
};

export default React.memo(TaskRelatedProcessBar);
