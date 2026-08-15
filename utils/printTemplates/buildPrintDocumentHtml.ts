import { printStyles } from './styles';
import { getCompactPrintCellsFitScript } from './fitCompactPrintCells';
import { getStaticCustomPrintPaginationScript } from './staticPrintPagination';
import { NATIVE_PRINT_BASE_HREF_TOKEN, NATIVE_PRINT_FONT_CSS_TOKEN } from './nativePrintFlow';
import peydaExtraLightUrl from '../../font/peyada/PeydaWeb-ExtraLight.woff2?url';
import peydaRegularUrl from '../../font/peyada/PeydaWeb-Regular.woff2?url';
import peydaSemiBoldUrl from '../../font/peyada/PeydaWeb-SemiBold.woff2?url';
import peydaBoldUrl from '../../font/peyada/PeydaWeb-Bold.woff2?url';
import peydaBlackUrl from '../../font/peyada/PeydaWeb-Black.woff2?url';

interface BuildPrintDocumentHtmlOptions {
  pageSize?: string;
  sourceHtml: string;
  title?: string;
}

const FONT_FACE_DEFINITIONS = [
  { weight: 200, file: 'PeydaWeb-ExtraLight.woff2', url: peydaExtraLightUrl },
  { weight: 400, file: 'PeydaWeb-Regular.woff2', url: peydaRegularUrl },
  { weight: 600, file: 'PeydaWeb-SemiBold.woff2', url: peydaSemiBoldUrl },
  { weight: 700, file: 'PeydaWeb-Bold.woff2', url: peydaBoldUrl },
  { weight: 900, file: 'PeydaWeb-Black.woff2', url: peydaBlackUrl },
] as const;

