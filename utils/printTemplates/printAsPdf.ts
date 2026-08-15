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

/** A final PDF that can be previewed, printed or attached without rebuilding it. */
export interface GeneratedPrintPdf {
  blob: Blob;
  filename?: string;
  title?: string;
}

const FUNCTION_PATH = '/functions/v1/render-pdf';
const PREPARED_WINDOW_NAME_PREFIX = 'kalamapp-pdf-target';
const PDF_REQUEST_TIMEOUT_MS = 135_000;
const PRINT_PREREQUISITE_TIMEOUT_MS = 15_000;

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
  // The browser print engines are not layout-compatible across desktop and
  // mobile. All template-printing entry points therefore use the same
  // server-rendered PDF, which makes the output independent of device and
  // browser.
  return typeof window !== 'undefined';
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
        min-height: 100dvh;
        display: grid;
        place-items: center;
        background: #ffffff;
        color: #0f172a;
        font-family: Peyda, Tahoma, Arial, sans-serif;
        padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
        box-sizing: border-box;
        text-align: center;
      }
      .print-pdf-loading {
        display: grid;
        gap: 10px;
        width: min(100%, 440px);
        padding: 22px;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        box-sizing: border-box;
        box-shadow: 0 12px 32px rgba(15,23,42,.08);
      }
      .print-pdf-loading strong {
        font-size: clamp(17px, 5vw, 21px);
      }
      .print-pdf-loading span {
        color: #475569;
        font-size: clamp(13px, 3.8vw, 15px);
        line-height: 1.85;
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
      @media (max-width: 480px) {
        .print-pdf-loading { padding: 20px 16px; border-radius: 16px; }
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
    const errorCode = String((error as any)?.message || error || '');
    const detail = errorCode === 'pdf_generation_timeout'
      ? 'ساخت PDF بیش از زمان مجاز طول کشید. لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.'
      : errorCode === 'print_prerequisite_timeout'
        ? 'اطلاعات لازم برای چاپ به‌موقع دریافت نشد. لطفاً اتصال اینترنت را بررسی و دوباره تلاش کنید.'
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
        min-height: 100dvh;
        display: grid;
        place-items: center;
        background: #ffffff;
        color: #991b1b;
        font-family: Peyda, Tahoma, Arial, sans-serif;
        padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
        box-sizing: border-box;
        text-align: center;
      }
      .print-pdf-error {
        display: grid;
        gap: 10px;
        width: min(100%, 440px);
        padding: 22px;
        border: 1px solid #fecaca;
        border-radius: 18px;
        box-sizing: border-box;
        line-height: 1.9;
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

/** Makes an already opened mobile/desktop PDF tab leave its loading state. */
export const showPreparedPdfErrorState = (targetWindow: Window | null | undefined, title?: string, error?: unknown) => {
  writeErrorState(targetWindow, title, error);
};

/**
 * A print tab is opened synchronously to avoid mobile popup blocking.  Its
 * prerequisites must never be allowed to keep that tab on the loading screen
 * forever when a network request is stalled.
 */
export const waitForPrintPrerequisite = async <T>(
  task: PromiseLike<T>,
  timeoutMs = PRINT_PREREQUISITE_TIMEOUT_MS,
): Promise<T> => new Promise<T>((resolve, reject) => {
  const timeoutId = globalThis.setTimeout(
    () => reject(new Error('print_prerequisite_timeout')),
    timeoutMs,
  );

  Promise.resolve(task).then(
    (result) => {
      globalThis.clearTimeout(timeoutId);
      resolve(result);
    },
    (error) => {
      globalThis.clearTimeout(timeoutId);
      reject(error);
    },
  );
});

/**
 * Lets React commit data loaded immediately before serialization. The timeout
 * is deliberately retained because opening a PDF tab can background the
 * source page on mobile and pause requestAnimationFrame callbacks.
 */
export const waitForPrintRenderCommit = () => new Promise<void>((resolve) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    resolve();
    return;
  }

  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    window.clearTimeout(fallbackTimeout);
    resolve();
  };
  const fallbackTimeout = window.setTimeout(finish, 320);

  if (document.visibilityState === 'hidden') {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(finish);
  });
});

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
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        background: #ffffff;
        color: #0f172a;
        font-family: Peyda, Tahoma, Arial, sans-serif;
        padding: ${showPdfPreview ? '0' : 'max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))'};
        box-sizing: border-box;
        text-align: center;
      }
      .print-pdf-success {
        display: grid;
        gap: 12px;
        width: min(100%, 440px);
        padding: 22px;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        box-sizing: border-box;
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
      @media (max-width: 480px) {
        .print-pdf-preview-toolbar { align-items: stretch; flex-direction: column; padding: 12px 16px; }
        .print-pdf-preview-toolbar a { width: 100%; box-sizing: border-box; }
        .print-pdf-preview-frame { min-height: calc(100dvh - 114px); }
        .print-pdf-success { padding: 20px 16px; }
      }
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

/**
 * Delivers an already rendered PDF to the prepared print tab. Keeping this
 * separate from generation ensures preview, print and download can share one
 * byte-identical Blob.
 */
export const presentGeneratedPdf = ({
  pdf,
  targetWindow: candidateWindow,
  openInPdfViewer = true,
}: {
  pdf: GeneratedPrintPdf;
  targetWindow?: Window | null;
  openInPdfViewer?: boolean;
}) => {
  const title = pdf.title || 'چاپ';
  const filename = normalizePdfFilename(pdf.filename, title);
  const targetWindow = candidateWindow && !candidateWindow.closed ? candidateWindow : null;

  if (targetWindow) {
    ensureTargetWindowName(targetWindow);
    const pdfUrl = URL.createObjectURL(pdf.blob);
    writeSuccessState({
      targetWindow,
      title,
      filename,
      pdfUrl,
      showPdfPreview: openInPdfViewer,
    });
    targetWindow.focus();
    return;
  }

  const pdfUrl = URL.createObjectURL(pdf.blob);
  const link = document.createElement('a');
  link.href = pdfUrl;
  link.download = filename;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
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

    presentGeneratedPdf({
      pdf: {
        blob: pdfBlob,
        filename: options.filename,
        title: options.title,
      },
      targetWindow,
      openInPdfViewer: Boolean(options.openInPdfViewer),
    });

  } catch (error) {
    writeErrorState(options.targetWindow, options.title, error);
    throw error;
  }
};
