export const THEME_STORAGE_KEY = 'kalamapp-theme';
export const BRANDING_UPDATED_EVENT = 'erp:branding-updated';
export const BRANDING_APPLIED_EVENT = 'erp:branding-applied';
export const BRANDING_INTEGRATION_CONNECTION_TYPE = 'ui_theme';
export const BRANDING_INTEGRATION_PROVIDER = 'branding';
export const AUTO_THEME_LIGHT_START_HOUR = 6;
export const AUTO_THEME_DARK_START_HOUR = 18;

export interface BrandingPalette {
  primary: string;
  secondary: string;
  accentPink: string;
  darkBg: string;
  darkSurface: string;
  darkBorder: string;
}

export interface BrandingConfig {
  brandName: string;
  shortName: string;
  appTitle: string;
  logoUrl?: string | null;
  iconUrl?: string | null;
  paletteKey: BrandingPaletteKey;
  palette: BrandingPalette;
}

export const resolveSmartThemeMode = (date = new Date()): 'light' | 'dark' => {
  const hour = Number(date?.getHours?.() ?? 12);
  return hour >= AUTO_THEME_DARK_START_HOUR || hour < AUTO_THEME_LIGHT_START_HOUR ? 'dark' : 'light';
};

export const BRAND_PALETTE_PRESETS = {
  executive_indigo: {
    label: 'ایندیگو مدیریتی',
    palette: {
      primary: '#3730A3',
      secondary: '#1E1B4B',
      accentPink: '#DB2777',
      darkBg: '#12161D',
      darkSurface: '#1D232D',
      darkBorder: '#374151',
    },
  },
  corporate_blue: {
    label: 'آبی سازمانی',
    palette: {
      primary: '#2563EB',
      secondary: '#0F172A',
      accentPink: '#EC4899',
      darkBg: '#12161D',
      darkSurface: '#1D232D',
      darkBorder: '#374151',
    },
  },
  deep_ocean: {
    label: 'اقیانوس عمیق',
    palette: {
      primary: '#1D4ED8',
      secondary: '#111827',
      accentPink: '#F472B6',
      darkBg: '#111820',
      darkSurface: '#1B2430',
      darkBorder: '#334155',
    },
  },
  ruby_red: {
    label: 'قرمز یاقوتی',
    palette: {
      primary: '#DC2626',
      secondary: '#7F1D1D',
      accentPink: '#FB7185',
      darkBg: '#131619',
      darkSurface: '#1D2127',
      darkBorder: '#3A4048',
    },
  },
  amber_navy: {
    label: 'زرد و سورمه‌ای',
    palette: {
      primary: '#F59E0B',
      secondary: '#0F172A',
      accentPink: '#EC4899',
      darkBg: '#12161B',
      darkSurface: '#1E232A',
      darkBorder: '#3A414A',
    },
  },
  kalam_sky: {
    label: 'آبی صورتی',
    palette: {
      primary: '#1AABDC',
      secondary: '#0B3B5E',
      accentPink: '#CB0F70',
      darkBg: '#0C1C2A',
      darkSurface: '#122434',
      darkBorder: '#1D3550',
    },
  },
} as const;

export type BrandingPaletteKey = keyof typeof BRAND_PALETTE_PRESETS;
export const DEFAULT_PALETTE_KEY: BrandingPaletteKey = 'executive_indigo';

type Rgb = { r: number; g: number; b: number };

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

const normalizeHex = (value: unknown, fallback: string) => {
  const raw = String(value ?? '').trim();
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toUpperCase() : fallback;
};

const hexToRgb = (hex: string): Rgb => {
  const safe = normalizeHex(hex, '#000000').slice(1);
  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }: Rgb) =>
  `#${clampChannel(r).toString(16).padStart(2, '0')}${clampChannel(g).toString(16).padStart(2, '0')}${clampChannel(b).toString(16).padStart(2, '0')}`.toUpperCase();

const mixColors = (from: string, to: string, ratio: number) => {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const r = a.r + (b.r - a.r) * ratio;
  const g = a.g + (b.g - a.g) * ratio;
  const bb = a.b + (b.b - a.b) * ratio;
  return rgbToHex({ r, g, b: bb });
};

const toRgbChannels = (hex: string) => {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
};

