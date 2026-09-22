import {
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from './processTaskCustomFields';
import { PROCESS_TASK_STATUS_OPTIONS_KEY } from './processTaskStatusOptions';

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

const firstArray = (...values: unknown[]) =>
  values.find((value) => Array.isArray(value)) as any[] | undefined;

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

const OMIT_KEYS = new Set([
  "id",
  "system_code",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
]);

const cloneValue = (value: any) => {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value) || (typeof value === "object" && value.constructor === Object)) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
  return value;
};

const copyPayload = (source: Record<string, any>) => Object.entries(source || {}).reduce<Record<string, any>>((payload, [key, value]) => {
  if (!key || OMIT_KEYS.has(key) || key.startsWith("__") || value === undefined) return payload;
  payload[key] = cloneValue(value);
  return payload;
}, {});

const normalizeLinks = (value: any, links: Record<string, string>) => ({
  ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}),
  ...links,
});

const createDraftId = (prefix: string, index: number) => `content_calendar_copy_${prefix}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;

const toDraftStage = (
  source: Record<string, any>,
  index: number,
  links: Record<string, string>,
  groupPrefix: string,
  shiftMonths = 0,
) => {
  const metadata = source?.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
    ? source.metadata
    : {};
  const recurrence = source?.recurrence_info && typeof source.recurrence_info === "object" && !Array.isArray(source.recurrence_info)
    ? source.recurrence_info
    : {};
  const groupId = `${groupPrefix}_${String(source?.process_group_id || metadata?.process_group_id || "activity_group")}`;
  const nodeKey = String(source?.process_node_key || metadata?.process_node_key || `activity_${index + 1}`).trim();
  const draft = copyPayload(source);
  delete draft.task_id;
  delete draft.process_task_id;
  delete draft.process_run_id;
  delete draft.process_run_stage_id;
  draft.id = createDraftId(groupPrefix, index);
  draft.name = String(source?.name || source?.stage_name || source?.title || "فعالیت").trim() || "فعالیت";
  draft.stage_name = String(source?.stage_name || source?.name || source?.title || "فعالیت").trim() || "فعالیت";
  draft.status = "draft";
  draft.is_draft = true;
  draft.process_group_id = groupId;
  draft.process_node_key = `${groupId}__${nodeKey}`;
  draft.process_link_map = normalizeLinks(source?.process_link_map, links);
  if (links.projects) draft.project_id = links.projects;
  else delete draft.project_id;
  if (links.content_calendars) draft.content_calendar_id = links.content_calendars;
  draft.metadata = {
    ...metadata,
    is_draft: true,
    status: "draft",
    process_group_id: groupId,
    process_node_key: draft.process_node_key,
    process_run_id: null,
    process_run_stage_id: null,
    task_id: null,
    process_task_id: null,
    process_link_map: normalizeLinks(metadata?.process_link_map, links),
  };
  draft.recurrence_info = {
    ...recurrence,
    process_group_id: groupId,
    process_node_key: draft.process_node_key,
    process_run_id: null,
    process_run_stage_id: null,
    task_id: null,
    process_task_id: null,
    process_links: normalizeLinks(recurrence?.process_links, links),
  };
  if (shiftMonths) {
    ["start_date", "due_date", "completed_at"].forEach((key) => {
      if (draft[key]) draft[key] = shiftDateValue(draft[key], shiftMonths);
    });
    if (draft.metadata?.start_date) draft.metadata.start_date = shiftDateValue(draft.metadata.start_date, shiftMonths);
    if (draft.metadata?.due_date) draft.metadata.due_date = shiftDateValue(draft.metadata.due_date, shiftMonths);
    if (draft.recurrence_info?.start_date) draft.recurrence_info.start_date = shiftDateValue(draft.recurrence_info.start_date, shiftMonths);
    if (draft.recurrence_info?.due_date) draft.recurrence_info.due_date = shiftDateValue(draft.recurrence_info.due_date, shiftMonths);
  }
  return draft;
};

const shiftDateValue = (value: any, months: number) => {
  if (!value) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return date.toISOString();
};

export const copyContentCalendarRelations = async ({
  supabaseClient,
  sourceCalendarId,
  targetCalendarId,
  shiftMonths = 0,
}: {
  supabaseClient: any;
  sourceCalendarId: string;
  targetCalendarId: string;
  shiftMonths?: number;
}) => {
  const [{ data: sourceCalendar, error: calendarError }, { data: sourceProjects, error: projectsError }, { data: sourceTasks, error: tasksError }] = await Promise.all([
    supabaseClient.from("content_calendars").select("execution_process_draft").eq("id", sourceCalendarId).maybeSingle(),
    supabaseClient.from("projects").select("*").eq("content_calendar_id", sourceCalendarId).order("due_date", { ascending: true }),
    supabaseClient.from("tasks").select("*").eq("content_calendar_id", sourceCalendarId).is("project_id", null).order("due_date", { ascending: true }),
  ]);
  if (calendarError) throw calendarError;
  if (projectsError) throw projectsError;
  if (tasksError) throw tasksError;

  const projects = Array.isArray(sourceProjects) ? sourceProjects : [];
  const directTasks = Array.isArray(sourceTasks) ? sourceTasks : [];
  const projectIds = projects.map((project: any) => String(project?.id || "").trim()).filter(Boolean);
  const projectTasksResult = projectIds.length
    ? await supabaseClient.from("tasks").select("*").in("project_id", projectIds).order("due_date", { ascending: true })
    : { data: [], error: null };
  if (projectTasksResult.error) throw projectTasksResult.error;
  const projectTasks = Array.isArray(projectTasksResult.data) ? projectTasksResult.data : [];
  const tasksByProject = new Map<string, any[]>();
  projectTasks.forEach((task: any) => {
    const key = String(task?.project_id || "").trim();
    tasksByProject.set(key, [...(tasksByProject.get(key) || []), task]);
  });

  for (const [projectIndex, sourceProject] of projects.entries()) {
    const projectPayload = copyPayload(sourceProject);
    projectPayload.content_calendar_id = targetCalendarId;
    projectPayload.status = "draft";
    projectPayload.completed_at = null;
    projectPayload.start_date = shiftDateValue(sourceProject?.start_date, shiftMonths) || null;
    projectPayload.due_date = shiftDateValue(sourceProject?.due_date, shiftMonths) || null;
    projectPayload.execution_process_draft = [];
    const { data: insertedProject, error: insertProjectError } = await supabaseClient
      .from("projects")
      .insert(projectPayload)
      .select("id")
      .single();
    if (insertProjectError) throw insertProjectError;
    const targetProjectId = String(insertedProject?.id || "").trim();
    if (!targetProjectId) continue;
    const links = { projects: targetProjectId, content_calendars: targetCalendarId };
    const sourceDrafts = Array.isArray(sourceProject?.execution_process_draft) ? sourceProject.execution_process_draft : [];
    const projectDrafts = sourceDrafts.map((stage: any, index: number) => toDraftStage(stage, index, links, `project_${projectIndex}`, shiftMonths));
    const taskDrafts = (tasksByProject.get(String(sourceProject?.id || "").trim()) || [])
      .map((task: any, index: number) => toDraftStage(task, projectDrafts.length + index, links, `project_${projectIndex}`, shiftMonths));
    const nextDrafts = [...projectDrafts, ...taskDrafts];
    if (nextDrafts.length) {
      const { error: updateProjectError } = await supabaseClient
        .from("projects")
        .update({ execution_process_draft: nextDrafts })
        .eq("id", targetProjectId);
      if (updateProjectError) throw updateProjectError;
    }
  }

  const sourceCalendarDrafts = Array.isArray(sourceCalendar?.execution_process_draft) ? sourceCalendar.execution_process_draft : [];
  const directDrafts = directTasks.map((task: any, index: number) => toDraftStage(
    task,
    sourceCalendarDrafts.length + index,
    { content_calendars: targetCalendarId },
    "calendar",
    shiftMonths,
  ));
  const targetDrafts = sourceCalendarDrafts.map((stage: any, index: number) => toDraftStage(
    stage,
    index,
    { content_calendars: targetCalendarId },
    "calendar",
    shiftMonths,
  ));
  const { error: updateCalendarError } = await supabaseClient
    .from("content_calendars")
    .update({ execution_process_draft: [...targetDrafts, ...directDrafts] })
    .eq("id", targetCalendarId);
  if (updateCalendarError) throw updateCalendarError;
};

export const copyContentCalendarToNextMonth = async ({
  supabaseClient,
  sourceCalendar,
}: {
  supabaseClient: any;
  sourceCalendar: Record<string, any>;
}) => {
  const payload = copyPayload(sourceCalendar);
  payload.name = `${String(sourceCalendar?.name || "تقویم محتوایی").trim()} (ماه بعد)`;
  payload.status = "draft";
  payload.is_public = false;
  payload.public_slug = null;
  payload.public_link = null;
  payload.start_date = shiftDateValue(sourceCalendar?.start_date, 1);
  payload.end_date = shiftDateValue(sourceCalendar?.end_date, 1);
  payload.execution_process_draft = [];
  const { data: inserted, error } = await supabaseClient
    .from("content_calendars")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  const targetCalendarId = String(inserted?.id || "").trim();
  if (!targetCalendarId) throw new Error("کپی تقویم مقصد ساخته نشد.");
  await copyContentCalendarRelations({
    supabaseClient,
    sourceCalendarId: String(sourceCalendar?.id || ""),
    targetCalendarId,
    shiftMonths: 1,
  });
  return targetCalendarId;
};
