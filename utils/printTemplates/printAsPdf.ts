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

const writePreparedWindowState = (targetWindow: Window, title?: string) => {
  try {
    targetWindow.document.open();
    targetWindow.document.write(`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title || 'چاپ'}</title>
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
    targetWindow.document.open();
    targetWindow.document.write(`<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title || 'چاپ'}</title>
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

const appendHiddenField = (form: HTMLFormElement, name: string, value: string) => {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  form.appendChild(input);
};

const submitPdfRequest = ({
  documentHtml,
  filename,
  pageSize,
  targetName,
  title,
}: {
  documentHtml: string;
  filename?: string;
  pageSize?: string;
  targetName: string;
  title?: string;
}) => {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = buildFunctionUrl();
  form.target = targetName;
  form.enctype = 'multipart/form-data';
  form.acceptCharset = 'utf-8';
  form.style.display = 'none';

  appendHiddenField(form, 'documentHtml', documentHtml);
  appendHiddenField(form, 'title', title || 'چاپ');
  appendHiddenField(form, 'filename', filename || 'print.pdf');
  appendHiddenField(form, 'pageSize', pageSize || 'A4 portrait');

  document.body.appendChild(form);
  form.submit();
  form.remove();
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
    const documentHtml = await buildPrintDocumentHtml({
      pageSize: options.pageSize,
      sourceHtml,
      title: options.title,
    });

    const targetWindow =
      options.targetWindow && !options.targetWindow.closed ? options.targetWindow : null;
    const targetName = targetWindow ? ensureTargetWindowName(targetWindow) : '_self';

    submitPdfRequest({
      documentHtml,
      filename: options.filename,
      pageSize: options.pageSize,
      targetName,
      title: options.title,
    });

    targetWindow?.focus();
  } catch (error) {
    writeErrorState(options.targetWindow, options.title);
    throw error;
  }
};
