import { describe, expect, it } from 'vitest';
import {
  getDefaultAuthenticatedAppPath,
  isSaasAdminPanelHost,
  isSharedAppHost,
  isTazeSystemFamilyHost,
  isTenantHost,
} from './hostRouting';

describe('host routing for the TazeSystem provider panel', () => {
  it('keeps panel.tazesystem.ir separate from customer tenants', () => {
    expect(isSaasAdminPanelHost('panel.tazesystem.ir')).toBe(true);
    expect(isTenantHost('panel.tazesystem.ir')).toBe(false);
    expect(isTazeSystemFamilyHost('panel.tazesystem.ir')).toBe(true);
    expect(isSharedAppHost('panel.tazesystem.ir')).toBe(true);
    expect(getDefaultAuthenticatedAppPath('panel.tazesystem.ir')).toBe('/dashboard');
  });
});
