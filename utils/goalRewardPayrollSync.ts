import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoalRecord } from './goalTypes';
import { executeGoalProgressForSubjects, isGoalVisibleToUser, normalizeGoalRecord } from './goals';
import { evaluateGoalRewardRules, type GoalRewardFormula } from './goalRewardRuntime';
import { isMissingPayrollLedgerError } from './payrollLedger';

export type GoalRewardSyncProfile = {
  employeeId: string;
  profileUserId: string;
  profileRoleId?: string | null;
  profileName?: string | null;
};

type GoalRewardLedgerDraft = {
  employee_id: string;
  period_start: string;
  period_end: string;
  entry_type: string;
  source_type: 'goal_reward';
  source_key: string;
  source_module_id: string;
  source_record_id: string;
  title: string;
  amount: number;
  quantity: number | null;
  rate: number | null;
  status: 'proposed';
  details: Record<string, any>;
};

const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildSourceModuleId = (triggerType: string, formulaId: string, outputType: string) =>
  `goal_reward:${String(triggerType || '').trim()}:${String(formulaId || '').trim()}:${String(outputType || '').trim()}`;

const buildEntryType = (triggerType: string, outputType: string) =>
  `goal_${String(outputType || 'bonus').trim()}_${String(triggerType || 'reward').trim()}`;

export const buildGoalRewardSourceKey = ({
  employeeId,
  goalId,
  formulaId,
  triggerType,
  outputType,
}: {
  employeeId: string | null | undefined;
  goalId: string | null | undefined;
  formulaId: string | null | undefined;
  triggerType: string | null | undefined;
  outputType: string | null | undefined;
}) =>
  [
    'goal_reward',
    String(employeeId || '').trim(),
    String(goalId || '').trim(),
    String(formulaId || '').trim(),
    String(triggerType || '').trim(),
    String(outputType || '').trim(),
  ].join(':');

const buildDraftKey = (draft: Pick<GoalRewardLedgerDraft, 'employee_id' | 'source_module_id' | 'source_record_id' | 'entry_type' | 'period_start' | 'period_end'>) =>
  [
    draft.employee_id,
    draft.source_module_id,
    draft.source_record_id,
    draft.entry_type,
    draft.period_start,
    draft.period_end,
  ].join('::');

export const collectGoalRewardLedgerDrafts = async ({
  profiles,
  goals,
  formulas,
  periodStart,
  periodEnd,
}: {
  profiles: GoalRewardSyncProfile[];
  goals: GoalRecord[];
  formulas: GoalRewardFormula[];
  periodStart: string;
  periodEnd: string;
}): Promise<GoalRewardLedgerDraft[]> => {
  const drafts: GoalRewardLedgerDraft[] = [];

  const eligibleProfiles = profiles.filter((profile) => profile.employeeId && profile.profileUserId);
  const goalRowsCache = new Map<string, any[]>();
  for (const rawGoal of goals) {
    const goal = normalizeGoalRecord(rawGoal);
    // برای هر هدف، داده‌های مبنا فقط یک‌بار خوانده می‌شوند و خروجی تمام کارکنان
    // از همان snapshot مشترک ساخته می‌شود. این کار تعداد queryها را از «کارمند × هدف» به «هدف» کاهش می‌دهد.
    const goalProfiles = eligibleProfiles.filter((profile) =>
      isGoalVisibleToUser(goal, profile.profileUserId, profile.profileRoleId || null)
    );
    if (goalProfiles.length === 0) continue;

    try {
      const snapshots = await executeGoalProgressForSubjects(goal, {
        userId: goalProfiles[0].profileUserId,
        roleId: goalProfiles[0].profileRoleId || null,
        permissions: null,
        cache: goalRowsCache,
        subjects: goalProfiles.map((profile) => ({
          userId: profile.profileUserId,
          roleId: profile.profileRoleId || null,
          label: profile.profileName || null,
        })),
        overridePeriodRange: {
          startIso: `${periodStart}T00:00:00.000Z`,
          endIso: `${periodEnd}T23:59:59.999Z`,
        },
      });

      snapshots.forEach((snapshot, index) => {
        const profile = goalProfiles[index];
        if (!profile || snapshot.achievedValue <= 0) return;
        const rewardEntries = evaluateGoalRewardRules({ snapshot, formulas });

        rewardEntries.forEach((entry) => {
          const amount = toNumber(entry.amount);
          if (amount === 0 || !entry.formula_id) return;
          drafts.push({
            employee_id: profile.employeeId,
            period_start: periodStart,
            period_end: periodEnd,
            entry_type: buildEntryType(entry.trigger_type, entry.output_type),
            source_type: 'goal_reward',
            source_key: buildGoalRewardSourceKey({
              employeeId: profile.employeeId,
              goalId: goal.id,
              formulaId: entry.formula_id,
              triggerType: entry.trigger_type,
              outputType: entry.output_type,
            }),
            source_module_id: buildSourceModuleId(entry.trigger_type, entry.formula_id, entry.output_type),
            source_record_id: String(goal.id),
            title: entry.title,
            amount,
            quantity: toNumber(snapshot.achievedValue),
            rate: null,
            status: 'proposed',
            details: {
              employee_profile_id: profile.profileUserId,
              employee_name: profile.profileName || null,
              goal_id: goal.id,
              goal_name: goal.name,
              trigger_type: entry.trigger_type,
              formula_id: entry.formula_id,
              output_type: entry.output_type,
              achieved_value: snapshot.achievedValue,
              target_value: snapshot.targetValue,
              active_level_key: snapshot.activeLevelKey,
              period_label: `${snapshot.mainRange.startLabel} تا ${snapshot.mainRange.endLabel}`,
              errors: entry.errors,
            },
          });
        });
      });
    } catch {
      continue;
    }
  }

  return drafts;
};

