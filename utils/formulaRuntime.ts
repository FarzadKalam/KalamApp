export type FormulaExpressionNode =
  | { type: 'constant'; value?: unknown; key?: string }
  | { type: 'field'; path: string; fallback?: unknown }
  | { type: 'binary'; operator: 'add' | 'subtract' | 'multiply' | 'divide'; left: FormulaExpressionNode; right: FormulaExpressionNode }
  | { type: 'function'; name: 'floor' | 'ceil' | 'round' | 'min' | 'max' | 'abs'; args: FormulaExpressionNode[] }
  | { type: 'compare'; operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'; left: FormulaExpressionNode; right: FormulaExpressionNode }
  | { type: 'if'; condition: FormulaExpressionNode; then: FormulaExpressionNode; else: FormulaExpressionNode };

export type FormulaRuntimeContext = Record<string, any>;

export type FormulaEvaluationResult = {
  value: number;
  errors: string[];
};

type SimpleFormulaToken =
  | { type: 'number'; value: number }
  | { type: 'field'; path: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' }
  | { type: 'paren'; value: '(' | ')' };

const MAX_FORMULA_DEPTH = 24;

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const getByPath = (context: FormulaRuntimeContext, path: string) => {
  const segments = String(path || '')
    .split('.')
    .map((item) => item.trim())
    .filter(Boolean);
  let current: any = context;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    current = current[segment];
  }
  return current;
};

const evaluateRaw = (
  node: FormulaExpressionNode | null | undefined,
  context: FormulaRuntimeContext,
  errors: string[],
  depth: number,
): unknown => {
  if (!node || typeof node !== 'object') return 0;
  if (depth > MAX_FORMULA_DEPTH) {
    errors.push('formula_depth_exceeded');
    return 0;
  }

  if (node.type === 'constant') {
    if (node.key) {
      return getByPath(context, `constants.${node.key}`) ?? node.value ?? 0;
    }
    return node.value ?? 0;
  }

  if (node.type === 'field') {
    const value = getByPath(context, node.path);
    return value ?? node.fallback ?? 0;
  }

  if (node.type === 'binary') {
    const left = toNumber(evaluateRaw(node.left, context, errors, depth + 1));
    const right = toNumber(evaluateRaw(node.right, context, errors, depth + 1));
    if (node.operator === 'add') return left + right;
    if (node.operator === 'subtract') return left - right;
    if (node.operator === 'multiply') return left * right;
    if (node.operator === 'divide') {
      if (right === 0) {
        errors.push('division_by_zero');
        return 0;
      }
      return left / right;
    }
  }

  if (node.type === 'function') {
    const args = (node.args || []).map((arg) => toNumber(evaluateRaw(arg, context, errors, depth + 1)));
    if (node.name === 'floor') return Math.floor(args[0] || 0);
    if (node.name === 'ceil') return Math.ceil(args[0] || 0);
    if (node.name === 'round') return Math.round(args[0] || 0);
    if (node.name === 'abs') return Math.abs(args[0] || 0);
    if (node.name === 'min') return Math.min(...(args.length ? args : [0]));
    if (node.name === 'max') return Math.max(...(args.length ? args : [0]));
  }

  if (node.type === 'compare') {
    const leftRaw = evaluateRaw(node.left, context, errors, depth + 1);
    const rightRaw = evaluateRaw(node.right, context, errors, depth + 1);
    const left = toNumber(leftRaw);
    const right = toNumber(rightRaw);
    if (node.operator === 'gt') return left > right;
    if (node.operator === 'gte') return left >= right;
    if (node.operator === 'lt') return left < right;
    if (node.operator === 'lte') return left <= right;
    if (node.operator === 'eq') return String(leftRaw ?? '') === String(rightRaw ?? '');
    if (node.operator === 'neq') return String(leftRaw ?? '') !== String(rightRaw ?? '');
  }

  if (node.type === 'if') {
    const condition = evaluateRaw(node.condition, context, errors, depth + 1);
    return evaluateRaw(condition ? node.then : node.else, context, errors, depth + 1);
  }

  errors.push('unsupported_formula_node');
  return 0;
};

export const evaluateFormulaExpression = (
  expression: FormulaExpressionNode | null | undefined,
  context: FormulaRuntimeContext,
): FormulaEvaluationResult => {
  const errors: string[] = [];
  const value = toNumber(evaluateRaw(expression, context || {}, errors, 0));
  return {
    value: Number.isFinite(value) ? value : 0,
    errors,
  };
};

export const createWeightTimesConstantFormula = (constant = 1): FormulaExpressionNode => ({
  type: 'binary',
  operator: 'multiply',
  left: { type: 'field', path: 'task.weight', fallback: 0 },
  right: { type: 'constant', key: 'constant', value: constant },
});

const SIMPLE_OPERATOR_PRECEDENCE: Record<'+' | '-' | '*' | '/', number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
};

