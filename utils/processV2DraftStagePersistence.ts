import { fetchSessionBootstrap } from './sessionCache';

const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeDbUuid = (value: unknown) => {
  const raw = String(value || '').trim().replace(/^(process_run_stage|user|role)[_:]/i, '');
  return UUID_LIKE_RE.test(raw) ? raw : '';
};

/** مسیر مشترک ذخیره‌سازی مرحلهٔ پیش‌نویس در اجرای فرآیند V2. */
export const saveProcessV2DraftStage = async ({
  supabaseClient,
  stageId,
  stageName,
  assigneeUserId,
  assigneeRoleId,
  wage,
  plannedStartAt,
  plannedDueAt,
  metadata,
}: {
  supabaseClient: any;
  stageId?: string | null;
  stageName?: string | null;
  assigneeUserId?: string | null;
  assigneeRoleId?: string | null;
  wage?: number | null;
  plannedStartAt?: string | null;
  plannedDueAt?: string | null;
  metadata?: Record<string, any> | null;
}) => {
  const normalizedStageId = normalizeDbUuid(stageId);
  if (!normalizedStageId) throw new Error('مرحله پیش‌نویس فرآیند برای ذخیره پیدا نشد.');
  const normalizedRoleId = normalizeDbUuid(assigneeRoleId);
  const normalizedUserId = normalizedRoleId ? '' : normalizeDbUuid(assigneeUserId);
  const actor = await fetchSessionBootstrap(supabaseClient);
  const { data, error } = await supabaseClient.rpc('process_v2_save_draft_stage', {
    p_org_id: actor.orgId || null,
    p_stage_id: normalizedStageId,
    p_stage_name: String(stageName || '').trim() || 'مرحله',
    p_assignee_user_id: normalizedUserId || null,
    p_assignee_role_id: normalizedRoleId || null,
    p_wage: Number.isFinite(Number(wage)) ? Number(wage) : null,
    p_planned_start_at: String(plannedStartAt || '').trim() || null,
    p_planned_due_at: String(plannedDueAt || '').trim() || null,
    p_metadata: metadata && typeof metadata === 'object' ? metadata : {},
  });
  if (error) throw error;
  return data || null;
};
