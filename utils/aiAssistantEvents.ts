export const AI_CONTEXT_EVENT = 'kalam:ai-context';
export const AI_OPEN_EVENT = 'kalam:ai-open';
export const NOTES_UPDATED_EVENT = 'kalam:notes-updated';

export type AssistantAvailableProcess = {
  id: string;
  label: string;
  templateId?: string | null;
  templateName?: string | null;
  stageCount?: number;
};

export type AssistantContext = {
  route?: string;
  mode?: 'record' | 'list' | 'page';
  moduleId?: string | null;
  recordId?: string | null;
  visibleRecordIds?: string[];
  selectedRecordIds?: string[];
  intent?: 'process_guide' | string;
  processFieldKey?: string | null;
  selectedProcessId?: string | null;
  selectedProcessGroupId?: string | null;
  processGuideContext?: Record<string, any> | null;
  availableProcesses?: AssistantAvailableProcess[];
};
