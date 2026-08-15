import { SUPABASE_URL } from '../../supabaseClient';
import { buildPrintDocumentHtml } from './buildPrintDocumentHtml';
import type { createPrintPerformanceTracker } from './printPerformance';

interface PrintAsPdfOptions {
  pageSize?: string;
  sourceHtml?: string;
  sourceNode?: HTMLElement | null;
  title?: string;
  filename?: string;
  targetWindow?: Window | null;
  openInPdfViewer?: boolean;
  onProgress?: (progress: PdfGenerationProgress) => void;
}

export interface PdfGenerationProgress {
  percent: number;
  label: string;
}

const FUNCTION_PATH = '/functions/v1/render-pdf';
const PREPARED_WINDOW_NAME_PREFIX = 'kalamapp-pdf-target';
const PDF_REQUEST_TIMEOUT_MS = 135_000;

const escapeHtml = (value: string) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const getSourceHtml = ({ sourceHtml, sourceNode }: PrintAsPdfOptions) => {
  if (typeof sourceHtml === 'string') return sourceHtml;
  return sourceNode?.innerHTML || '';
};

export const shouldUseGeneratedPdfPrint = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod/i.test(ua);
};

const ensureTargetWindowName = (targetWindow: Window) => {
  if (!targetWindow.name) {
    targetWindow.name = `${PREPARED_WINDOW_NAME_PREFIX}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return targetWindow.name;
};

const buildFunctionUrl = () => `${String(SUPABASE_URL || '').replace(/\/+$/, '')}${FUNCTION_PATH}`;

const normalizePdfFilename = (filename?: string | null, title?: string | null) => {
  const raw = String(filename || title || 'print.pdf').trim() || 'print.pdf';
  return raw.toLowerCase().endsWith('.pdf') ? raw : `${raw}.pdf`;
};

const writePreparedWindowState = (targetWindow: Window, title?: string) => {
  try {
    const safeTitle = escapeHtml(title || 'چاپ');
    targetWindow.document.open();
    targetWindow.document.write(`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #ffffff;
        color: #0f172a;
        font-family: Peyda, Tahoma, Arial, sans-serif;
        padding: 24px;
        text-align: center;
      }
      .print-pdf-loading {
        display: grid;
        gap: 10px;
        max-width: 420px;
      }
      .print-pdf-loading strong {
        font-size: 16px;
      }
      .print-pdf-loading span {
        color: #475569;
        font-size: 14px;
      }
      .print-pdf-progress-track {
        width: 100%;
        height: 8px;
        border-radius: 999px;
        overflow: hidden;
        background: #e2e8f0;
      }
      .print-pdf-progress-value {
        width: 8%;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #4f46e5, #0ea5e9);
        transition: width .35s ease;
      }
    </style>
  </head>
  <body>
    <div class="print-pdf-loading">
      <strong>در حال آماده‌سازی فایل PDF</strong>
      <span id="print-pdf-progress-label">در حال آماده‌سازی قالب چاپ…</span>
      <div class="print-pdf-progress-track" aria-hidden="true"><div id="print-pdf-progress-value" class="print-pdf-progress-value"></div></div>
      <span>این صفحه را نبندید.</span>
    </div>
  </body>
</html>`);
    targetWindow.document.close();
  } catch (error) {
    console.error('Unable to write prepared PDF window state', error);
  }
};

const updatePreparedWindowProgress = (
  targetWindow: Window | null | undefined,
  progress: PdfGenerationProgress,
) => {
  if (!targetWindow || targetWindow.closed) return;

  try {
    const label = targetWindow.document.getElementById('print-pdf-progress-label');
    const value = targetWindow.document.getElementById('print-pdf-progress-value');
    if (label) label.textContent = progress.label;
    if (value) value.style.width = `${Math.max(0, Math.min(100, Math.round(progress.percent)))}%`;
  } catch (error) {
    console.error('Unable to update generated PDF progress', error);
  }
};

const writeErrorState = (targetWindow: Window | null | undefined, title?: string, error?: unknown) => {
  if (!targetWindow || targetWindow.closed) return;

  try {
    const safeTitle = escapeHtml(title || 'چاپ');
    const detail = String((error as any)?.message || error || '') === 'pdf_generation_timeout'
      ? 'ساخت PDF بیش از زمان مجاز طول کشید. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.'
      : 'لطفاً دوباره تلاش کنید.';
    targetWindow.document.open();
    targetWindow.document.write(`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #ffffff;
        color: #991b1b;
        font-family: Peyda, Tahoma, Arial, sans-serif;
        padding: 24px;
        text-align: center;
      }
      .print-pdf-error {
        display: grid;
        gap: 10px;
        max-width: 420px;
      }
    </style>
  </head>
  <body>
    <div class="print-pdf-error">
      <strong>آماده‌سازی فایل PDF ناموفق بود.</strong>
      <span>${detail}</span>
    </div>
  </body>
