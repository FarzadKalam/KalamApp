// @ts-nocheck

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const FUNCTION_BUILD = 'render-pdf-2026-08-15-01';
const DEFAULT_GOTENBERG_URL = 'http://gotenberg:3000';
const GOTENBERG_TIMEOUT_MS = 120000;

const json = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Kalam-Function-Build': FUNCTION_BUILD,
    },
  });

const htmlError = (status: number, title: string, message: string) =>
  new Response(
    `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
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
      <strong>${title}</strong>
      <span>${message}</span>
    </div>
  </body>
</html>`,
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'X-Kalam-Function-Build': FUNCTION_BUILD,
      },
    }
  );

const createTimeoutSignal = (timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout:${timeoutMs}`), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
};

const normalizeFilename = (value: unknown) => {
  const raw = String(value || 'print').trim();
  const sanitized = raw
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'print';

  return /\.pdf$/i.test(sanitized) ? sanitized : `${sanitized}.pdf`;
};

const encodeContentDispositionFilename = (filename: string) =>
  encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

const getSafeGotenbergHeaderFilename = (filename: string) => {
  const safeName = String(filename || 'print')
    .replace(/\.pdf$/i, '')
    .replace(/[^\x20-\x7E]+/g, '-')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return safeName || 'print';
};

const getPayload = async (request: Request) => {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    return (await request.json()) || {};
  }

  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    return {
      documentHtml: String(form.get('documentHtml') || ''),
      title: String(form.get('title') || ''),
      filename: String(form.get('filename') || ''),
      pageSize: String(form.get('pageSize') || ''),
    };
  }

  return {};
};

const extractNativePrintNumber = (documentHtml: string, name: string) => {
  const match = documentHtml.match(new RegExp(`\\bdata-kalamapp-${name}="([^"]+)"`, 'i'));
  const value = Number(match?.[1] || '');
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const extractNativePrintTemplate = (documentHtml: string, id: string) => {
  const match = documentHtml.match(
    new RegExp(`<template\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/template>`, 'i')
  );
  return String(match?.[1] || '').trim();
};

const getNativePrintOptions = (documentHtml: string) => {
  if (!/\\bdata-kalamapp-native-print-flow="true"/i.test(documentHtml)) return null;

  const widthMm = extractNativePrintNumber(documentHtml, 'paper-width-mm');
  const heightMm = extractNativePrintNumber(documentHtml, 'paper-height-mm');
  const marginTopMm = extractNativePrintNumber(documentHtml, 'margin-top-mm');
  const marginRightMm = extractNativePrintNumber(documentHtml, 'margin-right-mm');
  const marginBottomMm = extractNativePrintNumber(documentHtml, 'margin-bottom-mm');
  const marginLeftMm = extractNativePrintNumber(documentHtml, 'margin-left-mm');
  if (
    widthMm == null ||
    heightMm == null ||
    marginTopMm == null ||
    marginRightMm == null ||
    marginBottomMm == null ||
    marginLeftMm == null
  ) {
    return null;
  }

  return {
    widthMm,
    heightMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
    headerHtml: extractNativePrintTemplate(documentHtml, 'kalamapp-gotenberg-header'),
    footerHtml: extractNativePrintTemplate(documentHtml, 'kalamapp-gotenberg-footer'),
  };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'method_not_allowed' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await getPayload(request);
  } catch (error) {
    console.error('render-pdf invalid payload', error);
    return htmlError(400, 'درخواست نامعتبر بود', 'اطلاعات فایل چاپ قابل خواندن نبود.');
  }

  const documentHtml = String(payload?.documentHtml || '').trim();
  const title = String(payload?.title || 'چاپ').trim() || 'چاپ';
  const filename = normalizeFilename(payload?.filename || title);

  if (!documentHtml) {
    return htmlError(400, 'فایل چاپ خالی است', 'محتوای قابل چاپی برای تولید PDF دریافت نشد.');
  }

  const nativePrintOptions = getNativePrintOptions(documentHtml);
  const gotenbergUrl = String(Deno.env.get('GOTENBERG_URL') || DEFAULT_GOTENBERG_URL).trim().replace(/\/+$/, '');
  const traceId = crypto.randomUUID();
  const form = new FormData();
  form.append('files', new File([documentHtml], 'index.html', { type: 'text/html; charset=utf-8' }));
  if (nativePrintOptions) {
    form.append('preferCssPageSize', 'false');
    form.append('paperWidth', `${nativePrintOptions.widthMm}mm`);
    form.append('paperHeight', `${nativePrintOptions.heightMm}mm`);
    form.append('marginTop', `${nativePrintOptions.marginTopMm}mm`);
    form.append('marginRight', `${nativePrintOptions.marginRightMm}mm`);
    form.append('marginBottom', `${nativePrintOptions.marginBottomMm}mm`);
    form.append('marginLeft', `${nativePrintOptions.marginLeftMm}mm`);
    if (nativePrintOptions.headerHtml) {
      form.append('files', new File([nativePrintOptions.headerHtml], 'header.html', { type: 'text/html; charset=utf-8' }));
    }
    if (nativePrintOptions.footerHtml) {
      form.append('files', new File([nativePrintOptions.footerHtml], 'footer.html', { type: 'text/html; charset=utf-8' }));
    }
  } else {
    form.append('preferCssPageSize', 'true');
  }
  form.append('printBackground', 'true');
  form.append('waitDelay', '1000ms');
  form.append('waitForExpression', 'window.__KALAMAPP_PRINT_READY === true');

  const { signal, cleanup } = createTimeoutSignal(GOTENBERG_TIMEOUT_MS);

  try {
    const response = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
      method: 'POST',
      headers: {
        'Gotenberg-Output-Filename': getSafeGotenbergHeaderFilename(filename),
        'Gotenberg-Trace': traceId,
      },
      body: form,
      signal,
    });

    if (!response.ok || !response.body) {
      const details = await response.text().catch(() => '');
      console.error('render-pdf gotenberg error', response.status, details);
      return htmlError(502, 'تولید PDF ناموفق بود', 'سرویس تبدیل فایل در دسترس نبود یا پاسخ معتبری نداد.');
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeContentDispositionFilename(filename)}`,
        'Cache-Control': 'no-store, max-age=0',
        'X-Kalam-Function-Build': FUNCTION_BUILD,
        'X-Kalam-Trace': traceId,
      },
    });
  } catch (error) {
    console.error('render-pdf unexpected error', error);
    return htmlError(500, 'تولید PDF ناموفق بود', 'هنگام آماده‌سازی فایل چاپ خطایی رخ داد.');
  } finally {
    cleanup();
  }
});
