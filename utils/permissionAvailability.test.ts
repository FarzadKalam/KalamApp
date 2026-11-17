// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isPermissionFieldAvailable, isPermissionSectionAvailable } from './permissionAvailability';

describe('permission editor entitlement filtering', () => {
  it('fails closed until the current organization snapshot is loaded', () => {
    expect(isPermissionSectionAvailable('__settings_tabs', null)).toBe(false);
    expect(isPermissionFieldAvailable('customers', 'name', null)).toBe(false);
  });
  it('keeps support independent of plan while hiding unavailable paid sections and module actions', () => {
    const unavailable = { modules: {}, features: {} };
    expect(isPermissionSectionAvailable('__support_tickets', unavailable)).toBe(true);
    expect(isPermissionSectionAvailable('__reports', unavailable)).toBe(false);
    expect(isPermissionFieldAvailable('customers', '__goals_view', unavailable)).toBe(false);
    expect(isPermissionFieldAvailable('__settings_tabs', 'reservation_settings', unavailable)).toBe(false);
    expect(isPermissionFieldAvailable('__settings_tabs', 'ai', unavailable)).toBe(false);
    expect(isPermissionFieldAvailable('__communications', 'use_bot_channels', unavailable)).toBe(false);
  });
  it('uses each organization snapshot and accepts enabled alternatives for grouped features', () => {
    const available = { modules: { journal_entries: true }, features: { goals: true, reservations: true, bale_bot: true, ai_chat: true } };
    expect(isPermissionSectionAvailable('__accounting', available)).toBe(true);
    expect(isPermissionSectionAvailable('__goals', available)).toBe(true);
    expect(isPermissionFieldAvailable('customers', '__goals_view', available)).toBe(true);
    expect(isPermissionFieldAvailable('__settings_tabs', 'reservation_settings', available)).toBe(true);
    expect(isPermissionFieldAvailable('__settings_tabs', 'ai', available)).toBe(true);
    expect(isPermissionFieldAvailable('__communications', 'use_bot_channels', available)).toBe(true);
    expect(isPermissionFieldAvailable('__communications', 'use_email', available)).toBe(false);
    expect(isPermissionSectionAvailable('__accounting', { modules: {}, features: available.features })).toBe(false);
  });
});