</html>`);
    targetWindow.document.close();
  } catch (error) {
    console.error('Unable to write error state to prepared print window', error);
  }
};

const writeSuccessState = ({
  targetWindow,
  title,
  filename,
  pdfUrl,
  showPdfPreview = false,
}: {
  targetWindow: Window | null | undefined;
  title?: string;
  filename: string;
  pdfUrl: string;
  showPdfPreview?: boolean;
}) => {
  if (!targetWindow || targetWindow.closed) return;

  try {
    const safeTitle = escapeHtml(title || 'چاپ');
    const safeFilename = escapeHtml(filename);
    const safePdfUrl = escapeHtml(pdfUrl);
    targetWindow.document.open();
    targetWindow.document.write(`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background: #ffffff;
        color: #0f172a;
        font-family: Peyda, Tahoma, Arial, sans-serif;
        padding: ${showPdfPreview ? '0' : '24px'};
        text-align: center;
      }
      .print-pdf-success {
        display: grid;
        gap: 12px;
        max-width: 420px;
      }
      .print-pdf-success strong {
        font-size: 16px;
      }
      .print-pdf-success span {
        color: #475569;
        font-size: 13px;
        line-height: 1.9;
      }
      .print-pdf-success a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        background: #312e81;
        color: #ffffff;
        font-size: 14px;
        font-weight: 700;
        padding: 10px 16px;
        text-decoration: none;
      }
      .print-pdf-preview-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 14px;
        border-bottom: 1px solid #e2e8f0;
        text-align: right;
      }
      .print-pdf-preview-toolbar strong { font-size: 14px; }
      .print-pdf-preview-toolbar a { white-space: nowrap; }
      .print-pdf-preview-frame { width: 100%; flex: 1 1 auto; min-height: calc(100vh - 58px); border: 0; }
    </style>
  </head>
  <body>
    ${showPdfPreview ? `
      <div class="print-pdf-preview-toolbar">
        <strong>پیش‌نمایش نهایی PDF</strong>
        <a id="pdf-download-link" href="${safePdfUrl}" download="${safeFilename}" rel="noopener">دانلود با نام «${safeFilename}»</a>
      </div>
      <iframe class="print-pdf-preview-frame" src="${safePdfUrl}" title="پیش‌نمایش نهایی PDF"></iframe>
    ` : `
      <div class="print-pdf-success">
        <strong>فایل PDF آماده شد.</strong>
        <span>اگر دانلود یا باز شدن فایل به صورت خودکار شروع نشد، از دکمه زیر استفاده کنید.</span>
        <a id="pdf-download-link" href="${safePdfUrl}" download="${safeFilename}" target="_self" rel="noopener">باز کردن / دانلود PDF</a>
      </div>
      <script>
        window.setTimeout(function () {
          var link = document.getElementById('pdf-download-link');
          if (link) link.click();
        }, 250);
      </script>
    `}
  </body>