export const syncGoalRewardEntriesForPayroll = async (
  supabase: SupabaseClient,
  {
    profiles,
    periodStart,
    periodEnd,
  }: {
    profiles: GoalRewardSyncProfile[];
    periodStart: string;
    periodEnd: string;
  }
) => {
  const employeeIds = Array.from(new Set(profiles.map((item) => String(item.employeeId || '').trim()).filter(Boolean)));
  if (employeeIds.length === 0) return;

  const [goalsResult, formulasResult, initialExistingResult] = await Promise.all([
    supabase.from('goals').select('id, module_id, name, goal_scope, period_unit, subperiod_unit, metric_type, metric_field_key, date_field_key, target_value, levels_enabled, bronze_value, silver_value, gold_value, assignee_user_ids, assignee_role_ids, conditions_all, conditions_any, config').eq('is_active', true),
    supabase
      .from('calculation_formulas')
      .select('id, name, expression_config, output_type, config')
      .eq('is_active', true)
      .eq('context_type', 'goal'),
    supabase
      .from('payroll_calculation_entries')
      .select('id, employee_id, period_start, period_end, entry_type, source_type, source_key, source_module_id, source_record_id, status')
      .in('employee_id', employeeIds)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .eq('source_type', 'goal_reward'),
  ]);

  if (goalsResult.error) throw goalsResult.error;
  if (formulasResult.error) throw formulasResult.error;
  let existingResult: any = initialExistingResult;
  if (existingResult.error && String(existingResult.error?.message || existingResult.error?.details || '').toLowerCase().includes('source_key')) {
    existingResult = await supabase
      .from('payroll_calculation_entries')
      .select('id, employee_id, period_start, period_end, entry_type, source_type, source_module_id, source_record_id, status')
      .in('employee_id', employeeIds)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .eq('source_type', 'goal_reward');
  }
  if (existingResult.error) {
    if (isMissingPayrollLedgerError(existingResult.error)) return;
    throw existingResult.error;
  }

  const drafts = await collectGoalRewardLedgerDrafts({
    profiles,
    goals: (goalsResult.data || []) as GoalRecord[],
    formulas: (formulasResult.data || []) as GoalRewardFormula[],
    periodStart,
    periodEnd,
  });

  const existingRows = (existingResult.data || []) as Array<Record<string, any>>;
  const existingByKey = new Map(
    existingRows.map((row) => [
      String(row.source_key || '').trim() || buildDraftKey({
        employee_id: String(row.employee_id || ''),
        source_module_id: String(row.source_module_id || ''),
        source_record_id: String(row.source_record_id || ''),
        entry_type: String(row.entry_type || ''),
        period_start: String(row.period_start || ''),
        period_end: String(row.period_end || ''),
      }),
      row,
    ] as const)
  );
  const nextKeys = new Set(drafts.map((draft) => draft.source_key || buildDraftKey(draft)));

  const inserts = drafts.filter((draft) => !existingByKey.has(draft.source_key || buildDraftKey(draft)));
  const updates = drafts
    .map((draft) => ({ draft, existing: existingByKey.get(draft.source_key || buildDraftKey(draft)) }))
    .filter((item) => item.existing && String(item.existing.status || '') !== 'included_in_payroll');
  const voidIds = existingRows
    .filter((row) => {
      const key = String(row.source_key || '').trim() || buildDraftKey({
        employee_id: String(row.employee_id || ''),
        source_module_id: String(row.source_module_id || ''),
        source_record_id: String(row.source_record_id || ''),
        entry_type: String(row.entry_type || ''),
        period_start: String(row.period_start || ''),
        period_end: String(row.period_end || ''),
      });
      return !nextKeys.has(key) && ['draft', 'proposed'].includes(String(row.status || ''));
    })
    .map((row) => String(row.id || '').trim())
    .filter(Boolean);

  if (inserts.length > 0) {
    const { error } = await supabase.from('payroll_calculation_entries').insert(inserts);
    if (error && !isMissingPayrollLedgerError(error)) throw error;
  }

  if (updates.length > 0) {
    // محدودیت هم‌زمانی جلوی هجوم PATCHهای تک‌ردیفی و timeout شدن مرورگر را می‌گیرد.
    const updateConcurrency = 6;
    for (let index = 0; index < updates.length; index += updateConcurrency) {
      await Promise.all(updates.slice(index, index + updateConcurrency).map(async ({ draft, existing }) => {
      if (!existing?.id) return;
      const { error } = await supabase
        .from('payroll_calculation_entries')
        .update({
          title: draft.title,
          amount: draft.amount,
          quantity: draft.quantity,
          rate: draft.rate,
          details: draft.details,
          status: 'proposed',
          updated_at: new Date().toISOString(),
      })
        .eq('id', existing.id);
      if (error && !isMissingPayrollLedgerError(error)) throw error;
      }));
    }
  }

  if (voidIds.length > 0) {
    const { error } = await supabase
      .from('payroll_calculation_entries')
      .update({
        status: 'voided',
        updated_at: new Date().toISOString(),
      })
      .in('id', voidIds);
    if (error && !isMissingPayrollLedgerError(error)) throw error;
  }
};
