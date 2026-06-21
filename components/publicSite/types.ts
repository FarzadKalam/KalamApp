// انواع سکشن‌های صفحه فرود (Landing) — سکشن‌محور / Elementor سبک
export type SectionType =
  | 'hero'
  | 'hero_tree'
  | 'logos'
  | 'stats'
  | 'features'
  | 'feature_slider'
  | 'process'
  | 'process_showcase'
  | 'automation'
  | 'communications'
  | 'integrations'
  | 'ai'
  | 'hr'
  | 'accounting'
  | 'calendar'
  | 'screenshots'
  | 'comparison'
  | 'testimonials'
  | 'pricing'
  | 'faq'
  | 'cta';

export interface LandingSection<P = Record<string, any>> {
  id: string;
  type: SectionType;
  enabled: boolean;
  props: P;
}

export interface LandingPageData {
  id?: string;
  slug: string;
  title?: string | null;
  sections: LandingSection[];
  theme?: import('./BrandScope').LandingTheme | null;
  seo_title?: string | null;
  seo_description?: string | null;
  og_image_url?: string | null;
}

// آیتم‌های ساده پرکاربرد
export interface IconItem {
  icon?: string; // کلید آیکن (نگاشت در sectionRegistry) یا URL تصویر
  title: string;
  text?: string;
  featured?: boolean;
}

export interface StatItem {
  value: number;
  suffix?: string;
  label: string;
}

export interface CtaConfig {
  label: string;
  href: string;
}