</html>`);
    targetWindow.document.close();
  } catch (error) {
    console.error('Unable to write success state to prepared print window', error);
  }
};

const requestPdfBlob = async ({
  documentHtml,
  filename,
  pageSize,
  title,
  onProgress,
}: {
  documentHtml: string;
  filename?: string;
  pageSize?: string;
  title?: string;
  onProgress?: (progress: PdfGenerationProgress) => void;
}) => {
  const formData = new FormData();
  formData.append('documentHtml', documentHtml);
  formData.append('title', title || 'چاپ');
  formData.append('filename', normalizePdfFilename(filename, title));
  formData.append('pageSize', pageSize || 'A4 portrait');

  const controller = new AbortController();
  let progressValue = 45;
  const progressTimer = globalThis.setInterval(() => {
    progressValue = Math.min(90, progressValue + 3);
    onProgress?.({ percent: progressValue, label: 'در حال ساخت PDF روی سرور…' });
  }, 1_500);
  const timeout = globalThis.setTimeout(() => controller.abort(), PDF_REQUEST_TIMEOUT_MS);

  try {
    onProgress?.({ percent: progressValue, label: 'در حال ارسال فایل برای ساخت PDF…' });
    const response = await fetch(buildFunctionUrl(), {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/pdf')) {
      throw new Error(`PDF request failed: ${response.status}`);
    }
    // `fetch` finishes once headers arrive; keep both the timeout and the
    // progress indicator alive until the entire PDF stream has been received.
    return await response.blob();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('pdf_generation_timeout');
    throw error;
  } finally {
    globalThis.clearInterval(progressTimer);
    globalThis.clearTimeout(timeout);
  }
};

export const generatePdfBlob = async (options: {
  pageSize?: string;
  sourceHtml?: string;
  sourceNode?: HTMLElement | null;
  title?: string;
  filename?: string;
  tracker?: ReturnType<typeof createPrintPerformanceTracker>;
  onProgress?: (progress: PdfGenerationProgress) => void;
}) => {
  const sourceHtml = getSourceHtml(options).trim();
  if (!sourceHtml) {
    throw new Error('print_source_missing');
  }

  options.tracker?.addMetadata({
    pageSize: options.pageSize || 'A4 portrait',
    sourceHtmlLength: sourceHtml.length,
  });
  options.onProgress?.({ percent: 15, label: 'در حال آماده‌سازی قالب PDF…' });

  const documentHtml = options.tracker
    ? await options.tracker.step(
        'build_print_document_html',
        () => buildPrintDocumentHtml({
          pageSize: options.pageSize,
          sourceHtml,
          title: options.title,
        }),
        (html) => ({ documentHtmlLength: String(html || '').length })
      )
    : await buildPrintDocumentHtml({
        pageSize: options.pageSize,
        sourceHtml,
        title: options.title,
      });
  options.onProgress?.({ percent: 40, label: 'قالب آماده شد؛ در حال ساخت PDF…' });

  const blob = options.tracker
    ? await options.tracker.step(
        'request_render_pdf',
        () => requestPdfBlob({
          documentHtml,
          filename: options.filename,
          pageSize: options.pageSize,
          title: options.title,
          onProgress: options.onProgress,
        }),
        (result) => ({ blobSize: result.size })
      )
    : await requestPdfBlob({
        documentHtml,
        filename: options.filename,
        pageSize: options.pageSize,
        title: options.title,
        onProgress: options.onProgress,
      });

  options.tracker?.addMetadata({ blobSize: blob.size });
  options.onProgress?.({ percent: 100, label: 'فایل PDF آماده شد.' });
  return blob;
};

export const prepareGeneratedPdfWindow = (title?: string, options?: { force?: boolean }) => {
  if (!options?.force && !shouldUseGeneratedPdfPrint()) return null;

  const targetWindow = window.open('', '_blank');
  if (!targetWindow) return null;

  ensureTargetWindowName(targetWindow);
  writePreparedWindowState(targetWindow, title);
  return targetWindow;
};

export const printAsPdf = async (options: PrintAsPdfOptions) => {
  const sourceHtml = getSourceHtml(options).trim();
  if (!sourceHtml) {
    writeErrorState(options.targetWindow, options.title);
    return;
  }

  try {
    const targetWindow =
      options.targetWindow && !options.targetWindow.closed ? options.targetWindow : null;
    if (targetWindow) ensureTargetWindowName(targetWindow);
    const reportProgress = (progress: PdfGenerationProgress) => {
      updatePreparedWindowProgress(targetWindow, progress);
      options.onProgress?.(progress);
    };
    reportProgress({ percent: 12, label: 'در حال آماده‌سازی قالب PDF…' });

    const pdfBlob = await generatePdfBlob({
      filename: options.filename,
      pageSize: options.pageSize,
      sourceHtml,
      title: options.title,
      onProgress: reportProgress,
    });

    const filename = normalizePdfFilename(options.filename, options.title);

    if (targetWindow) {
      const pdfUrl = URL.createObjectURL(pdfBlob);
      writeSuccessState({
        targetWindow,
        title: options.title,
        filename,
        pdfUrl,
        showPdfPreview: Boolean(options.openInPdfViewer),
      });
      targetWindow.focus();
      return;
    }

    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);

  } catch (error) {
    writeErrorState(options.targetWindow, options.title, error);
    throw error;
  }
};
