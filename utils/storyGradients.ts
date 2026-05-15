// گرادینت‌های پیش‌فرض استوری‌ها
// همسو با پالت برندینگ پروژه (BrandingPalette)

export type StoryGradientKey = keyof typeof STORY_GRADIENT_PRESETS;

export interface StoryGradientPreset {
  key: StoryGradientKey;
  label: string;
  gradient: string;
  textColor: string;
}

export const STORY_GRADIENT_PRESETS = {
  // ─── برند اصلی پروژه ───────────────────────────
  brand_indigo: {
    label: 'ایندیگو',
    gradient: 'linear-gradient(135deg, #3730A3 0%, #6D28D9 100%)',
    textColor: '#FFFFFF',
  },
  brand_pink: {
    label: 'صبح‌گاهی',
    gradient: 'linear-gradient(135deg, #3730A3 0%, #DB2777 100%)',
    textColor: '#FFFFFF',
  },
  brand_ocean: {
    label: 'اقیانوس',
    gradient: 'linear-gradient(135deg, #1D4ED8 0%, #06B6D4 100%)',
    textColor: '#FFFFFF',
  },
  brand_night: {
    label: 'شب',
    gradient: 'linear-gradient(135deg, #1E1B4B 0%, #3730A3 100%)',
    textColor: '#FFFFFF',
  },
  // ─── رنگ‌های گرم ───────────────────────────────
  warm_sunset: {
    label: 'غروب',
    gradient: 'linear-gradient(135deg, #DC2626 0%, #FBBF24 100%)',
    textColor: '#FFFFFF',
  },
  warm_rose: {
    label: 'رز',
    gradient: 'linear-gradient(135deg, #9D174D 0%, #F472B6 100%)',
    textColor: '#FFFFFF',
  },
  warm_sand: {
    label: 'شنی',
    gradient: 'linear-gradient(135deg, #92400E 0%, #FCD34D 100%)',
    textColor: '#FFFFFF',
  },
  warm_fire: {
    label: 'آتش',
    gradient: 'linear-gradient(135deg, #7F1D1D 0%, #F97316 100%)',
    textColor: '#FFFFFF',
  },
  // ─── رنگ‌های سرد ───────────────────────────────
  cool_forest: {
    label: 'جنگل',
    gradient: 'linear-gradient(135deg, #065F46 0%, #10B981 100%)',
    textColor: '#FFFFFF',
  },
  cool_mint: {
    label: 'نعنا',
    gradient: 'linear-gradient(135deg, #0F766E 0%, #6EE7B7 100%)',
    textColor: '#FFFFFF',
  },
  cool_sky: {
    label: 'آسمانی',
    gradient: 'linear-gradient(135deg, #0369A1 0%, #7DD3FC 100%)',
    textColor: '#FFFFFF',
  },
  // ─── خنثی ─────────────────────────────────────
  neutral_slate: {
    label: 'سنگ',
    gradient: 'linear-gradient(135deg, #1E293B 0%, #64748B 100%)',
    textColor: '#FFFFFF',
  },
  neutral_light: {
    label: 'روشن',
    gradient: 'linear-gradient(135deg, #E2E8F0 0%, #94A3B8 100%)',
    textColor: '#1E293B',
  },
  neutral_dark: {
    label: 'تیره',
    gradient: 'linear-gradient(135deg, #0F172A 0%, #334155 100%)',
    textColor: '#FFFFFF',
  },
} as const;

export const STORY_GRADIENT_PRESET_LIST: StoryGradientPreset[] = Object.entries(
  STORY_GRADIENT_PRESETS
).map(([key, val]) => ({
  key: key as StoryGradientKey,
  ...val,
}));

export const getGradientPreset = (key: string | null | undefined): StoryGradientPreset => {
  const found = key ? (STORY_GRADIENT_PRESETS as Record<string, any>)[key] : null;
  if (found) return { key: key as StoryGradientKey, ...found };
  return { key: 'brand_indigo', ...STORY_GRADIENT_PRESETS.brand_indigo };
};

export const STORY_REACTION_EMOJIS = ['❤️', '👍', '🎉', '😮', '🙏', '💪'] as const;
export type StoryReactionEmoji = (typeof STORY_REACTION_EMOJIS)[number];
