import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { SECTION_REGISTRY } from './sectionRegistry';
import { DEFAULT_HOME_SECTIONS } from './defaultLandingConfig';
import BrandScope, { type LandingTheme } from './BrandScope';
import type { LandingSection } from './types';

// رندر سکشن‌های صفحه فرود از دیتابیس با fallback به پیکربندی پیش‌فرض.
// preview: استفاده مستقیم از sections/theme داده‌شده (برای پیش‌نمایش در ادیتور).
const LandingRenderer: React.FC<{
  slug?: string;
  previewSections?: LandingSection[];
  previewTheme?: LandingTheme | null;
}> = ({ slug = 'home', previewSections, previewTheme }) => {
  const [sections, setSections] = useState<LandingSection[]>(
    previewSections ?? DEFAULT_HOME_SECTIONS,
  );
  const [theme, setTheme] = useState<LandingTheme | null>(previewTheme ?? null);

  useEffect(() => {
    if (previewSections) {
      setSections(previewSections);
      setTheme(previewTheme ?? null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.rpc('get_cms_landing_page', { p_slug: slug });
        const page = data as { sections?: LandingSection[]; theme?: LandingTheme | null } | null;
        if (cancelled || !page) return;
        if (page.sections && Array.isArray(page.sections) && page.sections.length > 0) {
          setSections(page.sections);
        }
        if (page.theme) setTheme(page.theme);
      } catch {
        // fallback به پیش‌فرض
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, previewSections, previewTheme]);

  return (
    <BrandScope theme={theme}>
      {sections
        .filter((s) => s.enabled)
        .map((section) => {
          const def = SECTION_REGISTRY[section.type];
          if (!def) return null;
          const Component = def.Component;
          return <Component key={section.id} props={section.props ?? {}} />;
        })}
    </BrandScope>
  );
};

export default LandingRenderer;
