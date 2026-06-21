import React from 'react';
import {
  BRAND_PALETTE_PRESETS, DEFAULT_PALETTE_KEY, buildBrandCssVars,
  type BrandingPalette, type BrandingPaletteKey,
} from '../../theme/brandTheme';

export interface LandingTheme {
  paletteKey?: BrandingPaletteKey;
  custom?: { primary?: string; secondary?: string; accentPink?: string };
}

// پالت نهایی را از تم صفحه می‌سازد. اگر تمی ست نشده باشد null برمی‌گرداند
// تا از پالت سراسری برند (CSS var های موجود) استفاده شود.
export const resolveLandingPalette = (theme?: LandingTheme | null): BrandingPalette | null => {
  if (!theme) return null;
  const custom = theme.custom ?? {};
  const hasCustom = !!(custom.primary || custom.secondary || custom.accentPink);
  if (!theme.paletteKey && !hasCustom) return null;
  const base = BRAND_PALETTE_PRESETS[theme.paletteKey ?? DEFAULT_PALETTE_KEY].palette;
  return {
    ...base,
    primary: custom.primary || base.primary,
    secondary: custom.secondary || base.secondary,
    accentPink: custom.accentPink || base.accentPink,
  };
};

// متغیرهای CSS برند را به‌صورت scoped روی یک wrapper اعمال می‌کند تا فقط
// محتوای داخل آن (صفحه فرود) تحت تأثیر باشد، نه کل سند/پنل ادمین.
const BrandScope: React.FC<{ theme?: LandingTheme | null; children: React.ReactNode }> = ({ theme, children }) => {
  const palette = resolveLandingPalette(theme);
  if (!palette) return <>{children}</>;
  const vars = buildBrandCssVars(palette);
  return <div style={vars as React.CSSProperties}>{children}</div>;
};

export default BrandScope;
