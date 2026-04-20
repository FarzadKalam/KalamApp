import { describe, expect, it } from 'vitest';
import { escapeRubikaAutoLinkText } from './rubikaLinkText';

describe('escapeRubikaAutoLinkText', () => {
  it('breaks url-like separators without changing the visible attachment label', () => {
    expect(escapeRubikaAutoLinkText('260415-1437.pdf')).toBe(`260415-\u20601437.\u2060pdf`);
    expect(escapeRubikaAutoLinkText('report.v1-final.pdf')).toBe(`report.\u2060v1-\u2060final.\u2060pdf`);
    expect(escapeRubikaAutoLinkText('22-554545.pdf')).toBe(`22-\u2060554545.\u2060pdf`);
  });

  it('preserves Persian names while only breaking actual URL separators', () => {
    expect(escapeRubikaAutoLinkText('فایل گزارش نهایی.pdf')).toBe(`فایل گزارش نهایی.\u2060pdf`);
    expect(escapeRubikaAutoLinkText('گزارش فروردین 1405')).toBe('گزارش فروردین 1405');
  });
});
