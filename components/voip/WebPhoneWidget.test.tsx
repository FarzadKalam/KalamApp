import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup,fireEvent,render, screen } from '@testing-library/react';
import {afterEach} from 'vitest';
import {dialWebPhone,useVoipState} from '../../utils/voipStore';
afterEach(()=>{cleanup();vi.clearAllMocks();});
vi.mock('./VoipDirectoryPicker',()=>({default:()=>null}));
import WebPhoneWidget from './WebPhoneWidget';
import WebPhoneHeaderButton from './WebPhoneHeaderButton';
vi.mock('./CallContactContextPanel',()=>({default:()=> <div>پروندهٔ مخاطب تماس</div>}));

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
  disconnectVoipWebPhone:vi.fn(),
  getWebPhoneAudioOutputs:vi.fn(async()=>[]),
  selectWebPhoneAudioOutput:vi.fn(async()=>''),
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
    expect(screen.getByText(/حساب: 101/)).toBeDefined();
    expect(screen.queryByText('سوابق و پرونده مخاطب')).toBeNull();
    expect(screen.getByRole('button',{name:'جست‌وجوی داخلی و مخاطب'})).toBeDefined();
    expect(screen.getByRole('button', { name: /برقراری تماس صوتی/i })).toBeDefined();

    // Verify tactile keypad has dir="ltr" for standard international layout
    const digit1 = screen.getByText('1');
    const keypadContainer = digit1.closest('[dir="ltr"]');
    expect(keypadContainer).not.toBeNull();
    fireEvent.click(digit1);
    const history=screen.getByRole('button',{name:/سوابق و پرونده مخاطب/});
    expect(history.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('پروندهٔ مخاطب تماس')).toBeNull();
    fireEvent.click(history);expect(screen.getByText('پروندهٔ مخاطب تماس')).toBeDefined();
    expect(dialWebPhone).not.toHaveBeenCalled();
  });
  it('shows the permitted contact avatar and speaker control during a call',()=>{
    vi.mocked(useVoipState).mockReturnValueOnce({status:'registered',extension:'101',panelOpen:true,activeCall:{state:'active',remoteNumber:'09120000000',remoteDisplayName:'مخاطب',avatarUrl:'/portrait.png'},errorMessage:null} as any);
    render(<WebPhoneWidget voipEnabled planFeatureEnabled dialMode="webphone_webrtc" />);
    expect(screen.getByRole('button',{name:'بلندگو و خروجی صدا'})).toBeDefined();
    expect(document.querySelector('img[src$="/portrait.png"]')).not.toBeNull();
  });
});
