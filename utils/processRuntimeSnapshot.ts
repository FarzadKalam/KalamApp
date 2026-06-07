import { toPersianNumber } from './persianNumberFormatter';

export type ProcessRuntimeSnapshot = {
  moduleId: string;
  recordId: string;
  loaded: boolean;
  tasks: any[];
  runs: any[];
  stages: any[];
  hasStartedExecution: boolean;
};

export const EMPTY_PROCESS_RUNTIME_SNAPSHOT: ProcessRuntimeSnapshot = {
  moduleId: '',
  recordId: '',
  loaded: false,
  tasks: [],
  runs: [],
  stages: [],
  hasStartedExecution: false,
};

export const isProcessExecutionStarted = (tasks: any[]) =>
  (Array.isArray(tasks) ? tasks : []).some((task: any) => {
    const status = String(task?.status || '').trim().toLowerCase();
    return ['in_progress', 'done', 'completed', 'confirmed', 'final', 'settled'].includes(status);
  });

export const shouldShowProcessEmptyState = ({
  loaded,
  succeeded,
  isEmpty,
}: {
  loaded: boolean;
  succeeded: boolean;
  isEmpty: boolean;
}) => loaded && succeeded && isEmpty;

export const getCompletedProcessesToggleLabel = (count: number, expanded = false) =>
  `${expanded ? 'پنهان کردن' : 'مشاهده'} ${toPersianNumber(Math.max(0, count))} فرآیند تکمیل‌شده`;
