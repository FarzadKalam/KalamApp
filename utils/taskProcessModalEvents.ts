export const OPEN_TASK_PROCESS_MODAL_EVENT = 'kalam:open-task-process-modal';

export type OpenTaskProcessModalPayload = {
  taskId?: string | null;
  task?: Record<string, any> | null;
  /** برای مرحله‌هایی که هنوز فعالیت واقعی ندارند، همان مودال اصلی V2 را باز می‌کند. */
  draftModal?: {
    process: any;
    stage: any;
    laneTitle?: string | null;
    onCreateDraftActivity?: (overrides?: Record<string, any>) => any | Promise<any>;
    onSaveDraftActivity?: (overrides?: Record<string, any>) => any | Promise<any>;
  } | null;
};

export const openTaskProcessModal = (payload: OpenTaskProcessModalPayload) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_TASK_PROCESS_MODAL_EVENT, { detail: payload }));
};
