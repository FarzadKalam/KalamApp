import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock('./channelSettings', () => ({ getActiveChannelSettings: vi.fn() }));
vi.mock('./outboundMessages', () => ({
  createOutboundMessageLog: vi.fn(),
  updateOutboundMessageStatus: vi.fn(),
}));

import { getConfiguredSmsSenderNumbers } from './smsGateway';

describe('SMS sender numbers', () => {
  it('normalizes Persian and Arabic digits and removes duplicates', () => {
    expect(getConfiguredSmsSenderNumbers({
      sender_number: '۵۰۰۰',
      sender_numbers: ['5000', ' ٣٠٠٠ ', '۲۰۰۰'],
    })).toEqual(['5000', '3000', '2000']);
  });

  it('keeps the legacy sender as the first default line', () => {
    expect(getConfiguredSmsSenderNumbers({
      sender_number: '1000',
      sender_numbers: ['2000', '3000'],
    })).toEqual(['1000', '2000', '3000']);
  });

  it('drops malformed sender identifiers', () => {
    expect(getConfiguredSmsSenderNumbers({
      sender_numbers: ['12', '5000x', '123456789012345678901', '7000'],
    })).toEqual(['7000']);
  });
});