const SIMPLE_OPERATOR_TO_NODE: Record<'+' | '-' | '*' | '/', 'add' | 'subtract' | 'multiply' | 'divide'> = {
  '+': 'add',
  '-': 'subtract',
  '*': 'multiply',
  '/': 'divide',
};

const tokenizeSimpleFormula = (source: string): SimpleFormulaToken[] => {
  const text = String(source || '').trim();
  const tokens: SimpleFormulaToken[] = [];
  let index = 0;

  while (index < text.length) {
    const current = text[index];
    if (/\s/.test(current)) {
      index += 1;
      continue;
    }

    if (current === '(' || current === ')') {
      tokens.push({ type: 'paren', value: current });
      index += 1;
      continue;
    }

    if (current === '+' || current === '-' || current === '*' || current === '/') {
      const previous = tokens[tokens.length - 1];
      const unaryMinus = current === '-'
        && (!previous || (previous.type === 'operator' || (previous.type === 'paren' && previous.value === '(')));
      if (unaryMinus) {
        tokens.push({ type: 'number', value: 0 });
      }
      tokens.push({ type: 'operator', value: current });
      index += 1;
      continue;
    }

    if (text.slice(index, index + 2) === '{{') {
      const end = text.indexOf('}}', index + 2);
      if (end < 0) {
        throw new Error('invalid_formula_variable_token');
      }
      const path = text.slice(index + 2, end).trim();
      if (!path) throw new Error('invalid_formula_variable_token');
      tokens.push({ type: 'field', path });
      index = end + 2;
      continue;
    }

    const numberMatch = text.slice(index).match(/^\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push({ type: 'number', value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    throw new Error(`invalid_formula_character:${current}`);
  }

  return tokens;
};

export const parseSimpleFormulaExpression = (source: string): FormulaExpressionNode => {
  const tokens = tokenizeSimpleFormula(source);
  if (tokens.length === 0) {
    throw new Error('empty_formula_expression');
  }

  const output: Array<SimpleFormulaToken> = [];
  const operators: Array<SimpleFormulaToken> = [];

  tokens.forEach((token) => {
    if (token.type === 'number' || token.type === 'field') {
      output.push(token);
      return;
    }

    if (token.type === 'operator') {
      while (operators.length > 0) {
        const top = operators[operators.length - 1];
        if (top.type !== 'operator') break;
        if (SIMPLE_OPERATOR_PRECEDENCE[top.value] < SIMPLE_OPERATOR_PRECEDENCE[token.value]) break;
        output.push(operators.pop() as SimpleFormulaToken);
      }
      operators.push(token);
      return;
    }

    if (token.type === 'paren' && token.value === '(') {
      operators.push(token);
      return;
    }

    while (operators.length > 0) {
      const top = operators[operators.length - 1];
      if (top.type === 'paren' && top.value === '(') break;
      output.push(operators.pop() as SimpleFormulaToken);
    }
    if (operators.length === 0) {
      throw new Error('unbalanced_formula_parentheses');
    }
    operators.pop();
  });

  while (operators.length > 0) {
    const top = operators.pop() as SimpleFormulaToken;
    if (top.type === 'paren') {
      throw new Error('unbalanced_formula_parentheses');
    }
    output.push(top);
  }

  const stack: FormulaExpressionNode[] = [];
  output.forEach((token) => {
    if (token.type === 'number') {
      stack.push({ type: 'constant', value: token.value });
      return;
    }
    if (token.type === 'field') {
      stack.push({ type: 'field', path: token.path, fallback: 0 });
      return;
    }
    if (token.type === 'operator') {
      const right = stack.pop();
      const left = stack.pop();
      if (!left || !right) {
        throw new Error('invalid_formula_expression');
      }
      stack.push({
        type: 'binary',
        operator: SIMPLE_OPERATOR_TO_NODE[token.value],
        left,
        right,
      });
    }
  });

  if (stack.length !== 1) {
    throw new Error('invalid_formula_expression');
  }

  return stack[0];
};
