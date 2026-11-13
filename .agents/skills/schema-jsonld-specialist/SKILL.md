---
name: schema-jsonld-specialist
description: Generates, validates, and injects Schema.org JSON-LD structured data for Google Rich Results (Organization, WebSite, WebApplication, BreadcrumbList, FAQPage).
---

# Schema.org JSON-LD Specialist Skill

## Purpose
Produce clean, standards-compliant JSON-LD markup to achieve Google Rich Results, Knowledge Graph recognition, Sitelinks, and clear brand identity.

## Guidelines & Templates

### 1. WebSite & Organization (Sitewide)
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://tazesystem.ir/#organization",
      "name": "تازه سیستم",
      "alternateName": ["تازه‌سیستم", "TazeSystem", "Taze System", "KalamApp"],
      "url": "https://tazesystem.ir/",
      "logo": "https://tazesystem.ir/logo.png"
    },
    {
      "@type": "WebSite",
      "@id": "https://tazesystem.ir/#website",
      "url": "https://tazesystem.ir/",
      "name": "تازه سیستم",
      "alternateName": ["تازه‌سیستم", "TazeSystem", "Taze System"],
      "publisher": { "@id": "https://tazesystem.ir/#organization" },
      "inLanguage": "fa-IR"
    }
  ]
}
```

### 2. SoftwareApplication / WebApplication (For SaaS / PWA)
```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "تازه سیستم",
  "alternateName": "TazeSystem CRM & ERP",
  "operatingSystem": "All",
  "applicationCategory": "BusinessApplication",
  "url": "https://tazesystem.ir/",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "IRR"
  }
}
```

### 3. BreadcrumbList
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "خانه",
      "item": "https://tazesystem.ir/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "امکانات",
      "item": "https://tazesystem.ir/features"
    }
  ]
}
```

### 4. Validation Rules
- Inject via `<script type="application/ld+json">` directly in pre-rendered static HTML or through head management.
- Ensure all mandatory properties required by Google Search Central are present.
- Never output malformed JSON or unescaped unicode characters.
