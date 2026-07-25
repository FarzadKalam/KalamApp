import { describe, expect, it } from 'vitest';
import { calculateMbtiResult, MBTI_QUESTIONS } from './mbtiAssessment';

describe('calculateMbtiResult', () => {
  it('builds the four-letter result from the module questions', () => {
    const values = Object.fromEntries(MBTI_QUESTIONS.map((question) => [question.key, question.options[0].value]));
    expect(calculateMbtiResult(values)).toMatchObject({
      type: 'ESTJ',
      isComplete: true,
    });
  });

  it('does not report a type while answers are incomplete or tied', () => {
    const values = Object.fromEntries(MBTI_QUESTIONS.map((question) => [question.key, question.options[0].value]));
    delete values.ei_01;
    expect(calculateMbtiResult(values)).toMatchObject({ type: null, isComplete: false });
  });
});
