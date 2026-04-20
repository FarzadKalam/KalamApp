import { describe, expect, it } from 'vitest';
import { evaluateGoalRewardRules } from './goalRewardRuntime';
import type { GoalProgressSnapshot } from './goalTypes';

const baseSnapshot: GoalProgressSnapshot = {
  goal: {
    id: 'goal-1',
    module_id: 'tasks',
    name: 'هدف تست',
    goal_scope: 'personal',
    period_unit: 'month',
    subperiod_unit: 'week',
    metric_type: 'count',
    config: {},
  },
  achievedValue: 12,
  targetValue: 10,
  subAchievedValue: 4,
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
  levels: [
    { key: 'bronze', label: 'برنزی', value: 4 },
    { key: 'silver', label: 'نقره‌ای', value: 8 },
    { key: 'gold', label: 'طلایی', value: 10 },
  ],
  availableSubperiodUnits: ['day', 'week', 'month'],
  selectedSubperiodUnit: 'week',
  metricLabel: 'رکورد',
  moduleLabel: 'فعالیت‌ها',
};

describe('goalRewardRuntime', () => {
  it('evaluates touch and level rewards from goal formulas', () => {
    const snapshot: GoalProgressSnapshot = {
      ...baseSnapshot,
      goal: {
        ...baseSnapshot.goal,
        config: {
          goal_reward_rules: [
            { title: 'پاداش ورود', trigger_type: 'touch', output_type: 'bonus', formula_id: 'f-touch' },
            { title: 'پاداش نقره‌ای', trigger_type: 'silver', output_type: 'bonus', formula_id: 'f-level' },
          ],
        },
      },
    };

    const entries = evaluateGoalRewardRules({
      snapshot,
      formulas: [
        {
          id: 'f-touch',
          name: 'فرمول ورود',
          expression_config: { type: 'constant', value: 1000 },
        },
        {
          id: 'f-level',
          name: 'فرمول سطح',
          expression_config: {
            type: 'binary',
            operator: 'multiply',
            left: { type: 'field', path: 'goal.achieved_value', fallback: 0 },
            right: { type: 'constant', value: 100 },
          },
        },
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]?.amount).toBe(1000);
    expect(entries[1]?.amount).toBe(1200);
  });

  it('does not evaluate unmatched triggers and makes penalties negative', () => {
    const snapshot: GoalProgressSnapshot = {
      ...baseSnapshot,
      achievedValue: 2,
      targetValue: 10,
      activeLevelKey: null,
      tone: 'base',
      goal: {
        ...baseSnapshot.goal,
        config: {
          goal_reward_rules: [
            { title: 'تحقق کامل', trigger_type: 'achieve', output_type: 'bonus', formula_id: 'f1' },
            { title: 'جریمه لمس', trigger_type: 'touch', output_type: 'penalty', formula_id: 'f2' },
          ],
        },
      },
    };

    const entries = evaluateGoalRewardRules({
      snapshot,
      formulas: [
        { id: 'f1', expression_config: { type: 'constant', value: 5000 } },
        { id: 'f2', expression_config: { type: 'constant', value: 300 } },
      ],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount).toBe(-300);
    expect(entries[0]?.trigger_type).toBe('touch');
  });
});
