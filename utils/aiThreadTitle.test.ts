import { describe, expect, it } from 'vitest';
import { buildSmartAiThreadTitle } from './aiThreadTitle';

describe('buildSmartAiThreadTitle', () => {
  it('builds a concise thread title from the first meaningful prompt sentence', () => {
    expect(buildSmartAiThreadTitle('لطفا یک گزارش فروش ماهانه برای مشتریان VIP بساز. جزئیات هم داشته باشد.'))
      .toBe('یک گزارش فروش ماهانه برای مشتریان VIP بساز');
  });

  it('removes noisy urls and trims long prompts', () => {
    const title = buildSmartAiThreadTitle('این فایل را بررسی کن https://example.test/file.pdf و یک خلاصه مدیریتی خیلی کامل و طولانی برای جلسه آینده آماده کن');
    expect(title).not.toContain('https://');
    expect(title.length).toBeLessThanOrEqual(61);
  });
});
