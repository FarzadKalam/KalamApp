import { describe, expect, it } from 'vitest';
import { smsDeliveryReportsConfig } from '../modules/smsDeliveryReportsConfig';
import { voipCallReportsConfig } from '../modules/voipCallReportsConfig';
import { buildVoipThreads } from './notificationViewModels';
import { hasVoipRecording } from './voipRecording';

describe('communication reports', () => {
  it('sorts SMS reports by the actual message time', () => {
    expect(smsDeliveryReportsConfig.defaultSorters).toEqual([
      { field: 'message_at', order: 'desc' },
    ]);
  });

  it('sorts VoIP reports by call start time', () => {
    expect(voipCallReportsConfig.defaultSorters).toEqual([
      { field: 'started_at', order: 'desc' },
    ]);
  });

  it('keeps outgoing calls in call threads without counting them as unread', () => {
    const threads = buildVoipThreads({
      calls: [{
        id: 'call-1',
        direction: 'outgoing',
        destination_number: '09120000000',
        started_at: '2026-06-14T01:00:00.000Z',
      }],
      isNotificationRead: () => false,
    });

    expect(threads).toHaveLength(1);
    expect(threads[0].phone).toBe('09120000000');
    expect(threads[0].unreadCount).toBe(0);
  });

  it('recognizes Telefonchy recordings only when the required identifiers exist', () => {
    expect(hasVoipRecording({ recording_url: 'https://example.test/call.mp3' })).toBe(true);
    expect(hasVoipRecording({ file_id: 'file-1', call_id: 'call-1' })).toBe(true);
    expect(hasVoipRecording({ file_id: 'file-1' })).toBe(false);
    expect(hasVoipRecording({ file_id: '0', call_id: 'call-1' })).toBe(false);
  });
});
