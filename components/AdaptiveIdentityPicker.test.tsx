import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/identityDirectory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/identityDirectory')>();
  const items = [
    {
      kind: 'user' as const,
      id: 'u1',
      token: 'user:u1' as const,
      label: 'الهام رضایی',
      subtitle: 'مدیر محصول',
      avatarUrl: 'https://example.com/avatar.jpg',
      active: true,
      hierarchyRank: 0,
    },
    {
      kind: 'role' as const,
      id: 'r1',
      token: 'role:r1' as const,
      label: 'مدیریت محصول',
      subtitle: 'جایگاه سازمانی',
      iconKey: 'crown' as const,
      active: true,
      hierarchyRank: 0,
    },
    {
      kind: 'chat_group' as const,
      id: 'g1',
      token: 'chat_group:g1' as const,
      label: 'گروه عملیات',
      subtitle: 'گروه داخلی',
      active: true,
    },
  ];
  return {
    ...actual,
    searchIdentityOptions: vi.fn(async (_client, options) => {
      const scopes = options?.scopes || ['user', 'role'];
      const exact = new Set(options?.exactTokens || []);
      const selected = items.filter((item) => scopes.includes(item.kind) && (exact.size === 0 || exact.has(item.token)));
      return {
        items: selected,
        totalByKind: { user: 1, role: 1, chat_group: 1 },
        fromFallback: false,
      };
    }),
  };
});

import AdaptiveIdentityPicker from './AdaptiveIdentityPicker';
import { searchIdentityOptions } from '../utils/identityDirectory';

describe('AdaptiveIdentityPicker', () => {
  afterEach(cleanup);

  it('hydrates legacy values without exposing ids and renders the selected avatar', async () => {
    render(
      <AdaptiveIdentityPicker
        adaptiveMode="mobile-sheet"
        scopes={['user', 'role']}
        value="user_u1"
        pickerTitle="انتخاب مسئول"
      />
    );

    expect(screen.getByRole('button', { name: 'انتخاب مسئول' })).toHaveTextContent('در حال بارگذاری کاربر');
    expect(screen.getByRole('button', { name: 'انتخاب مسئول' })).not.toHaveTextContent('user_u1');
    await waitFor(() => expect(screen.getByRole('button', { name: 'انتخاب مسئول' })).toHaveTextContent('الهام رضایی'));
    expect(screen.queryByText('u1')).not.toBeInTheDocument();
    expect(screen.getByAltText('الهام رضایی')).toBeInTheDocument();
  });

  it('shows grouped user, role and internal-group options in the adaptive mobile surface', async () => {
    render(
      <AdaptiveIdentityPicker
        adaptiveMode="mobile-sheet"
        mode="multiple"
        scopes={['user', 'role', 'chat_group']}
        value={[]}
        pickerTitle="گیرندگان"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'گیرندگان' }));
    await waitFor(() => expect(screen.getByText('افراد')).toBeInTheDocument());
    expect(screen.getByText('نقش‌ها')).toBeInTheDocument();
    expect(screen.getByText('گروه‌های داخلی')).toBeInTheDocument();
    expect(screen.getByText('مدیریت محصول')).toBeInTheDocument();
    expect(screen.getByText('گروه عملیات')).toBeInTheDocument();
  });

  it('keeps the central directory request stable when a form recreates its scopes array', async () => {
    const search = vi.mocked(searchIdentityOptions);
    search.mockClear();
    const { rerender } = render(
      <AdaptiveIdentityPicker
        adaptiveMode="mobile-sheet"
        scopes={['user', 'role']}
        pickerTitle="انتخاب مسئول پیش‌فرض"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'انتخاب مسئول پیش‌فرض' }));
    await waitFor(() => expect(screen.getByText('مدیریت محصول')).toBeInTheDocument());

    rerender(
      <AdaptiveIdentityPicker
        adaptiveMode="mobile-sheet"
        scopes={['user', 'role']}
        pickerTitle="انتخاب مسئول پیش‌فرض"
      />
    );

    await waitFor(() => expect(screen.getByText('الهام رضایی')).toBeInTheDocument());
    expect(search).toHaveBeenCalledTimes(1);
  });
});
