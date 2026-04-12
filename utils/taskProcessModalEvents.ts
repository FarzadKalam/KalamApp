export const OPEN_TASK_PROCESS_MODAL_EVENT = 'kalam:open-task-process-modal';

export type OpenTaskProcessModalPayload = {
  taskId?: string | null;
  task?: Record<string, any> | null;
};

export const openTaskProcessModal = (payload: OpenTaskProcessModalPayload) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_TASK_PROCESS_MODAL_EVENT, { detail: payload }));
};

