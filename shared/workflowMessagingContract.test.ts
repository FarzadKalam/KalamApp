import { describe, expect, it } from 'vitest';
import {
  buildDefaultWorkflowAttachmentConfig,
  getLegacyWorkflowAttachmentFields,
  getWorkflowRecipientFieldBotChannel,
  getWorkflowRecipientConfig,
  isWorkflowRecipientFieldCompatibleWithBotChannel,
  normalizeWorkflowRecipientFieldValues,
  parseWorkflowRecipientFieldReference,
  shouldIncludeStarredWorkflowAttachments,
} from './workflowMessagingContract';

describe('workflowMessagingContract', () => {
  it('uses the same deduplicated recipient scopes for note and bot actions', () => {
    expect(getWorkflowRecipientConfig({
      recipient_fields: ['customer_id', 'customer_id'],
      related_recipient_fields: ['supplier_id'],
      recipient_assignees: ['user:1'],
      recipient_targets: ['role:2', 'user:1'],
    })).toEqual({
      recipientFields: ['customer_id', 'supplier_id'],
      recipientAssignees: ['user:1', 'role:2'],
    });
  });

  it('defaults new and existing actions to starred files while preserving legacy fields', () => {
    expect(shouldIncludeStarredWorkflowAttachments({})).toBe(false);
    expect(shouldIncludeStarredWorkflowAttachments({ include_starred_attachments: true })).toBe(true);
    expect(shouldIncludeStarredWorkflowAttachments({ include_starred_attachments: false })).toBe(false);
    expect(buildDefaultWorkflowAttachmentConfig()).toEqual({
      include_starred_attachments: true,
      attachment_fields: [],
    });
    expect(getLegacyWorkflowAttachmentFields({ attachment_fields: ['image_url', 'image_url'] }))
      .toEqual(['image_url']);
  });

  it('never routes an explicit platform chat field to another bot channel', () => {
    const fieldKey = '__workflow_multi_relation__contacts::telegram_chat_id';
    expect(getWorkflowRecipientFieldBotChannel(fieldKey)).toBe('telegram');
    expect(isWorkflowRecipientFieldCompatibleWithBotChannel(fieldKey, 'telegram')).toBe(true);
    expect(isWorkflowRecipientFieldCompatibleWithBotChannel(fieldKey, 'rubika')).toBe(false);
    expect(isWorkflowRecipientFieldCompatibleWithBotChannel('related_profile_id', 'bale')).toBe(true);
  });

  it('unwraps note-compatible recipient fields for every message action', () => {
    expect(parseWorkflowRecipientFieldReference('__workflow_note_recipient__user::related_profile_id'))
      .toEqual({ fieldKey: 'related_profile_id', strategy: 'user' });
    expect(normalizeWorkflowRecipientFieldValues('profile-id', 'user')).toEqual(['user_profile-id']);
    expect(normalizeWorkflowRecipientFieldValues('role:role-id', 'user')).toEqual(['role:role-id']);
  });
});
