import { describe, expect, it } from 'vitest';
import { buildDefaultWorkflowMessageConfig, buildUnifiedWorkflowMessageConfig } from './workflowMessageAction';

describe('workflow system message device notification', () => {
  it('is opt-in by default', () => {
    expect(buildDefaultWorkflowMessageConfig().notify_when_app_closed).toBe(false);
  });

  it('preserves the device notification switch while normalizing a legacy note action', () => {
    const config = buildUnifiedWorkflowMessageConfig({
      type: 'send_note',
      config: { note_text: 'یادآوری', notify_when_app_closed: true },
    }, ['note']);
    expect(config.message_note).toBe('یادآوری');
    expect(config.notify_when_app_closed).toBe(true);
  });
});
