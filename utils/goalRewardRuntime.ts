import { evaluateFormulaExpression, type FormulaExpressionNode } from './formulaRuntime';
import type { GoalProgressSnapshot, GoalLevelKey } from './goalTypes';

export type GoalRewardFormula = {
  id: string;
  name?: string | null;
  expression_config?: FormulaExpressionNode | string | null;
  output_type?: string | null;
  config?: Record<string, any> | null;
};

export type GoalRewardRule = {
  title?: string | null;
  trigger_type?: 'touch' | 'achieve' | GoalLevelKey | string | null;
  output_type?: 'bonus' | 'wage' | 'penalty' | 'score' | string | null;
  formula_id?: string | null;
};

export type GoalRewardEntry = {
  title: string;
  formula_id: string;
  amount: number;
  output_type: string;
  trigger_type: string;
  errors: string[];
};

const LEVEL_ORDER: GoalLevelKey[] = ['bronze', 'silver', 'gold'];

const parseExpression = (raw: GoalRewardFormula['expression_config']): FormulaExpressionNode | null => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const isRuleTriggered = (rule: GoalRewardRule, snapshot: GoalProgressSnapshot) => {
  const trigger = String(rule.trigger_type || '').trim();
  if (!trigger) return false;
  if (trigger === 'touch') {
    return normalizeNumber(snapshot.achievedValue) > 0;
  }
  if (trigger === 'achieve') {
    return normalizeNumber(snapshot.targetValue) > 0 && normalizeNumber(snapshot.achievedValue) >= normalizeNumber(snapshot.targetValue);
  }
  if (!LEVEL_ORDER.includes(trigger as GoalLevelKey)) return false;
  if (!snapshot.activeLevelKey) return false;
  return LEVEL_ORDER.indexOf(snapshot.activeLevelKey) >= LEVEL_ORDER.indexOf(trigger as GoalLevelKey);
};

export const evaluateGoalRewardRules = ({
  snapshot,
  formulas,
}: {
  snapshot: GoalProgressSnapshot;
  formulas: GoalRewardFormula[];
}): GoalRewardEntry[] => {
  const rewardRules = Array.isArray(snapshot.goal?.config?.goal_reward_rules)
    ? snapshot.goal.config.goal_reward_rules
    : [];
  if (rewardRules.length === 0) return [];

  const formulaById = new Map(
    (Array.isArray(formulas) ? formulas : [])
      .filter((formula) => formula?.id)
      .map((formula) => [String(formula.id), formula] as const)
  );

  const achievedPercent = normalizeNumber(snapshot.targetValue) > 0
    ? (normalizeNumber(snapshot.achievedValue) / normalizeNumber(snapshot.targetValue)) * 100
    : 0;

  return rewardRules.flatMap((rawRule: any) => {
    const rule: GoalRewardRule = {
      title: rawRule?.title || null,
      trigger_type: rawRule?.trigger_type || null,
      output_type: rawRule?.output_type || null,
      formula_id: rawRule?.formula_id || null,
    };
    if (!rule.formula_id || !isRuleTriggered(rule, snapshot)) return [];

    const formula = formulaById.get(String(rule.formula_id));
    const expression = parseExpression(formula?.expression_config || null);
    if (!formula || !expression) return [];

    const result = evaluateFormulaExpression(expression, {
      goal: {
        ...snapshot.goal,
        achieved_value: normalizeNumber(snapshot.achievedValue),
        target_value: normalizeNumber(snapshot.targetValue),
        sub_achieved_value: normalizeNumber(snapshot.subAchievedValue),
        sub_target_value: normalizeNumber(snapshot.subTargetValue),
        achieved_percent: achievedPercent,
        active_level: snapshot.activeLevelKey || '',
      },
      constants: formula.config && typeof formula.config === 'object' ? formula.config : {},
    });

    const rawAmount = normalizeNumber(result.value);
    const amount = String(rule.output_type || '').trim() === 'penalty'
      ? -Math.abs(rawAmount)
      : rawAmount;

    return [{
      title: String(rule.title || formula.name || 'پاداش هدف').trim() || 'پاداش هدف',
      formula_id: String(formula.id),
      amount,
      output_type: String(rule.output_type || formula.output_type || 'bonus'),
      trigger_type: String(rule.trigger_type || ''),
      errors: result.errors,
    }];
  });
};
