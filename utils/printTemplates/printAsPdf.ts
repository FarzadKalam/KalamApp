import { SUPABASE_URL } from '../../supabaseClient';
import { buildPrintDocumentHtml } from './buildPrintDocumentHtml';

interface PrintAsPdfOptions {
  pageSize?: string;
  sourceHtml?: string;
  sourceNode?: HTMLElement | null;
  title?: string;
  filename?: string;
  targetWindow?: Window | null;
}

const FUNCTION_PATH = '/functions/v1/render-pdf';
const PREPARED_WINDOW_NAME_PREFIX = 'kalamapp-pdf-target';

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
        font-family: Vazirmatn, system-ui, sans-serif;
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
    </style>
  </head>
  <body>
    <div class="print-pdf-loading">
      <strong>در حال آماده‌سازی فایل PDF</strong>
      <span>این صفحه را نبندید.</span>
    </div>
  </body>
</html>`);
    targetWindow.document.close();
  } catch (error) {
    console.error('Unable to write prepared PDF window state', error);
  }
};

const writeErrorState = (targetWindow: Window | null | undefined, title?: string) => {
  if (!targetWindow || targetWindow.closed) return;

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
        color: #991b1b;
        font-family: Vazirmatn, system-ui, sans-serif;
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
      <span>لطفاً دوباره تلاش کنید.</span>
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
}: {
  targetWindow: Window | null | undefined;
  title?: string;
  filename: string;
  pdfUrl: string;
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
        display: grid;
        place-items: center;
        background: #ffffff;
        color: #0f172a;
        font-family: Vazirmatn, system-ui, sans-serif;
        padding: 24px;
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
    </style>
  </head>
  <body>
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
}: {
  documentHtml: string;
  filename?: string;
  pageSize?: string;
  title?: string;
}) => {
  const formData = new FormData();
  formData.append('documentHtml', documentHtml);
  formData.append('title', title || 'چاپ');
  formData.append('filename', normalizePdfFilename(filename, title));
  formData.append('pageSize', pageSize || 'A4 portrait');

  const response = await fetch(buildFunctionUrl(), {
    method: 'POST',
    body: formData,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !contentType.includes('application/pdf')) {
    throw new Error(`PDF request failed: ${response.status}`);
  }

  return response.blob();
};

export const generatePdfBlob = async (options: {
  pageSize?: string;
  sourceHtml?: string;
  sourceNode?: HTMLElement | null;
  title?: string;
  filename?: string;
}) => {
  const sourceHtml = getSourceHtml(options).trim();
  if (!sourceHtml) {
    throw new Error('print_source_missing');
  }

  const documentHtml = await buildPrintDocumentHtml({
    pageSize: options.pageSize,
    sourceHtml,
    title: options.title,
  });

  return requestPdfBlob({
    documentHtml,
    filename: options.filename,
    pageSize: options.pageSize,
    title: options.title,
  });
};

export const prepareGeneratedPdfWindow = (title?: string) => {
  if (!shouldUseGeneratedPdfPrint()) return null;

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

    const pdfBlob = await generatePdfBlob({
      filename: options.filename,
      pageSize: options.pageSize,
      sourceHtml,
      title: options.title,
    });

    const filename = normalizePdfFilename(options.filename, options.title);

    if (targetWindow) {
      const pdfUrl = URL.createObjectURL(pdfBlob);
      writeSuccessState({
        targetWindow,
        title: options.title,
        filename,
        pdfUrl,
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
    writeErrorState(options.targetWindow, options.title);
    throw error;
  }
};
