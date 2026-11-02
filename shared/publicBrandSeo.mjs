export const PUBLIC_SITE_NAME = 'تازه سیستم';
export const PUBLIC_SITE_URL = 'https://tazesystem.ir';

export function publicOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${PUBLIC_SITE_URL}/#organization`,
    name: PUBLIC_SITE_NAME,
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
    alternateName: 'Taze System',
    url: `${PUBLIC_SITE_URL}/`,
    inLanguage: 'fa-IR',
    publisher: { '@id': `${PUBLIC_SITE_URL}/#organization` },
  };
}
