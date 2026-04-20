import type { SupabaseClient } from '@supabase/supabase-js';
import type { GoalRecord } from './goalTypes';
import { executeGoalProgress, normalizeGoalRecord } from './goals';
import { evaluateGoalRewardRules, type GoalRewardFormula } from './goalRewardRuntime';
import { isMissingPayrollLedgerError } from './payrollLedger';

export type GoalRewardSyncProfile = {
  employeeId: string;
  profileUserId: string;
  profileName?: string | null;
};

type GoalRewardLedgerDraft = {
  employee_id: string;
  period_start: string;
  period_end: string;
  entry_type: string;
  source_type: 'goal_reward';
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

  for (const profile of profiles) {
    if (!profile.employeeId || !profile.profileUserId) continue;

    for (const rawGoal of goals) {
      try {
        const goal = normalizeGoalRecord(rawGoal);
        const snapshot = await executeGoalProgress(goal, {
          userId: profile.profileUserId,
          roleId: null,
          permissions: null,
        });
        if (!snapshot || snapshot.achievedValue <= 0) continue;

        const rewardEntries = evaluateGoalRewardRules({
          snapshot,
          formulas,
        });

        rewardEntries.forEach((entry) => {
          const amount = toNumber(entry.amount);
          if (amount === 0 || !entry.formula_id) return;
          drafts.push({
            employee_id: profile.employeeId,
            period_start: periodStart,
            period_end: periodEnd,
            entry_type: buildEntryType(entry.trigger_type, entry.output_type),
            source_type: 'goal_reward',
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
      } catch {
        continue;
      }
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

  const [goalsResult, formulasResult, existingResult] = await Promise.all([
    supabase.from('goals').select('*').eq('is_active', true),
    supabase
      .from('calculation_formulas')
      .select('id, name, expression_config, output_type, config')
      .eq('is_active', true)
      .eq('context_type', 'goal'),
    supabase
      .from('payroll_calculation_entries')
      .select('id, employee_id, period_start, period_end, entry_type, source_type, source_module_id, source_record_id, status')
      .in('employee_id', employeeIds)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .eq('source_type', 'goal_reward'),
  ]);

  if (goalsResult.error) throw goalsResult.error;
  if (formulasResult.error) throw formulasResult.error;
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
    existingRows.map((row) => [buildDraftKey({
      employee_id: String(row.employee_id || ''),
      source_module_id: String(row.source_module_id || ''),
      source_record_id: String(row.source_record_id || ''),
      entry_type: String(row.entry_type || ''),
      period_start: String(row.period_start || ''),
      period_end: String(row.period_end || ''),
    }), row] as const)
  );
  const nextKeys = new Set(drafts.map((draft) => buildDraftKey(draft)));

  const inserts = drafts.filter((draft) => !existingByKey.has(buildDraftKey(draft)));
  const updates = drafts
    .map((draft) => ({ draft, existing: existingByKey.get(buildDraftKey(draft)) }))
    .filter((item) => item.existing && String(item.existing.status || '') !== 'included_in_payroll');
  const voidIds = existingRows
    .filter((row) => {
      const key = buildDraftKey({
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
    await Promise.all(updates.map(async ({ draft, existing }) => {
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
