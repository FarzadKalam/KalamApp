import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GoalProgressSnapshot } from './goalTypes';

const { executeGoalProgressForSubjectsMock } = vi.hoisted(() => ({
  executeGoalProgressForSubjectsMock: vi.fn(),
}));

vi.mock('./goals', () => ({
  executeGoalProgressForSubjects: executeGoalProgressForSubjectsMock,
  normalizeGoalRecord: (goal: any) => goal,
  isGoalVisibleToUser: (goal: any, userId: string | null, roleId: string | null) => {
    const userIds = Array.isArray(goal?.assignee_user_ids) ? goal.assignee_user_ids : [];
    const roleIds = Array.isArray(goal?.assignee_role_ids) ? goal.assignee_role_ids : [];
    if (userIds.length === 0 && roleIds.length === 0) return true;
    return (!!userId && userIds.includes(userId)) || (!!roleId && roleIds.includes(roleId));
  },
}));

import { collectGoalRewardLedgerDrafts } from './goalRewardPayrollSync';

const snapshot: GoalProgressSnapshot = {
  goal: {
    id: '00000000-0000-0000-0000-000000000111',
    module_id: 'tasks',
    name: 'هدف فروش',
    goal_scope: 'personal',
    period_unit: 'month',
    subperiod_unit: 'week',
    metric_type: 'count',
    config: {
      goal_reward_rules: [
        { title: 'پاداش تحقق', trigger_type: 'achieve', output_type: 'bonus', formula_id: 'formula-1' },
      ],
    },
  },
  achievedValue: 15,
  targetValue: 10,
  subAchievedValue: 5,
  subTargetValue: 2,
  mainRange: {
    startIso: '2026-04-01T00:00:00.000Z',
    endIso: '2026-04-30T23:59:59.999Z',
    startLabel: '۱۴۰۵/۰۱/۱۲',
    endLabel: '۱۴۰۵/۰۲/۱۰',
  },
  subRange: {
    startIso: '2026-04-01T00:00:00.000Z',
    endIso: '2026-04-07T23:59:59.999Z',
    startLabel: '۱۴۰۵/۰۱/۱۲',
    endLabel: '۱۴۰۵/۰۱/۱۸',
  },
  tone: 'gold',
  activeLevelKey: 'gold',
  levels: [],
  availableSubperiodUnits: ['day', 'week', 'month'],
  selectedSubperiodUnit: 'week',
  metricLabel: 'رکورد',
  moduleLabel: 'فعالیت‌ها',
};

describe('goalRewardPayrollSync', () => {
  beforeEach(() => {
    executeGoalProgressForSubjectsMock.mockReset();
  });

  it('builds payroll ledger drafts from goal reward rules', async () => {
    executeGoalProgressForSubjectsMock.mockResolvedValue([snapshot]);

    const drafts = await collectGoalRewardLedgerDrafts({
      profiles: [{
        employeeId: 'employee-1',
        profileUserId: 'profile-1',
        profileName: 'کاربر تست',
      }],
      goals: [snapshot.goal as any],
      formulas: [{
        id: 'formula-1',
        name: 'فرمول پاداش',
        expression_config: { type: 'constant', value: 750000 },
      }],
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      employee_id: 'employee-1',
      entry_type: 'goal_bonus_achieve',
      source_type: 'goal_reward',
      source_key: 'goal_reward:employee-1:00000000-0000-0000-0000-000000000111:formula-1:achieve:bonus',
      source_module_id: 'goal_reward:achieve:formula-1:bonus',
      source_record_id: '00000000-0000-0000-0000-000000000111',
      amount: 750000,
      title: 'پاداش تحقق',
      status: 'proposed',
    });
  });

  it('does not build a reward for a goal assigned to another employee', async () => {
    const drafts = await collectGoalRewardLedgerDrafts({
      profiles: [{ employeeId: 'employee-1', profileUserId: 'profile-1', profileName: 'کارمند اول' }],
      goals: [{
        id: 'goal-for-someone-else',
        module_id: 'tasks',
        name: 'هدف خصوصی',
        goal_scope: 'personal',
        period_unit: 'month',
        subperiod_unit: 'month',
        metric_type: 'count',
        target_value: 1,
        assignee_user_ids: ['profile-2'],
        config: { goal_reward_rules: [{ formula_id: 'goal-formula', trigger_type: 'touch', output_type: 'bonus' }] },
      }],
      formulas: [{
        id: 'goal-formula',
        name: 'پاداش',
        expression_config: { type: 'constant', value: 1000 },
      }],
      periodStart: '2026-07-01',
      periodEnd: '2026-07-31',
    });

    expect(drafts).toEqual([]);
  });
});
