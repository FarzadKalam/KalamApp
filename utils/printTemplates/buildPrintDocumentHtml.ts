import { printStyles } from './styles';

interface BuildPrintDocumentHtmlOptions {
  pageSize?: string;
  sourceHtml: string;
  title?: string;
}

const FONT_FACE_DEFINITIONS = [
  { weight: 100, file: 'Vazirmatn-Thin.woff2' },
  { weight: 200, file: 'Vazirmatn-ExtraLight.woff2' },
  { weight: 300, file: 'Vazirmatn-Light.woff2' },
  { weight: 400, file: 'Vazirmatn-Regular.woff2' },
  { weight: 500, file: 'Vazirmatn-Medium.woff2' },
  { weight: 600, file: 'Vazirmatn-SemiBold.woff2' },
  { weight: 700, file: 'Vazirmatn-Bold.woff2' },
  { weight: 800, file: 'Vazirmatn-ExtraBold.woff2' },
  { weight: 900, file: 'Vazirmatn-Black.woff2' },
] as const;

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

const buildRemoteFontFaceCss = (origin: string) =>
  FONT_FACE_DEFINITIONS.map(
    ({ weight, file }) => `
      @font-face {
        font-family: 'Vazirmatn';
        src: url('${origin}/font/fonts/webfonts/${file}') format('woff2');
        font-weight: ${weight};
        font-style: normal;
        font-display: swap;
      }
    `
  ).join('\n');

const buildEmbeddedFontFaceCss = async (origin: string) => {
  const parts = await Promise.all(
    FONT_FACE_DEFINITIONS.map(async ({ weight, file }) => {
      const fontUrl = `${origin}/font/fonts/webfonts/${file}`;

      try {
        const response = await fetch(fontUrl, { credentials: 'same-origin' });
        if (!response.ok) {
          throw new Error(`font fetch failed: ${response.status}`);
        }

        const base64 = arrayBufferToBase64(await response.arrayBuffer());
        return `
          @font-face {
            font-family: 'Vazirmatn';
            src: url('data:font/woff2;base64,${base64}') format('woff2');
            font-weight: ${weight};
            font-style: normal;
            font-display: swap;
          }
        `;
      } catch (error) {
        console.warn('Embedded print font fetch failed, falling back to URL font source', file, error);
        return `
          @font-face {
            font-family: 'Vazirmatn';
            src: url('${fontUrl}') format('woff2');
            font-weight: ${weight};
            font-style: normal;
            font-display: swap;
          }
        `;
      }
    })
  );

  return parts.join('\n');
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
