import {
  getPreviousProcessStage,
  getProcessStageNodeKey,
  type ProcessGraphDefinition,
} from './processGraph';

export type ProcessDueAnchorType =
  | 'process_start'
  | 'previous_stage_due'
  | 'specific_stage_due'
  | 'previous_stage_completed'
  | 'specific_stage_completed';

export type ProcessDueAnchor = {
  type: ProcessDueAnchorType;
  stageNodeKey: string | null;
};

const normalizeText = (value: unknown) => String(value || '').trim();

export const normalizeProcessDueAnchor = (
  stage: Record<string, any> | null | undefined,
): ProcessDueAnchor => {
  const metadata = stage?.metadata && typeof stage.metadata === 'object' ? stage.metadata : {};
  const rawType = normalizeText(
    stage?.due_anchor_type
    || metadata?.due_anchor_type
    || stage?.duration_from
    || metadata?.duration_from
    || 'process_start'
  );
  const typeMap: Record<string, ProcessDueAnchorType> = {
    project_start: 'process_start',
    process_start: 'process_start',
    previous_stage_end: 'previous_stage_due',
    previous_stage_due: 'previous_stage_due',
    specific_stage_due: 'specific_stage_due',
    previous_stage_completed: 'previous_stage_completed',
    specific_stage_completed: 'specific_stage_completed',
  };
  return {
    type: typeMap[rawType] || 'process_start',
    stageNodeKey: normalizeText(
      stage?.due_anchor_stage_node_key
      || metadata?.due_anchor_stage_node_key
    ) || null,
  };
};

export const getProcessDueAnchorLabel = (
  stage: Record<string, any> | null | undefined,
) => {
  const anchor = normalizeProcessDueAnchor(stage);
  const labels: Record<ProcessDueAnchorType, string> = {
    process_start: 'شروع فرآیند',
    previous_stage_due: 'موعد انجام مرحله قبلی',
    specific_stage_due: 'موعد انجام مرحله خاص',
    previous_stage_completed: 'تکمیل واقعی مرحله قبلی',
    specific_stage_completed: 'تکمیل واقعی مرحله خاص',
  };
  return labels[anchor.type];
};

const parseDate = (value: unknown) => {
  const raw = normalizeText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const resolveProcessDueAnchorStage = ({
  stage,
  stages,
  graph,
}: {
  stage: Record<string, any>;
  stages: Record<string, any>[];
  graph?: ProcessGraphDefinition | null;
}) => {
  const anchor = normalizeProcessDueAnchor(stage);
  if (anchor.type === 'specific_stage_due' || anchor.type === 'specific_stage_completed') {
    return anchor.stageNodeKey
      ? stages.find((candidate, index) => getProcessStageNodeKey(candidate, index) === anchor.stageNodeKey) || null
      : null;
  }
  if (anchor.type === 'previous_stage_due' || anchor.type === 'previous_stage_completed') {
    return getPreviousProcessStage(
      stages,
      getProcessStageNodeKey(stage),
      graph,
    );
  }
  return null;
};

export const computeProcessStageDueDate = ({
  stage,
  stages,
  processStartedAt,
  graph,
}: {
  stage: Record<string, any>;
  stages: Record<string, any>[];
  processStartedAt: Date | string | null | undefined;
  graph?: ProcessGraphDefinition | null;
}) => {
  const durationValue = Math.max(0, Number(stage?.duration_value ?? stage?.metadata?.duration_value ?? 0) || 0);
  const durationUnit = String(stage?.duration_unit ?? stage?.metadata?.duration_unit ?? 'day') === 'hour'
    ? 'hour'
    : 'day';
  const anchor = normalizeProcessDueAnchor(stage);
  const anchorStage = resolveProcessDueAnchorStage({ stage, stages, graph });

  let anchorDate: Date | null = null;
  if (anchor.type === 'process_start') {
    anchorDate = processStartedAt instanceof Date ? processStartedAt : parseDate(processStartedAt);
  } else if (anchor.type === 'previous_stage_due' || anchor.type === 'specific_stage_due') {
    anchorDate = parseDate(anchorStage?.due_date || anchorStage?.planned_due_at);
  } else {
    anchorDate = parseDate(anchorStage?.completed_at || anchorStage?.actual_end_at);
  }

  if (!anchorDate) return null;
  if (durationValue <= 0) return anchorDate;
  const multiplier = durationUnit === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return new Date(anchorDate.getTime() + durationValue * multiplier);
};

