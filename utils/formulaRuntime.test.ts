import { describe, expect, it } from 'vitest';
import { createWeightTimesConstantFormula, evaluateFormulaExpression, parseSimpleFormulaExpression, type FormulaExpressionNode } from './formulaRuntime';

describe('formulaRuntime', () => {
  it('evaluates the default weight times constant formula', () => {
    const result = evaluateFormulaExpression(createWeightTimesConstantFormula(), {
      task: { weight: 12 },
      constants: { constant: 2500 },
    });

    expect(result.value).toBe(30000);
    expect(result.errors).toEqual([]);
  });

  it('supports floor for early-hour bonus formulas', () => {
    const expression: FormulaExpressionNode = {
      type: 'binary',
      operator: 'multiply',
      left: {
        type: 'function',
        name: 'floor',
        args: [
          {
            type: 'binary',
            operator: 'divide',
            left: { type: 'field', path: 'task.early_hours', fallback: 0 },
            right: { type: 'constant', value: 6 },
          },
        ],
      },
      right: { type: 'constant', value: 500000 },
    };

    expect(evaluateFormulaExpression(expression, { task: { early_hours: 13 } }).value).toBe(1000000);
  });

  it('returns zero and reports division by zero', () => {
    const expression: FormulaExpressionNode = {
      type: 'binary',
      operator: 'divide',
      left: { type: 'constant', value: 10 },
      right: { type: 'constant', value: 0 },
    };

    const result = evaluateFormulaExpression(expression, {});
    expect(result.value).toBe(0);
    expect(result.errors).toContain('division_by_zero');
  });

  it('supports conditional expressions', () => {
    const expression: FormulaExpressionNode = {
      type: 'if',
      condition: {
        type: 'compare',
        operator: 'gte',
        left: { type: 'field', path: 'goal.achieved_percent', fallback: 0 },
        right: { type: 'constant', value: 100 },
      },
      then: { type: 'constant', value: 1000000 },
      else: { type: 'constant', value: 0 },
    };

    expect(evaluateFormulaExpression(expression, { goal: { achieved_percent: 120 } }).value).toBe(1000000);
    expect(evaluateFormulaExpression(expression, { goal: { achieved_percent: 80 } }).value).toBe(0);
  });

  it('parses simple arithmetic expressions with variables', () => {
    const expression = parseSimpleFormulaExpression('{{task.weight}} * 2500 + {{task.produced_qty}}');
    const result = evaluateFormulaExpression(expression, {
      task: { weight: 4, produced_qty: 20 },
    });
    expect(result.value).toBe(10020);
  });

  it('accepts spaces, Persian digits, and familiar multiplication symbols', () => {
    const expression = parseSimpleFormulaExpression(' {{task.weight}}  ×  ۲,۵۰۰ ');
    expect(evaluateFormulaExpression(expression, { task: { weight: 4 } }).value).toBe(10000);
  });
});
