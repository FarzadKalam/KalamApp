import { describe, expect, it } from 'vitest';
import {
  assignProcessTemplateIdentityAliases,
  resolveProcessTemplateLaneName,
  resolveProcessTemplateTokenValue,
} from './processTemplateContext';

describe('processTemplateContext identity variables', () => {
  it('uses the existing process graph to expose process and row names', () => {
    const stage = {
      process_lane_key: 'lane-2',
      metadata: {
        process_graph: {
          lanes: [
            { key: 'lane-1', name: 'ردیف اول' },
            { key: 'lane-2', name: 'ردیف دوم' },
          ],
        },
      },
    };
    const context = assignProcessTemplateIdentityAliases({}, {
      processName: 'فرآیند فروش',
      laneName: resolveProcessTemplateLaneName(stage),
    });

    expect(resolveProcessTemplateTokenValue(context, 'process_name')).toBe('فرآیند فروش');
    expect(resolveProcessTemplateTokenValue(context, 'نام فرآیند')).toBe('فرآیند فروش');
    expect(resolveProcessTemplateTokenValue(context, 'process_lane_name')).toBe('ردیف دوم');
    expect(resolveProcessTemplateTokenValue(context, 'نام ردیف')).toBe('ردیف دوم');
  });

  it('reads a row name from serialized process metadata', () => {
    expect(resolveProcessTemplateLaneName({
      process_lane_key: 'lane-support',
      metadata: JSON.stringify({
        process_graph: { lanes: [{ key: 'lane-support', title: 'پشتیبانی' }] },
      }),
    })).toBe('پشتیبانی');
  });
});
