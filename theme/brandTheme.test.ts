import { describe, expect, it } from 'vitest';
import { BRAND_PALETTE_PRESETS, getAccessibleDarkBrandTextColor } from './brandTheme';

const relativeLuminance = (hex: string) => {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrastRatio = (first: string, second: string) => {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

describe('getAccessibleDarkBrandTextColor', () => {
  it('keeps branded text readable on the dark background and surface of every preset', () => {
    Object.values(BRAND_PALETTE_PRESETS).forEach(({ palette }) => {
      const textColor = getAccessibleDarkBrandTextColor(palette);
      expect(contrastRatio(textColor, palette.darkBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(textColor, palette.darkSurface)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
