import { describe, expect, it } from 'vitest';
import { getSafePrintText } from './safePrintValue';

describe('getSafePrintText', () => {
  it('never prints JavaScript object placeholders', () => {
    expect(getSafePrintText({ definition: { id: 1 } }, '')).toBe('');
    expect(getSafePrintText('[object Object]', '')).toBe('');
  });

  it('uses a readable object label and never exposes a raw UUID', () => {
    expect(getSafePrintText({ name: 'کالای نمونه', id: '11111111-1111-4111-8111-111111111111' })).toBe('کالای نمونه');
    expect(getSafePrintText({ id: '11111111-1111-4111-8111-111111111111' }, '-')).toBe('-');
  });

  it('preserves array order while omitting unprintable objects', () => {
    expect(getSafePrintText([{ title: 'اول' }, { nested: true }, { label: 'سوم' }])).toBe('اول، سوم');
  });
});

