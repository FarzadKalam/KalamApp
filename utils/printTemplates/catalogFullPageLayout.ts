/**
 * catalogFullPageLayout.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable full-page catalog layout (A4 Landscape 297×210mm, margins=0).
 * Must NEVER overflow to a second page — uses height:210mm + overflow:hidden.
 *
 * Layout:
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │ RIGHT PANEL (62mm)  │  LEFT: Full-bleed image                    │
 *  │  ─ Logo + Name      │    ─ Diagonal watermarks (z:3, above grad) │
 *  │  ─ Phone / Slogan   │    ─ Gradient overlay (bottom-heavy, z:2)  │
 *  │  ─ Date badge       │    ─ Primary title (large, white, z:5)     │
 *  │  ─ QR section       │    ─ Code fields below title               │
 *  │  ─ Map section      │                                            │
 *  │  ─ Detail fields    │                                            │
 *  │  ─ Contact footer   │                                            │
 *  ├─────────────────────┴────────────────────────────────────────────┤
 *  │ FOOTER BAR (~10mm) — address · email · website                   │
 *  └──────────────────────────────────────────────────────────────────┘
 */

export interface CatalogFullPageLayoutOptions {
  /** Full URL of the main image, or {{system.record_image_url}} */
  imageUrl: string;
  /** Primary title (address / name / …), or a token */
  primaryTitle: string;
  /** Code fields line shown below title on image, or {{system.catalog_code_fields}} */
  codeFieldsHtml: string;
  /** Semi-transparent diagonal watermark text (company English/trade name) */
  watermarkText: string;
  /** Key-value field rows for the right panel, or {{system.compact_fields_sidebar}} */
  sidebarFieldsHtml: string;
  /** Company logo URL or {{company.logo_url}} */
  logoUrl: string;
  /** Company full name or {{company.company_full_name}} */
  companyName: string;
  /** Company slogan or {{company.slogan}} */
  slogan: string;
  /** Company phone or {{company.phone}} */
  phone: string;
  /** Company email or {{company.email}} */
  email: string;
  /** Company website or {{company.website}} */
  website: string;
  /** Company address or {{company.address}} */
  companyAddress: string;
  /** Today's date (Jalali) or {{system.today_date}} */
  todayDate: string;
  /**
   * Complete QR section HTML (wrapper + QR image + clickable link),
   * or a token like {{system.catalog_qr_section}}, or '' to hide.
   */
  qrSectionHtml: string;
  /**
   * Complete map section HTML (wrapper + image + location text),
   * or a token like {{system.catalog_map_section}}, or '' to hide.
   */
  mapSectionHtml: string;
  /** page-break-before:always for all but first page */
  isFirstPage?: boolean;
}