// All brand-* RGB variables used across catalog and print layouts.
// Values are Tailwind blue-* defaults; the actual brand color is read from the DOM
// via getThemeVariableCss() and overrides these fallbacks when running in the browser.
const THEME_VARIABLE_FALLBACKS: Record<string, string> = {
  '--brand-50-rgb': '239 246 255',
  '--brand-100-rgb': '219 234 254',
  '--brand-200-rgb': '191 219 254',
  '--brand-500-rgb': '59 130 246',
  '--brand-600-rgb': '37 99 235',
  '--brand-800-rgb': '30 58 138',
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

const buildFontFaceCss = (source: string, weight: number) =>
  `
    @font-face {
      font-family: 'Peyda';
      src: url('${source}') format('woff2');
      font-weight: ${weight};
      font-style: normal;
      font-display: swap;
    }
  `;

const buildRemoteFontFaceCss = (origin: string) =>
  FONT_FACE_DEFINITIONS
    .map((font) => buildFontFaceCss(resolveAssetUrl(font.url, origin), font.weight))
    .join('\n');

const buildEmbeddedFontFaceCss = async (origin: string) => {
  try {
    const fontFaces = await Promise.all(FONT_FACE_DEFINITIONS.map(async (font) => {
      const response = await fetch(resolveAssetUrl(font.url, origin), { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error(`font fetch failed: ${response.status}`);
      }

      const base64 = arrayBufferToBase64(await response.arrayBuffer());
      return buildFontFaceCss(`data:font/woff2;base64,${base64}`, font.weight);
    }));
    return fontFaces.join('\n');
  } catch (error) {
    console.warn('Embedded print font fetch failed, falling back to URL font sources', error);
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

export const materializeNativePrintAssets = ({
  sourceHtml,
  fontCss,
  baseHref,
}: {
  sourceHtml: string;
  fontCss: string;
  baseHref: string;
}) => sourceHtml
  .replaceAll(NATIVE_PRINT_FONT_CSS_TOKEN, fontCss)
  .replaceAll(NATIVE_PRINT_BASE_HREF_TOKEN, escapeHtml(baseHref));

export const buildPrintDocumentHtml = async ({ pageSize, sourceHtml, title }: BuildPrintDocumentHtmlOptions) => {
  const safeTitle = escapeHtml(title || 'چاپ');
  const safePageSize = escapeHtml(pageSize || 'A4 portrait');
  const isNativePrintFlow = /\bdata-kalamapp-native-print-flow="true"/i.test(sourceHtml);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseHref = origin ? `${origin}/` : '/';
  const fontCss = await getFontFaceCss(origin);
  const rootVars = getThemeVariableCss();
  const preparedSourceHtml = isNativePrintFlow
    ? materializeNativePrintAssets({ sourceHtml, fontCss, baseHref })
    : sourceHtml;

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
        font-family: 'Peyda', Tahoma, Arial, sans-serif;
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
        font-family: 'Peyda', Tahoma, Arial, sans-serif !important;
      }
      #print-root:has(.kalamapp-native-print-flow) {
        background: transparent !important;
      }

      #print-root,
      #print-root * {
        font-family: 'Peyda', Tahoma, Arial, sans-serif !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      ${printStyles}

      ${isNativePrintFlow ? '' : `@page {
        size: ${safePageSize};
        margin: 0;
      }`}
    </style>
  </head>
  <body class="print-mode">
    <div id="print-root">${preparedSourceHtml}</div>
    <script>
      window.__KALAMAPP_PRINT_READY = false;
      (function () {
        function waitForFonts() {
          return Promise.resolve(document.fonts && document.fonts.ready).catch(function () { return null; });
        }

        function waitForDomImage(img) {
          if (!img || !img.getAttribute || !img.getAttribute('src')) {
            return Promise.resolve();
          }
          if (img.complete) {
            return Promise.resolve();
          }
          return new Promise(function (resolve) {
            var done = function () { resolve(); };
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          });
        }

        function extractInlineStyleUrls() {
          var styleElements = Array.prototype.slice.call(document.querySelectorAll('[style]'));
          var urls = [];
          styleElements.forEach(function (element) {
            var styleText = String(element.getAttribute('style') || '');
            if (styleText.indexOf('url(') === -1) {
              return;
            }
            styleText.replace(/url\\((['"]?)(.*?)\\1\\)/gi, function (_match, _quote, rawUrl) {
              var nextUrl = String(rawUrl || '').trim();
              if (nextUrl && !/^data:/i.test(nextUrl)) {
                urls.push(nextUrl);
              }
              return _match;
            });
          });
          return Array.from(new Set(urls));
        }

        function preloadImageUrl(url) {
          if (!url || /^data:/i.test(url)) {
            return Promise.resolve();
          }
          return new Promise(function (resolve) {
            var probe = new Image();
            probe.decoding = 'sync';
            probe.onload = function () { resolve(); };
            probe.onerror = function () { resolve(); };
            probe.src = url;
          });
        }

        function waitForAssets() {
          var templateImageAssets = [];
          var templateInlineAssets = [];
          Array.prototype.slice.call(document.querySelectorAll('template')).forEach(function (template) {
            var content = template && template.content;
            if (!content || !content.querySelectorAll) return;
            Array.prototype.slice.call(content.querySelectorAll('img')).forEach(function (image) {
              var source = String(image.getAttribute('src') || '').trim();
              if (source && !/^data:/i.test(source)) templateImageAssets.push(source);
            });
            Array.prototype.slice.call(content.querySelectorAll('[style]')).forEach(function (element) {
              var styleText = String(element.getAttribute('style') || '');
              styleText.replace(/url\\((['"]?)(.*?)\\1\\)/gi, function (_match, _quote, rawUrl) {
                var nextUrl = String(rawUrl || '').trim();
                if (nextUrl && !/^data:/i.test(nextUrl)) templateInlineAssets.push(nextUrl);
                return _match;
              });
            });
          });
          var domImages = Array.prototype.slice.call(document.images || []).map(waitForDomImage);
          var externalAssets = templateImageAssets.concat(extractInlineStyleUrls(), templateInlineAssets).map(preloadImageUrl);
          return Promise.all(domImages.concat(externalAssets));
        }

        function withTimeout(promise, timeoutMs) {
          return Promise.race([
            promise,
            new Promise(function (resolve) {
              window.setTimeout(resolve, timeoutMs);
            }),
          ]);
        }

        withTimeout(Promise.all([waitForFonts(), waitForAssets()]), 8000)
          .catch(function () { return null; })
          .then(function () {
            ${getCompactPrintCellsFitScript()}
            ${getStaticCustomPrintPaginationScript()}
            window.__KALAMAPP_PRINT_READY = true;
          });
      })();
    </script>
  </body>
</html>`;
};
