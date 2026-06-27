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
  <table style="width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; direction:rtl; color:#111827; font-size:12px; border:1px solid rgba(148,163,184,0.28); border-radius:18px; overflow:hidden;">
    <tbody>
      <tr>
        <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:10px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
          <div style="display:flex; align-items:flex-start; gap:8px;">
            ${company.logoUrl ? `<img src="${escapeHtml(company.logoUrl)}" alt="لوگو" style="display:block; width:48px; height:48px; max-width:48px; max-height:48px; object-fit:contain;" />` : ''}
            <div style="min-width:0;">
              <div style="font-weight:700; font-size:13px; line-height:1.8; overflow-wrap:anywhere;">${escapeHtml(company.companyName || 'سازمان')}</div>
              ${company.tradeName ? `<div style="font-size:11px; color:#6b7280; line-height:1.8; overflow-wrap:anywhere;">${escapeHtml(company.tradeName)}</div>` : ''}
            </div>
          </div>
        </td>
        <td style="width:32%; vertical-align:middle; text-align:center; border:none; padding:10px 8px; background:rgba(var(--brand-500-rgb),0.08); overflow-wrap:anywhere;">
          <div style="font-weight:800; font-size:17px; line-height:1.8; color:rgb(var(--brand-500-rgb));">${escapeHtml(title)}</div>
        </td>
        <td style="width:34%; vertical-align:top; text-align:right; border:none; padding:10px; background:rgba(var(--brand-50-rgb),0.42); overflow-wrap:anywhere;">
          <div style="display:flex; flex-direction:column; gap:4px; font-size:12px; line-height:1.8;">
            <div>زمان چاپ: ${escapeHtml(printDateLabel)}</div>
            ${company.phone ? `<div>تلفن: ${escapeHtml(company.phone)}</div>` : ''}
            ${company.website ? `<div style="direction:ltr; text-align:left;">${escapeHtml(company.website)}</div>` : ''}
          </div>
        </td>
      </tr>
    </tbody>
  </table>
`.trim();

const renderBmcList = (items: string[]) => {
  if (!items.length) return '<div style="color:#94a3b8;">تکمیل نشده</div>';
  return `
    <ul style="margin:0; padding:0 16px 0 0; list-style:disc; line-height:1.95;">
      ${items.map((item) => `<li style="margin:0 0 4px;">${escapeHtml(item)}</li>`).join('')}
    </ul>
  `.trim();
};

const renderBmcCard = (sectionKey: keyof BusinessModelCanvasSections, minHeightMm: number) => {
  const section = BUSINESS_MODEL_CANVAS_SECTIONS.find((item) => item.key === sectionKey);
  if (!section) return '';
  return `
    <div style="height:${minHeightMm}mm; box-sizing:border-box; border:1px solid #94a3b8; padding:4mm 3.5mm; display:flex; flex-direction:column; overflow:hidden;">
      <div style="font-weight:800; font-size:12.5px; margin-bottom:2mm;">${escapeHtml(section.title)}</div>
      <div style="font-size:10.5px; color:#111827; overflow:hidden;">__CONTENT__</div>
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
  const partners = renderBmcCard('key_partners', 126).replace('__CONTENT__', renderBmcList(args.sections.key_partners));
  const activities = renderBmcCard('key_activities', 61).replace('__CONTENT__', renderBmcList(args.sections.key_activities));
  const resources = renderBmcCard('key_resources', 61).replace('__CONTENT__', renderBmcList(args.sections.key_resources));
  const value = renderBmcCard('value_propositions', 126).replace('__CONTENT__', renderBmcList(args.sections.value_propositions));
  const relations = renderBmcCard('customer_relationships', 61).replace('__CONTENT__', renderBmcList(args.sections.customer_relationships));
  const channels = renderBmcCard('channels', 61).replace('__CONTENT__', renderBmcList(args.sections.channels));
  const segments = renderBmcCard('customer_segments', 126).replace('__CONTENT__', renderBmcList(args.sections.customer_segments));
  const costs = renderBmcCard('cost_structure', 42).replace('__CONTENT__', renderBmcList(args.sections.cost_structure));
  const revenues = renderBmcCard('revenue_streams', 42).replace('__CONTENT__', renderBmcList(args.sections.revenue_streams));

  return `
    <div class="invoice-custom-print-shell" dir="rtl">
      <div class="print-template-page" style="width:297mm; min-height:210mm; box-sizing:border-box; padding:9mm; background:#fff; color:#111827; direction:rtl;">
        ${renderHeaderHtml(args.company, BUSINESS_MODEL_CANVAS_TITLE, printDateLabel)}
        <div style="margin-top:6mm;">
          <table style="width:100%; border-collapse:collapse; table-layout:fixed;">
            <tbody>
              <tr>
                <td style="width:19%; vertical-align:top; padding:0;">${partners}</td>
                <td style="width:21%; vertical-align:top; padding:0 0 0 0;">
                  <div style="display:grid; grid-template-rows:1fr 1fr; gap:0;">
                    ${activities}
                    ${resources}
                  </div>
                </td>
                <td style="width:21%; vertical-align:top; padding:0;">${value}</td>
                <td style="width:20.5%; vertical-align:top; padding:0;">
                  <div style="display:grid; grid-template-rows:1fr 1fr; gap:0;">
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
    });
    return;
  }

  await printInIframe({
    pageSize: args.pageSize,
    sourceHtml: args.sourceHtml,
    title: args.title,
  });
};
