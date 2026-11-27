export interface PublicStaticSeoPage {
  path: string;
  file: string;
  title: string;
  description: string;
  heading: string;
  body: string;
  image?: string;
}

export interface StaticPublicSeoProps {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  ogType: 'website' | 'article';
}

export const PUBLIC_STATIC_SEO_PAGES: PublicStaticSeoPage[];
export function getStaticPublicPageSeo(pathname: string): StaticPublicSeoProps;
export function escapeHtml(value: unknown): string;
export function sanitizeCmsHtml(raw: unknown): string;
export function renderContentBlock(block: unknown): string;
