import {
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from './processTaskCustomFields';
import { PROCESS_TASK_STATUS_OPTIONS_KEY } from './processTaskStatusOptions';

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

const firstArray = (...values: unknown[]) =>
  values.find((value) => Array.isArray(value)) as any[] | undefined;

/** قرارداد کامل مرحله برای کپی فعالیت از کارت سبک تقویم. */
export const buildContentCalendarTaskCopyDraft = ({
  sourceTask,
  calendarId,
  groupId,
  name,
}: {
  sourceTask: Record<string, any>;
  calendarId: string;
  groupId: string;
  name: string;
}) => {
  const source = asObject(sourceTask);
  const sourceMetadata = asObject(source.metadata);
  const sourceRecurrence = asObject(source.recurrence_info);
  const customFields = firstArray(
    sourceRecurrence[PROCESS_TASK_CUSTOM_FIELDS_KEY],
    source[PROCESS_TASK_CUSTOM_FIELDS_KEY],
    sourceMetadata[PROCESS_TASK_CUSTOM_FIELDS_KEY],
  ) || [];
  const statusOptions = firstArray(
    sourceRecurrence[PROCESS_TASK_STATUS_OPTIONS_KEY],
    source[PROCESS_TASK_STATUS_OPTIONS_KEY],
    sourceMetadata[PROCESS_TASK_STATUS_OPTIONS_KEY],
  ) || [];
  const customFieldValues = {
    ...asObject(sourceMetadata[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]),
    ...asObject(source[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]),
    ...asObject(sourceRecurrence[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]),
  };
  const {
    id: _sourceId,
    process_run_id: _sourceRunId,
    process_run_stage_id: _sourceRunStageId,
    completed_at: _sourceCompletedAt,
    created_at: _sourceCreatedAt,
    updated_at: _sourceUpdatedAt,
    ...copyableSource
  } = source;

  return {
    ...copyableSource,
    id: `content_calendar_draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    stage_name: name,
    status: 'draft',
    is_draft: true,
    task_type: String(source.task_type || 'فعالیت سازمانی').trim() || 'فعالیت سازمانی',
    process_group_id: groupId,
    process_group_name: 'فعالیت‌های تقویم محتوایی',
    process_target_module_ids: ['content_calendars'],
    process_link_map: { ...asObject(source.process_link_map), content_calendars: calendarId },
    process_node_key: `${groupId}__activity_1`,
    process_lane_key: `${groupId}__content_calendar_lane`,
    [PROCESS_TASK_CUSTOM_FIELDS_KEY]: customFields,
    [PROCESS_TASK_STATUS_OPTIONS_KEY]: statusOptions,
    [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customFieldValues,
    metadata: {
      ...sourceMetadata,
      task_type: String(source.task_type || 'فعالیت سازمانی').trim() || 'فعالیت سازمانی',
      content_calendar_id: calendarId,
      [PROCESS_TASK_CUSTOM_FIELDS_KEY]: customFields,
      [PROCESS_TASK_STATUS_OPTIONS_KEY]: statusOptions,
      [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customFieldValues,
    },
    recurrence_info: {
      ...sourceRecurrence,
      [PROCESS_TASK_CUSTOM_FIELDS_KEY]: customFields,
      [PROCESS_TASK_STATUS_OPTIONS_KEY]: statusOptions,
      [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: customFieldValues,
    },
  };
};
