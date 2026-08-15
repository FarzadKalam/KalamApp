import { buildTree, type RoleNode } from './orgChartHelpers';
import { printInIframe } from '../../utils/printTemplates/printInIframe';
import { prepareGeneratedPdfWindow, printAsPdf, shouldUseGeneratedPdfPrint } from '../../utils/printTemplates/printAsPdf';

const NODE_W = 148;
const CONN_H = 18;
const GAP = 20;

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const VLINE = `<div style="width:2px;height:${CONN_H}px;background:#818cf8;margin:0 auto;flex-shrink:0;"></div>`;

function renderNode(node: RoleNode): string {
  const multi = node.children.length > 1;
  const hbar = multi
    ? `<div style="position:absolute;top:0;left:${NODE_W / 2}px;right:${NODE_W / 2}px;height:2px;background:#818cf8;"></div>`
    : '';

  const childrenHtml = node.children.length > 0
    ? `${VLINE}
       <div style="display:flex;flex-direction:row;gap:${GAP}px;position:relative;">
         ${hbar}
         ${node.children.map((child) =>
           `<div style="display:flex;flex-direction:column;align-items:center;">
              ${multi ? VLINE : ''}
              ${renderNode(child)}
            </div>`
         ).join('')}
       </div>`
    : '';

  return `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="
        width:${NODE_W}px;
        min-width:${NODE_W}px;
        border:1.5px solid #818cf8;
        border-radius:8px;
        padding:8px 10px;
        background:#eef2ff;
        text-align:center;
        font-size:11px;
        font-weight:bold;
        color:#1e1b4b;
        break-inside:avoid;
        page-break-inside:avoid;
        box-sizing:border-box;
        line-height:1.5;
      ">
        ${esc(node.title)}
        ${node.is_system ? '<br><span style="font-size:9px;color:#6b7280;font-weight:normal;">سیستمی</span>' : ''}
      </div>
      ${childrenHtml}
    </div>`;
}

export async function printOrgChart(
  flatRoles: any[],
  orgName?: string
): Promise<void> {
  const tree = buildTree(flatRoles);
  if (!tree.length) return;

  const today = new Date().toLocaleDateString('fa-IR');

  const treeHtml = tree
    .map((node) => `<div style="margin:0 ${GAP / 2}px;">${renderNode(node)}</div>`)
    .join('');

  const sourceHtml = `
    <div style="
      direction:rtl;
      font-family:'Peyda',Tahoma,Arial,sans-serif;
      padding:16px 20px;
      background:#fff;
      min-width:max-content;
    ">
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        margin-bottom:16px;
        padding-bottom:10px;
        border-bottom:2px solid #818cf8;
      ">
        <h2 style="margin:0;font-size:15px;color:#1e1b4b;font-weight:bold;">
          ${orgName ? esc(orgName) + ' — ' : ''}چارت سازمانی
        </h2>
        <span style="font-size:10px;color:#6b7280;">${today}</span>
      </div>
      <div style="
        display:flex;
        flex-direction:row;
        justify-content:center;
        flex-wrap:nowrap;
        gap:${GAP}px;
        overflow:visible;
      ">
        ${treeHtml}
      </div>
    </div>
  `;

  if (shouldUseGeneratedPdfPrint()) {
    const title = 'چارت سازمانی';
    await printAsPdf({
      sourceHtml,
      pageSize: 'A4 landscape',
      title,
      filename: 'org-chart.pdf',
      targetWindow: prepareGeneratedPdfWindow(title, { force: true }),
      openInPdfViewer: true,
    });
  } else {
    await printInIframe({
      sourceHtml,
      pageSize: 'A4 landscape',
      title: 'چارت سازمانی',
    });
  }
}
