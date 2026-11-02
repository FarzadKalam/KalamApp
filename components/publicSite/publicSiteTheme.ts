import { BRAND_PALETTE_PRESETS, buildBrandCssVars } from '../../theme/brandTheme';
import type { LandingTheme } from './BrandScope';

// Public marketing identity is independent of tenant branding. The primary
// (#F82377) is the approved F01 master color.
export const PUBLIC_SITE_THEME: LandingTheme = { paletteKey: 'taze_rose' };
export const PUBLIC_SITE_CSS_VARS = buildBrandCssVars(BRAND_PALETTE_PRESETS.taze_rose.palette);
