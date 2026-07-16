import { describe, expect, it } from 'vitest';
import {
  canCurrentUserAccessInternalSystemNote,
  isInternalSystemNoteRow,
  normalizeInternalNoteRecipientIds,
} from './internalNoteAccess';

describe('internal system note access', () => {
  it('only exposes a workflow system note to its selected user', () => {
    const note = {
      source_type: 'system',
      mention_user_ids: ['user-recipient'],
      mention_role_ids: [],
      metadata: { workflow_id: 'workflow-1' },
    };

    expect(canCurrentUserAccessInternalSystemNote(note, 'user-recipient', null)).toBe(true);
    expect(canCurrentUserAccessInternalSystemNote(note, 'user-other', null)).toBe(false);
  });

  it('allows a system note addressed to the current role', () => {
    const note = {
      source_type: 'system',
      mention_user_ids: [],
      mention_role_ids: ['role-recipient'],
    };

    expect(canCurrentUserAccessInternalSystemNote(note, 'user-1', 'role-recipient')).toBe(true);
    expect(canCurrentUserAccessInternalSystemNote(note, 'user-1', 'role-other')).toBe(false);
  });

  it('keeps explicitly organization-wide system notes visible', () => {
    const note = { source_type: 'system', is_org_wide: true };
    expect(canCurrentUserAccessInternalSystemNote(note, 'user-1', null)).toBe(true);
  });

  it('does not apply system-recipient rules to ordinary direct notes', () => {
    expect(isInternalSystemNoteRow({ source_type: 'user' })).toBe(false);
    expect(canCurrentUserAccessInternalSystemNote({ source_type: 'user' }, 'user-1', null)).toBe(true);
  });

  it('normalizes PostgreSQL array strings used by fallback responses', () => {
    expect(normalizeInternalNoteRecipientIds('{"user-1","user-2"}')).toEqual(['user-1', 'user-2']);
  });
});
