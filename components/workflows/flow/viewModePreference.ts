export const WORKFLOW_VIEW_MODE_STORAGE_KEY = 'kalamapp_workflow_view_mode';

export type WorkflowEditorViewMode = 'form' | 'diagram';

export const readStoredWorkflowViewMode = (): WorkflowEditorViewMode => {
  try {
    return window.localStorage.getItem(WORKFLOW_VIEW_MODE_STORAGE_KEY) === 'diagram' ? 'diagram' : 'form';
  } catch {
    return 'form';
  }
};

export const persistWorkflowViewMode = (mode: WorkflowEditorViewMode) => {
  try {
    window.localStorage.setItem(WORKFLOW_VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage در دسترس نیست — ترجیح کاربر فقط برای همین session می‌ماند
  }
};
