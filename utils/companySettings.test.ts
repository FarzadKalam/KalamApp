import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchSessionBootstrap } = vi.hoisted(() => ({
  fetchSessionBootstrap: vi.fn(),
}));

vi.mock('./sessionCache', () => ({
  fetchSessionBootstrap,
}));

import { loadScopedCompanySettings } from './companySettings';

describe('loadScopedCompanySettings', () => {
  beforeEach(() => {
    fetchSessionBootstrap.mockReset();
  });

  it('does not query global company settings when authenticated bootstrap fails before org resolution', async () => {
    const bootstrapError = { message: 'timeout' };
    fetchSessionBootstrap.mockResolvedValue({
      user: { id: 'user-1' },
      orgId: null,
      bootstrapError,
    });

    const supabase = {
      from: vi.fn(() => {
        throw new Error('company_settings should not be queried');
      }),
    } as any;

    const result = await loadScopedCompanySettings(supabase);

    expect(result.error).toBe(bootstrapError);
    expect(result.data).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does not fallback to org_id is null when the org-scoped query itself errors', async () => {
    fetchSessionBootstrap.mockResolvedValue({
      user: { id: 'user-1' },
      orgId: 'org-1',
      bootstrapError: null,
    });

    const maybeSingle = vi.fn(async () => ({
      data: null,
      error: { message: 'Failed to fetch' },
    }));
    const is = vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn(() => ({
          maybeSingle,
        })),
      })),
    }));
    const eq = vi.fn(() => ({
      maybeSingle,
    }));
    const limit = vi.fn(() => ({
      eq,
      is,
      maybeSingle,
    }));
    const order = vi.fn(() => ({
      limit,
    }));
    const select = vi.fn(() => ({
      order,
    }));
    const from = vi.fn(() => ({
      select,
    }));

    const result = await loadScopedCompanySettings({ from } as any);

    expect(result.error).toEqual({ message: 'Failed to fetch' });
    expect(eq).toHaveBeenCalledWith('org_id', 'org-1');
    expect(is).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
  });
});
