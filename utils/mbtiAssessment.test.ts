import { describe, expect, it } from 'vitest';
import { calculateMbtiResult, getMbtiProfileSummary, MBTI_QUESTIONS } from './mbtiAssessment';

describe('calculateMbtiResult', () => {
  it('builds the four-letter result from the module questions', () => {
    const values = Object.fromEntries(MBTI_QUESTIONS.map((question) => [question.key, question.options[0].value]));
    expect(calculateMbtiResult(values)).toMatchObject({
      type: 'ESTJ',
      isComplete: true,
    });
  });

  it('does not report a type while answers are incomplete', () => {
    const values = Object.fromEntries(MBTI_QUESTIONS.map((question) => [question.key, question.options[0].value]));
    delete values.ei_01;
    expect(calculateMbtiResult(values)).toMatchObject({ type: null, isComplete: false });
  });

  it('keeps a complete tied axis understandable as a mixed profile', () => {
    const values = Object.fromEntries(MBTI_QUESTIONS.map((question) => [question.key, question.options[0].value]));
    values.tf_01 = 'f';
    values.tf_02 = 'f';
    values.tf_03 = 'f';
    values.tf_04 = 'f';
    const result = calculateMbtiResult(values);

    expect(result).toMatchObject({ type: null, isComplete: true });
    expect(getMbtiProfileSummary(result.axes)).toContain('تعادل در تصمیم‌گیری');
  });
});
