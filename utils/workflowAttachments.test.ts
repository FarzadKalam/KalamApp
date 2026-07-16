import { describe, expect, it } from 'vitest';
import { isStarredRecordFile } from './workflowAttachments';

describe('workflowAttachments', () => {
  it('recognizes both canonical and compatible starred metadata', () => {
    expect(isStarredRecordFile({ is_main_image: true, entry_metadata: null })).toBe(true);
    expect(isStarredRecordFile({ is_main_image: false, entry_metadata: { main_image: { starred: true } } })).toBe(true);
    expect(isStarredRecordFile({ is_main_image: false, entry_metadata: { starred: true } })).toBe(true);
    expect(isStarredRecordFile({ is_main_image: false, entry_metadata: {} })).toBe(false);
  });
});

