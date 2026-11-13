import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import WebPhoneWidget from './WebPhoneWidget';
import WebPhoneHeaderButton from './WebPhoneHeaderButton';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock supabaseClient with importOriginal
vi.mock('../../supabaseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../supabaseClient')>();
  return {
    ...actual,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        ilike: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
      },
    },
  };
});

// Mock voipStore
vi.mock('../../utils/voipStore', () => ({
  useVoipState: vi.fn(() => ({
    status: 'registered',
    extension: '101',
    panelOpen: true,
    activeCall: null,
    errorMessage: null,
  })),
  setVoipPanelOpen: vi.fn(),
  connectVoipWebPhone: vi.fn(),
  dialWebPhone: vi.fn(),
  answerWebPhoneCall: vi.fn(),
  rejectOrHangupWebPhoneCall: vi.fn(),
  toggleMuteWebPhone: vi.fn(),
  toggleHoldWebPhone: vi.fn(),
  sendDtmfWebPhone: vi.fn(),
  transferWebPhoneCall: vi.fn(),
}));

describe('WebPhoneWidget and Header Button', () => {
  it('renders header button correctly with SVG and Persian title', () => {
    render(<WebPhoneHeaderButton visible />);
    const button = screen.getByRole('button', { name: /تلفن اینترنتی VoIP/i });
    expect(button).toBeDefined();
  });

  it('renders WebPhoneWidget with Telegram desktop voice style and keypad', () => {
    render(
      <WebPhoneWidget
        voipEnabled={true}
        planFeatureEnabled={true}
        dialMode="webphone_webrtc"
      />
    );

    expect(screen.getByText('تلفن اینترنتی تازه سیستم')).toBeDefined();
    expect(screen.getByText('101')).toBeDefined();
    expect(screen.getByText('سوابق و پرونده مخاطب')).toBeDefined();
    expect(screen.getByRole('button', { name: /برقراری تماس صوتی/i })).toBeDefined();
  });
});
