export const PUBLIC_SITE_NAME = 'تازه سیستم';
export const PUBLIC_SITE_URL = 'https://tazesystem.ir';

export function publicOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${PUBLIC_SITE_URL}/#organization`,
    name: PUBLIC_SITE_NAME,
    alternateName: ['تازه‌سیستم', 'TazeSystem', 'Taze System', 'نرم افزار تازه سیستم', 'سامانه ابری تازه سیستم'],
    url: `${PUBLIC_SITE_URL}/`,
    logo: `${PUBLIC_SITE_URL}/logo.png`,
  };
}

export function publicWebsiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${PUBLIC_SITE_URL}/#website`,
    name: PUBLIC_SITE_NAME,
    alternateName: ['تازه‌سیستم', 'TazeSystem', 'Taze System', 'نرم افزار تازه سیستم'],
    url: `${PUBLIC_SITE_URL}/`,
    inLanguage: 'fa-IR',
    publisher: { '@id': `${PUBLIC_SITE_URL}/#organization` },
  };
}

export function publicWebApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${PUBLIC_SITE_URL}/#webapp`,
    name: PUBLIC_SITE_NAME,
    alternateName: ['تازه‌سیستم', 'TazeSystem', 'Taze System', 'نرم افزار تازه سیستم'],
    url: `${PUBLIC_SITE_URL}/`,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript. Requires HTML5.',
    inLanguage: 'fa-IR',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'IRR',
    },
  };
}
