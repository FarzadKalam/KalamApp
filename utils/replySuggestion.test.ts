import { describe, expect, it } from 'vitest';
import { buildRecentReplySuggestionMessages } from './replySuggestion';

describe('buildRecentReplySuggestionMessages', () => {
  it('keeps each resolved bot participant identity in the recent conversation context', () => {
    const result = buildRecentReplySuggestionMessages([
      { direction: 'inbound', author: 'شرکت آریا', text: 'زمان تحویل چه موقع است؟', sourceRow: { created_at: '2026-07-14T10:00:00Z' } },
      { direction: 'inbound', author: '@ali_support', text: 'لطفا فاکتور را هم بفرستید.' },
      { direction: 'outbound', author: 'مریم احمدی', text: 'در حال بررسی هستم.' },
    ]);

    expect(result).toEqual([
      {
        direction: 'inbound',
        authorName: 'شرکت آریا',
        text: 'زمان تحویل چه موقع است؟',
        createdAt: '2026-07-14T10:00:00Z',
      },
      {
        direction: 'inbound',
        authorName: '@ali_support',
        text: 'لطفا فاکتور را هم بفرستید.',
        createdAt: null,
      },
      {
        direction: 'outbound',
        authorName: 'مریم احمدی',
        text: 'در حال بررسی هستم.',
        createdAt: null,
      },
    ]);
  });

  it('limits context to the latest 18 useful messages and describes attachment-only messages', () => {
    const items = Array.from({ length: 20 }, (_, index) => ({
      direction: 'inbound',
      author: `فرستنده ${index + 1}`,
      text: index === 19 ? '' : `پیام ${index + 1}`,
      attachments: index === 19 ? [{ name: 'پیش‌فاکتور.pdf' }] : [],
    }));

    const result = buildRecentReplySuggestionMessages(items);

    expect(result).toHaveLength(18);
    expect(result[0].authorName).toBe('فرستنده 3');
    expect(result[17].text).toBe('پیوست: پیش‌فاکتور.pdf');
  });
});
