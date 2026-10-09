import { describe, expect, it } from 'vitest';
import { buildSystemFieldKey, preserveOrBuildSystemFieldKey } from './systemFieldKeys';

describe('system field keys', () => {
  it('creates a stable ASCII key from a Persian label without exposing a manual identifier', () => {
    const key = buildSystemFieldKey({ namespace: 'task_field', label: 'لینک جلسه' });
    expect(key).toMatch(/^task_field_[a-z0-9]+$/);
    expect(key).toBe(buildSystemFieldKey({ namespace: 'task_field', label: 'لینک جلسه' }));
  });

  it('resolves duplicate labels and preserves an existing saved key', () => {
    const first = buildSystemFieldKey({ namespace: 'web_form_field', label: 'رضایت' });
    expect(buildSystemFieldKey({ namespace: 'web_form_field', label: 'رضایت', existingKeys: [first] })).toBe(`${first}_2`);
    expect(preserveOrBuildSystemFieldKey({ currentKey: 'saved_key', namespace: 'web_form_field', label: 'عنوان جدید' })).toBe('saved_key');
  });
});
