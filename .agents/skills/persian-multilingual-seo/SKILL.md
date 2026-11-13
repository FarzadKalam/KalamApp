---
name: persian-multilingual-seo
description: Enforces Persian (Farsi) typography, RTL semantic standards, ZWNJ normalization, Persian slug handling, and hreflang multilingual configurations.
---

# Persian & Multilingual SEO Skill

## Purpose
Ensure content, typography, character encoding, and keyword structure follow Persian search behavior and web performance standards.

## Principles & Rules

### 1. Document Language & Direction
- Ensure `index.html` has `<html lang="fa" dir="rtl">`.
- For multilingual sites, dynamically set `document.documentElement.lang` and `dir` on locale change.

### 2. Persian Text Normalization & ZWNJ (نیم‌فاصله)
- Standardize Persian characters:
  - Replace Arabic 'ي' (\u064A) with Persian 'ی' (\u06CC).
  - Replace Arabic 'ك' (\u0643) with Persian 'ک' (\u06A9).
- Use Zero-Width Non-Joiner (ZWNJ: `\u200c` / `&zwnj;`) correctly:
  - Prefixes: `می‌شود` (نه `میشود` و نه `می شود`).
  - Suffixes: `کتاب‌ها` (نه `کتابها` و نه `کتاب ها`), `خانه‌ام`.
- For primary brand & search keywords:
  - Google indexes both forms, but titles, schemas, and headings must include standard forms and alternate forms in metadata.

### 3. Font Optimization & Cumulative Layout Shift (CLS)
- Preload the primary Persian font file (`.woff2`) in `<head>`:
  `<link rel="preload" href="/fonts/vazirmatn.woff2" as="font" type="font/woff2" crossorigin>`
- In CSS `@font-face`, always declare `font-display: swap;` to prevent FOIT (Flash of Invisible Text) and reduce LCP.

### 4. Slugs & Canonical URLs
- When using Persian characters in URLs:
  - Ensure canonical tags match the exact decoded/encoded format consistently.
  - Sitemaps must list canonical URLs with clean encoding.