export const buildCatalogFullPageLayout = (opts: CatalogFullPageLayoutOptions): string => {
  const {
    imageUrl,
    primaryTitle,
    codeFieldsHtml,
    watermarkText,
    sidebarFieldsHtml,
    logoUrl,
    companyName,
    slogan,
    phone,
    email,
    website,
    companyAddress,
    todayDate,
    qrSectionHtml,
    mapSectionHtml,
    isFirstPage = true,
  } = opts;

  const pageBreak = isFirstPage ? '' : 'page-break-before:always;';

  // ── Watermarks: diagonal company name (z:2 — above image:1, below gradient:3) ─
  // DOM order + explicit z-index both used for reliable print rendering
const watermarkLayer = watermarkText ? `
<div style="position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:2;">
  <div style="position:absolute; top:9%; left:-2%; width:46%; transform:rotate(-28deg); transform-origin:center; color:rgba(255,255,255,0.08); font-size:20px; font-weight:900; letter-spacing:7px; white-space:nowrap; text-align:center; text-transform:uppercase; direction:ltr;">${watermarkText}</div>
  <div style="position:absolute; top:9%; right:-4%; width:46%; transform:rotate(-28deg); transform-origin:center; color:rgba(255,255,255,0.08); font-size:20px; font-weight:900; letter-spacing:7px; white-space:nowrap; text-align:center; text-transform:uppercase; direction:ltr;">${watermarkText}</div>
  <div style="position:absolute; top:38%; left:-2%; width:46%; transform:rotate(-28deg); transform-origin:center; color:rgba(255,255,255,0.095); font-size:24px; font-weight:900; letter-spacing:8px; white-space:nowrap; text-align:center; text-transform:uppercase; direction:ltr;">${watermarkText}</div>
  <div style="position:absolute; top:38%; right:-4%; width:46%; transform:rotate(-28deg); transform-origin:center; color:rgba(255,255,255,0.095); font-size:24px; font-weight:900; letter-spacing:8px; white-space:nowrap; text-align:center; text-transform:uppercase; direction:ltr;">${watermarkText}</div>
  <div style="position:absolute; top:67%; left:-2%; width:46%; transform:rotate(-28deg); transform-origin:center; color:rgba(255,255,255,0.08); font-size:20px; font-weight:900; letter-spacing:7px; white-space:nowrap; text-align:center; text-transform:uppercase; direction:ltr;">${watermarkText}</div>
  <div style="position:absolute; top:67%; right:-4%; width:46%; transform:rotate(-28deg); transform-origin:center; color:rgba(255,255,255,0.08); font-size:20px; font-weight:900; letter-spacing:7px; white-space:nowrap; text-align:center; text-transform:uppercase; direction:ltr;">${watermarkText}</div>
</div>` : '';

  // ── Background image (full-cover via background-image for reliable print rendering) ─
  const bgLayer = imageUrl
    ? `<div style="position:absolute; inset:0; background-image:url('${imageUrl}'); background-size:cover; background-position:center center; z-index:1;"></div>`
    : `<div style="position:absolute; inset:0; background:linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); z-index:1;"></div>`;

  // ── Code fields below title ────────────────────────────────────────────────
  const codeSection = codeFieldsHtml
    ? `<div style="color:rgba(255,255,255,0.72); font-size:9px; letter-spacing:0.2px; margin-top:2.5mm; direction:rtl; text-align:right; line-height:1.8;">${codeFieldsHtml}</div>`
    : '';

  // ── Right panel: company header (gradient dark brand) ─────────────────────
  const logoEl = logoUrl
    ? `<div style="width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,0.15); overflow:hidden; flex-shrink:0; display:flex; align-items:center; justify-content:center; border:2.5px solid rgba(255,255,255,0.45); box-shadow:0 2px 12px rgba(0,0,0,0.25);"><img src="${logoUrl}" alt="لوگو" style="width:42px; height:42px; object-fit:contain;" /></div>`
    : `<div style="width:48px; height:48px; border-radius:50%; background:rgba(255,255,255,0.12); flex-shrink:0; border:2px solid rgba(255,255,255,0.3); display:flex; align-items:center; justify-content:center; font-size:20px; color:rgba(255,255,255,0.6);">🏢</div>`;

  const companyHeader = `
<div style="background:linear-gradient(160deg, rgb(var(--brand-800-rgb,30,58,138)) 0%, rgb(var(--brand-600-rgb,37,99,235)) 100%); padding:4.5mm 4mm 4mm; flex-shrink:0; position:relative; overflow:hidden;">
  <!-- Decorative circles -->
  <div style="position:absolute; top:-12px; left:-12px; width:70px; height:70px; border-radius:50%; background:rgba(255,255,255,0.05);"></div>
  <div style="position:absolute; bottom:-20px; right:-10px; width:90px; height:90px; border-radius:50%; background:rgba(255,255,255,0.04);"></div>
  <!-- Logo + name row -->
  <div style="display:flex; align-items:center; gap:3mm; position:relative; z-index:1;">
    ${logoEl}
    <div style="min-width:0; flex:1; overflow:hidden;">
      <div style="font-size:12px; font-weight:900; color:#fff; line-height:1.35; overflow-wrap:anywhere;">${companyName}</div>
      ${phone ? `<div style="font-size:8.5px; color:rgba(255,255,255,0.82); margin-top:1.5mm; direction:ltr; letter-spacing:0.3px;">${phone}</div>` : ''}
    </div>
  </div>
  <!-- Slogan -->
  ${slogan ? `<div style="margin-top:2.5mm; font-size:7px; color:rgba(255,255,255,0.68); font-style:italic; line-height:1.5; border-top:1px solid rgba(255,255,255,0.15); padding-top:2mm; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; position:relative; z-index:1;">${slogan}</div>` : ''}
  <!-- Date badge -->
  ${todayDate ? `<div style="margin-top:2mm; display:inline-block; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.2); border-radius:5px; padding:1.5px 6px; font-size:6.5px; color:rgba(255,255,255,0.72); direction:ltr; position:relative; z-index:1;">${todayDate}</div>` : ''}
</div>`;

  // ── Right panel: detail fields (alternating rows, accent left border) ──────
  const fieldsBlock = sidebarFieldsHtml
    ? `<div style="flex:1; overflow:hidden; padding:2.5mm 3.5mm 1.5mm; background:#f8fafc;">${sidebarFieldsHtml}</div>`
    : `<div style="flex:1; background:#f8fafc;"></div>`;

  // ── QR + Map: side by side square boxes in right panel ────────────────────
  const qrMapBlock = (qrSectionHtml || mapSectionHtml) ? `
<div style="display:flex; flex-direction:row; flex-shrink:0; height:28mm; background:#f1f5f9; border-bottom:1px solid #e2e8f0; overflow:hidden;">
  ${qrSectionHtml ? `<div style="flex:1; min-width:0; overflow:hidden; ${mapSectionHtml ? 'border-left:1px solid #e2e8f0;' : ''}">${qrSectionHtml}</div>` : ''}
  ${mapSectionHtml ? `<div style="flex:1; min-width:0; overflow:hidden;">${mapSectionHtml}</div>` : ''}
</div>` : '';

  // ── Footer bar (always shows all contact info) ─────────────────────────────
  const footerItems = [
    companyAddress ? `<span style="flex:2; color:rgba(255,255,255,0.65); font-size:7.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;">📍 ${companyAddress}</span>` : '',
    phone ? `<span style="color:rgba(255,255,255,0.72); font-size:7.5px; flex-shrink:0; direction:ltr; white-space:nowrap; padding:0 4px;">📞 ${phone}</span>` : '',
    email ? `<span style="color:rgba(255,255,255,0.55); font-size:7.5px; flex-shrink:0; direction:ltr; white-space:nowrap; padding:0 4px;">✉ ${email}</span>` : '',
    website ? `<span style="color:rgba(255,255,255,0.7); font-size:7.5px; flex-shrink:0; direction:ltr; white-space:nowrap; padding:0 4px;">🌐 ${website}</span>` : '',
  ].filter(Boolean).join('<span style="color:rgba(255,255,255,0.2); font-size:9px; padding:0 2px;">|</span>');

  return `<div style="direction:rtl; width:100%; height:210mm; max-height:210mm; display:flex; flex-direction:column; overflow:hidden; ${pageBreak} page-break-inside:avoid !important; break-inside:avoid !important; box-sizing:border-box; font-family:inherit; background:#0f172a;">

  <!-- ── Main row ──────────────────────────────────────────────────── -->
  <div style="flex:1; display:flex; flex-direction:row; min-height:0; overflow:hidden;">

    <!-- RIGHT: side panel -->
    <div style="width:62mm; flex-shrink:0; background:#f8fafc; display:flex; flex-direction:column; overflow:hidden; border-left:3px solid rgb(var(--brand-500-rgb,59,130,246));">
      ${companyHeader}
      ${fieldsBlock}
      ${qrMapBlock}
    </div>

    <!-- LEFT: image area (full-bleed, no gap) -->
    <div style="flex:1; position:relative; overflow:hidden; min-width:0;">
      <!-- 1. Full-cover background image (z:1, lowest) -->
      ${bgLayer}
      <!-- 2. Watermarks (z:2) — above image, below gradient -->
      ${watermarkLayer}
      <!-- 3. Gradient overlay (z:3) — darkens bottom, sits above watermarks in dark zone -->
      <div style="position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0) 72%); z-index:3;"></div>
      <!-- 4. Title + code fields — anchored to bottom (z:5) -->
      <div style="position:absolute; left:0; right:0; bottom:0; padding:5mm 6mm 6mm; z-index:5;">
        <div style="color:#fff; font-size:24px; font-weight:900; line-height:1.3; text-shadow:0 3px 20px rgba(0,0,0,0.95); overflow-wrap:anywhere;">${primaryTitle}</div>
        ${codeSection}
      </div>
    </div>

  </div>

  <!-- ── Footer bar (never splits to next page) ──────────────────── -->
  <div style="flex-shrink:0; background:rgba(0,0,0,0.93); border-top:2.5px solid rgb(var(--brand-500-rgb,59,130,246)); padding:2.5mm 6mm 3mm; display:flex; align-items:center; gap:8px; direction:rtl; overflow:hidden; height:9mm; max-height:9mm; page-break-before:avoid !important; break-before:avoid !important; page-break-inside:avoid !important; break-inside:avoid !important;">
    ${footerItems}
  </div>

</div>`.trim();
};
