import {
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from './processTaskCustomFields';
import { PROCESS_TASK_STATUS_OPTIONS_KEY } from './processTaskStatusOptions';

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

const readArrayConfig = (row: any, key: string): any[] => {
  const metadata = parseObject(row?.metadata);
  const direct = row?.[key];
  if (Array.isArray(direct) && direct.length > 0) return direct;
  const nested = metadata?.[key];
  return Array.isArray(nested) ? nested : [];
};

const firstNonEmptyArray = (...values: any[][]) => values.find((value) => Array.isArray(value) && value.length > 0) || [];

export const mergeProcessTaskModalContext = (
  task: Record<string, any>,
  runStage?: Record<string, any> | null,
  templateStage?: Record<string, any> | null,
) => {
  const recurrence = parseObject(task?.recurrence_info);
  const taskMetadata = parseObject(task?.metadata);
  const runStageMetadata = parseObject(runStage?.metadata);
  const templateStageMetadata = parseObject(templateStage?.metadata);
  const customFields = firstNonEmptyArray(
    Array.isArray(recurrence?.[PROCESS_TASK_CUSTOM_FIELDS_KEY]) ? recurrence[PROCESS_TASK_CUSTOM_FIELDS_KEY] : [],
    readArrayConfig(task, PROCESS_TASK_CUSTOM_FIELDS_KEY),
    readArrayConfig(runStage, PROCESS_TASK_CUSTOM_FIELDS_KEY),
    readArrayConfig(templateStage, PROCESS_TASK_CUSTOM_FIELDS_KEY),
  );
  const statusOptions = firstNonEmptyArray(
    Array.isArray(recurrence?.[PROCESS_TASK_STATUS_OPTIONS_KEY]) ? recurrence[PROCESS_TASK_STATUS_OPTIONS_KEY] : [],
    readArrayConfig(task, PROCESS_TASK_STATUS_OPTIONS_KEY),
    readArrayConfig(runStage, PROCESS_TASK_STATUS_OPTIONS_KEY),
    readArrayConfig(templateStage, PROCESS_TASK_STATUS_OPTIONS_KEY),
  );
  const customFieldValues = {
    ...(parseObject(templateStageMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY])),
    ...(parseObject(runStageMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY])),
    ...(parseObject(taskMetadata?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY])),
    ...(parseObject(recurrence?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY])),
  };

  return {
    ...task,
    recurrence_info: {
      ...recurrence,
      ...(customFields.length > 0 ? { [PROCESS_TASK_CUSTOM_FIELDS_KEY]: customFields } : {}),
      ...(statusOptions.length > 0 ? { [PROCESS_TASK_STATUS_OPTIONS_KEY]: statusOptions } : {}),
      ...(Object.keys(customFieldValues).length > 0 ? { [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customFieldValues } : {}),
    },
    metadata: taskMetadata,
    ...(runStage || templateStage ? {
      source_stage: {
        ...(templateStage || {}),
        ...(runStage || {}),
        metadata: {
          ...templateStageMetadata,
          ...runStageMetadata,
        },
      },
    } : {}),
  };
};

export const processTaskModalContextNeedsStage = (task: Record<string, any>) => {
  const recurrence = parseObject(task?.recurrence_info);
  return !Array.isArray(recurrence?.[PROCESS_TASK_CUSTOM_FIELDS_KEY])
    || !Array.isArray(recurrence?.[PROCESS_TASK_STATUS_OPTIONS_KEY]);
};
