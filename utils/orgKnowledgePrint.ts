import type { SupabaseClient } from '@supabase/supabase-js';
import { loadScopedCompanySettings } from './companySettings';
import { safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';
import { printAsPdf, prepareGeneratedPdfWindow, shouldUseGeneratedPdfPrint } from './printTemplates/printAsPdf';
import { printInIframe } from './printTemplates/printInIframe';
import {
  BUSINESS_MODEL_CANVAS_SECTIONS,
  BUSINESS_MODEL_CANVAS_TITLE,
  type BusinessModelCanvasSections,
} from './businessModelCanvas';

type KnowledgePrintCompanyInfo = {
  companyName: string;
  tradeName: string;
  logoUrl: string;
  phone: string;
  website: string;
};

const escapeHtml = (value: string) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const sanitizePrintFilename = (value: string) => {
  const normalized = String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'سند دانش سازمان';
};

const buildPrintDateLabel = () => {
  const now = new Date().toISOString();
  const formatted = safeJalaliFormat(now, 'YYYY/MM/DD HH:mm') || '';
  return formatted ? toPersianNumber(formatted) : toPersianNumber(now);
};

const renderHeaderHtml = (company: KnowledgePrintCompanyInfo, title: string, printDateLabel: string) => `
  <table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:10px; border:1px solid rgba(148,163,184,0.28); border-radius:12px; overflow:hidden;">
    <tbody>
      <tr>
        <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:5px 7px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
          <div style="display:flex; align-items:flex-start; gap:8px;">
            ${company.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" alt="لوگو" style="display:block; width:34px; height:34px; max-width:34px; max-height:34px; object-fit:contain;" />` : ''}
            <div style="min-width:0;">
              <div style="font-weight:700; font-size:11px; line-height:1.55; overflow-wrap:anywhere;">${escapeHtml(company.companyName || 'سازمان')}</div>
              ${company.tradeName ? `<div style="font-size:9px; color:#6b7280; line-height:1.55; overflow-wrap:anywhere;">${escapeHtml(company.tradeName)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="width:32%; vertical-align:middle; text-align:center; border:none; padding:5px 8px; background:rgba(var(--brand-500-rgb),0.08); overflow-wrap:anywhere;">
          <div style="font-weight:800; font-size:14px; line-height:1.55; color:rgb(var(--brand-500-rgb));">${escapeHtml(title)}</div>
        </td>
        <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:5px 7px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
          <div style="display:flex; flex-direction:column; gap:2px; font-size:9px; line-height:1.55;">
            <div>زمان چاپ: ${escapeHtml(printDateLabel)}</div>
            ${company.phone ? `<div>تلفن: ${escapeHtml(company.phone)}</div>` : ''}
            ${company.website ? `<div style="direction:ltr; text-align:left;">${escapeHtml(company.website)}</div>` : ''}
          </div>
        </td>
      </tr>
    </tbody>
  </table>
`.trim();

const estimateBmcCardHeightMm = (items: string[], widthMm: number) => {
  const normalizedItems = items.map((item) => String(item || '').trim()).filter(Boolean);
  const charsPerLine = Math.max(18, Math.floor(widthMm * 1.45));
  const lineCount = normalizedItems.reduce((total, item) => (
    total + Math.max(1, Math.ceil(item.length / charsPerLine))
  ), 0);
  const listHeight = normalizedItems.length > 0
    ? lineCount * 4.8 + normalizedItems.length * 0.9
    : 7;
  return Math.max(25, Math.ceil(7 + 6 + listHeight + 7));
};

const renderBmcList = (items: string[]) => {
  if (!items.length) return '<div style="color:#94a3b8;">تکمیل نشده</div>';
  return `
    <ul style="margin:0; padding:0 14px 0 0; list-style:disc; line-height:1.8; overflow:visible; overflow-wrap:anywhere; word-break:break-word;">
      ${items.map((item) => `<li style="margin:0 0 1.2mm; overflow:visible; overflow-wrap:anywhere; word-break:break-word;">${escapeHtml(item)}</li>`).join('')}
    </ul>
  `.trim();
};

const renderBmcCard = (sectionKey: keyof BusinessModelCanvasSections, heightMm: number) => {
  const section = BUSINESS_MODEL_CANVAS_SECTIONS.find((item) => item.key === sectionKey);
  if (!section) return '';
  return `
    <div style="min-height:${heightMm}mm; height:auto; box-sizing:border-box; border:1px solid #94a3b8; padding:3.5mm 3mm; display:flex; flex-direction:column; overflow:visible; overflow-wrap:anywhere; word-break:break-word; break-inside:avoid; page-break-inside:avoid;">
      <div style="font-weight:800; font-size:12.5px; margin-bottom:2mm;">${escapeHtml(section.title)}</div>
      <div style="font-size:10.5px; color:#111827; overflow:visible; overflow-wrap:anywhere; word-break:break-word;">__CONTENT__</div>
    </div>
  `.trim();
};

export const loadKnowledgePrintCompanyInfo = async (supabase: SupabaseClient): Promise<KnowledgePrintCompanyInfo> => {
  const result = await loadScopedCompanySettings(supabase);
  const row = result.data || {};
  return {
    companyName: String(row.company_full_name || row.company_name || 'سازمان').trim(),
    tradeName: String(row.trade_name || '').trim(),
    logoUrl: String(row.logo_url || '').trim(),
    phone: String(row.phone || row.mobile || '').trim(),
    website: String(row.website || '').trim(),
  };
};

export const buildKnowledgeDocumentPrintHtml = (args: {
  title: string;
  bodyHtml: string;
  company: KnowledgePrintCompanyInfo;
}) => {
  const printDateLabel = buildPrintDateLabel();
  return `
    <div class="invoice-custom-print-shell" dir="rtl">
      <div class="print-template-page" style="width:210mm; min-height:297mm; box-sizing:border-box; padding:12mm; background:#fff; color:#111827; direction:rtl;">
        ${renderHeaderHtml(args.company, args.title, printDateLabel)}
        <div style="margin-top:10mm; font-family:inherit; direction:rtl; line-height:1.95; font-size:12px;">
          ${args.bodyHtml}
        </div>
      </div>
    </div>
  `.trim();
};

export const buildBusinessModelCanvasPrintHtml = (args: {
  sections: BusinessModelCanvasSections;
  company: KnowledgePrintCompanyInfo;
}) => {
  const printDateLabel = buildPrintDateLabel();
  // عرض مفید صفحهٔ A4 افقی با حاشیهٔ ۵ میلی‌متری، مبنای تخمین خطوط است.
  // ارتفاع هر کارت از متن خودش می‌آید و دیگر هیچ محتوایی داخل ارتفاع ثابت
  // یا overflow:hidden گم نمی‌شود.
  const widths = { narrow: 47, medium: 53, wide: 55 };
  const cardHeights = {
    key_partners: estimateBmcCardHeightMm(args.sections.key_partners, widths.narrow),
    key_activities: estimateBmcCardHeightMm(args.sections.key_activities, widths.medium),
    key_resources: estimateBmcCardHeightMm(args.sections.key_resources, widths.medium),
    value_propositions: estimateBmcCardHeightMm(args.sections.value_propositions, widths.wide),
    customer_relationships: estimateBmcCardHeightMm(args.sections.customer_relationships, widths.medium),
    channels: estimateBmcCardHeightMm(args.sections.channels, widths.medium),
    customer_segments: estimateBmcCardHeightMm(args.sections.customer_segments, widths.narrow),
    cost_structure: estimateBmcCardHeightMm(args.sections.cost_structure, 150),
    revenue_streams: estimateBmcCardHeightMm(args.sections.revenue_streams, 150),
  };
  const partners = renderBmcCard('key_partners', cardHeights.key_partners).replace('__CONTENT__', renderBmcList(args.sections.key_partners));
  const activities = renderBmcCard('key_activities', cardHeights.key_activities).replace('__CONTENT__', renderBmcList(args.sections.key_activities));
  const resources = renderBmcCard('key_resources', cardHeights.key_resources).replace('__CONTENT__', renderBmcList(args.sections.key_resources));
  const value = renderBmcCard('value_propositions', cardHeights.value_propositions).replace('__CONTENT__', renderBmcList(args.sections.value_propositions));
  const relations = renderBmcCard('customer_relationships', cardHeights.customer_relationships).replace('__CONTENT__', renderBmcList(args.sections.customer_relationships));
  const channels = renderBmcCard('channels', cardHeights.channels).replace('__CONTENT__', renderBmcList(args.sections.channels));
  const segments = renderBmcCard('customer_segments', cardHeights.customer_segments).replace('__CONTENT__', renderBmcList(args.sections.customer_segments));
  const costs = renderBmcCard('cost_structure', cardHeights.cost_structure).replace('__CONTENT__', renderBmcList(args.sections.cost_structure));
  const revenues = renderBmcCard('revenue_streams', cardHeights.revenue_streams).replace('__CONTENT__', renderBmcList(args.sections.revenue_streams));

  return `
    <div class="invoice-custom-print-shell" dir="rtl">
      <div class="print-template-page" style="width:297mm; min-height:210mm; box-sizing:border-box; padding:5mm; background:#fff; color:#111827; direction:rtl;">
        ${renderHeaderHtml(args.company, BUSINESS_MODEL_CANVAS_TITLE, printDateLabel)}
        <div style="margin-top:2.5mm;">
          <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
            <tbody>
              <tr>
                <td style="width:19%; vertical-align:top; padding:0;">${partners}</td>
                <td style="width:21%; vertical-align:top; padding:0 0 0 0;">
                  <div style="display:flex; flex-direction:column; gap:0;">
                    ${activities}
                    ${resources}
                  </div>
                </td>
                <td style="width:21%; vertical-align:top; padding:0;">${value}</td>
                <td style="width:20.5%; vertical-align:top; padding:0;">
                  <div style="display:flex; flex-direction:column; gap:0;">
                    ${relations}
                    ${channels}
                  </div>
                </td>
                <td style="width:18.5%; vertical-align:top; padding:0;">${segments}</td>
              </tr>
              <tr>
                <td colspan="3" style="vertical-align:top; padding:0;">${costs}</td>
                <td colspan="2" style="vertical-align:top; padding:0;">${revenues}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `.trim();
};

export const downloadKnowledgePrintPdf = async (args: {
  title: string;
  filename?: string;
  pageSize: string;
  sourceHtml: string;
}) => {
  await printAsPdf({
    pageSize: args.pageSize,
    sourceHtml: args.sourceHtml,
    title: args.title,
    filename: sanitizePrintFilename(args.filename || args.title),
  });
};

export const printKnowledgeHtml = async (args: {
  title: string;
  pageSize: string;
  sourceHtml: string;
}) => {
  if (shouldUseGeneratedPdfPrint()) {
    const targetWindow = prepareGeneratedPdfWindow(args.title);
    await printAsPdf({
      pageSize: args.pageSize,
      sourceHtml: args.sourceHtml,
      title: args.title,
      filename: sanitizePrintFilename(args.title),
      targetWindow,
      openInPdfViewer: true,
    });
    return;
  }

  await printInIframe({
    pageSize: args.pageSize,
    sourceHtml: args.sourceHtml,
    title: args.title,
  });
};