export const DEFAULT_BRANDING: BrandingConfig = {
  brandName: 'اتوماسیون هوشمند تازه سیستم',
  shortName: 'تازه سیستم',
  appTitle: 'TazeSystem',
  logoUrl: null,
  iconUrl: null,
  paletteKey: DEFAULT_PALETTE_KEY,
  palette: { ...BRAND_PALETTE_PRESETS[DEFAULT_PALETTE_KEY].palette },
};

export type BrandingSettingsPayload = Partial<{
  brand_name: string;
  short_name: string;
  app_title: string;
  palette_key: BrandingPaletteKey;
  primary_color: string;
  secondary_color: string;
  accent_pink_color: string;
  dark_bg_color: string;
  dark_surface_color: string;
  dark_border_color: string;
}>;

const isPaletteKey = (value: unknown): value is BrandingPaletteKey =>
  typeof value === 'string' && value in BRAND_PALETTE_PRESETS;

export const mergeBrandingConfig = (
  base: BrandingConfig,
  overrides?: BrandingSettingsPayload | null,
): BrandingConfig => {
  const next = overrides || {};
  const paletteKey = isPaletteKey(next.palette_key) ? next.palette_key : base.paletteKey;
  const presetPalette = BRAND_PALETTE_PRESETS[paletteKey]?.palette || base.palette;
  const brandName = String(next.brand_name || base.brandName).trim() || base.brandName;
  const shortName = String(next.short_name || base.shortName).trim() || base.shortName;
  const appTitle = String(next.app_title || brandName || base.appTitle).trim() || base.appTitle;
  const palette: BrandingPalette =
    isPaletteKey(next.palette_key)
      ? { ...presetPalette }
      : {
          // Legacy fallback: if old custom colors exist, keep working until user picks a preset.
          primary: normalizeHex(next.primary_color, presetPalette.primary),
          secondary: normalizeHex(next.secondary_color, presetPalette.secondary),
          accentPink: normalizeHex(next.accent_pink_color, presetPalette.accentPink),
          darkBg: normalizeHex(next.dark_bg_color, presetPalette.darkBg),
          darkSurface: normalizeHex(next.dark_surface_color, presetPalette.darkSurface),
          darkBorder: normalizeHex(next.dark_border_color, presetPalette.darkBorder),
        };

  return {
    brandName,
    shortName,
    appTitle,
    logoUrl: base.logoUrl || null,
    iconUrl: base.iconUrl || null,
    paletteKey,
    palette,
  };
};

// Build the full set of brand CSS variables from a palette. Reusable for both
// the global document (applyBrandCssVariables) and scoped containers (landing page theme).
export const buildBrandCssVars = (palette: BrandingPalette): Record<string, string> => {
  // Build a full scale from primary+secondary so Tailwind classes stay consistent even with custom colors.
  const shades = {
    50: mixColors(palette.primary, '#FFFFFF', 0.92),
    100: mixColors(palette.primary, '#FFFFFF', 0.84),
    200: mixColors(palette.primary, '#FFFFFF', 0.72),
    300: mixColors(palette.primary, '#FFFFFF', 0.58),
    400: mixColors(palette.primary, '#FFFFFF', 0.35),
    500: palette.primary,
    600: mixColors(palette.primary, '#000000', 0.12),
    700: palette.secondary,
    800: mixColors(palette.secondary, '#000000', 0.16),
    900: palette.darkBg,
  };

  return {
    '--brand-50-rgb': toRgbChannels(shades[50]),
    '--brand-100-rgb': toRgbChannels(shades[100]),
    '--brand-200-rgb': toRgbChannels(shades[200]),
    '--brand-300-rgb': toRgbChannels(shades[300]),
    '--brand-400-rgb': toRgbChannels(shades[400]),
    '--brand-500-rgb': toRgbChannels(shades[500]),
    '--brand-600-rgb': toRgbChannels(shades[600]),
    '--brand-700-rgb': toRgbChannels(shades[700]),
    '--brand-800-rgb': toRgbChannels(shades[800]),
    '--brand-900-rgb': toRgbChannels(shades[900]),
    '--brand-accent-pink-rgb': toRgbChannels(palette.accentPink),
    '--app-dark-bg-rgb': toRgbChannels(palette.darkBg),
    '--app-dark-surface-rgb': toRgbChannels(palette.darkSurface),
    '--app-dark-border-rgb': toRgbChannels(palette.darkBorder),
  };
};

export const applyBrandCssVariables = (branding: BrandingConfig) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const cssVars = buildBrandCssVars(branding.palette);
  Object.entries(cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
};
