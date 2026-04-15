import { printStyles } from './styles';
import vazirmatnVariableUrl from '../../font/fonts/webfonts/Vazirmatn[wght].woff2?url';

interface BuildPrintDocumentHtmlOptions {
  pageSize?: string;
  sourceHtml: string;
  title?: string;
}

const FONT_FACE_DEFINITION = {
  weight: '100 900',
  file: 'Vazirmatn[wght].woff2',
  url: vazirmatnVariableUrl,
} as const;

const THEME_VARIABLE_FALLBACKS: Record<string, string> = {
  '--brand-50-rgb': '238 242 255',
  '--brand-500-rgb': '55 48 163',
};

let embeddedFontCssPromise: Promise<string> | null = null;

const escapeHtml = (value: string) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const getThemeVariableCss = () => {
  if (typeof window === 'undefined') {
    return Object.entries(THEME_VARIABLE_FALLBACKS)
      .map(([name, fallback]) => `${name}: ${fallback};`)
      .join('\n');
  }

  const computedStyle = window.getComputedStyle(document.documentElement);
  return Object.entries(THEME_VARIABLE_FALLBACKS)
    .map(([name, fallback]) => {
      const value = computedStyle.getPropertyValue(name).trim() || fallback;
      return `${name}: ${value};`;
    })
    .join('\n');
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const resolveAssetUrl = (assetUrl: string, origin: string) => {
  if (/^(?:data:|https?:|blob:)/i.test(assetUrl)) return assetUrl;
  const baseUrl =
    typeof document !== 'undefined' && document.baseURI
      ? document.baseURI
      : origin
        ? `${origin}/`
        : '/';
  return new URL(assetUrl, baseUrl).toString();
};

const buildRemoteFontFaceCss = (origin: string) =>
  `
    @font-face {
      font-family: 'Vazirmatn';
      src: url('${resolveAssetUrl(FONT_FACE_DEFINITION.url, origin)}') format('woff2 supports variations'),
           url('${resolveAssetUrl(FONT_FACE_DEFINITION.url, origin)}') format('woff2-variations');
      font-weight: ${FONT_FACE_DEFINITION.weight};
      font-style: normal;
      font-display: swap;
    }
  `;

const buildEmbeddedFontFaceCss = async (origin: string) => {
  const fontUrl = resolveAssetUrl(FONT_FACE_DEFINITION.url, origin);

  try {
    const response = await fetch(fontUrl, { credentials: 'same-origin' });
    if (!response.ok) {
      throw new Error(`font fetch failed: ${response.status}`);
    }

    const base64 = arrayBufferToBase64(await response.arrayBuffer());
    return `
      @font-face {
        font-family: 'Vazirmatn';
        src: url('data:font/woff2;base64,${base64}') format('woff2 supports variations'),
             url('data:font/woff2;base64,${base64}') format('woff2-variations');
        font-weight: ${FONT_FACE_DEFINITION.weight};
        font-style: normal;
        font-display: swap;
      }
    `;
  } catch (error) {
    console.warn('Embedded print font fetch failed, falling back to URL font source', FONT_FACE_DEFINITION.file, error);
    return buildRemoteFontFaceCss(origin);
  }
};

const getFontFaceCss = async (origin: string) => {
  if (!origin) return '';
  if (!embeddedFontCssPromise) {
    embeddedFontCssPromise = buildEmbeddedFontFaceCss(origin).catch((error) => {
      console.error('Embedded print font preparation failed, using URL-based font CSS', error);
      return buildRemoteFontFaceCss(origin);
    });
  }
  return embeddedFontCssPromise;
};

export const buildPrintDocumentHtml = async ({ pageSize, sourceHtml, title }: BuildPrintDocumentHtmlOptions) => {
  const safeTitle = escapeHtml(title || 'چاپ');
  const safePageSize = escapeHtml(pageSize || 'A4 portrait');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseHref = origin ? `${origin}/` : '/';
  const fontCss = await getFontFaceCss(origin);
  const rootVars = getThemeVariableCss();

  return `<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base href="${escapeHtml(baseHref)}" />
    <title>${safeTitle}</title>
    <style>
      ${fontCss}

      :root {
        ${rootVars}
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #111827;
        font-family: 'Vazirmatn', system-ui, sans-serif;
        direction: rtl;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      body {
        overflow: visible;
      }

      #print-root {
        display: block !important;
        position: static !important;
        width: auto !important;
        height: auto !important;
        overflow: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        font-family: 'Vazirmatn', system-ui, sans-serif !important;
      }

      #print-root,
      #print-root * {
        font-family: 'Vazirmatn', system-ui, sans-serif !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      ${printStyles}

      @page {
        size: ${safePageSize};
        margin: 0;
      }
    </style>
  </head>
  <body class="print-mode">
    <div id="print-root">${sourceHtml}</div>
    <script>
      window.__KALAMAPP_PRINT_READY = false;
      Promise.resolve(document.fonts && document.fonts.ready)
        .catch(function () { return null; })
        .then(function () { window.__KALAMAPP_PRINT_READY = true; });
    </script>
  </body>
</html>`;
};
