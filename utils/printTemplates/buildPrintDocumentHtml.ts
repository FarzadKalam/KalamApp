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

const NATIVE_PRINT_MARGIN_TEMPLATE_IDS = ['kalamapp-gotenberg-header', 'kalamapp-gotenberg-footer'];
const PRINT_IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const PRINT_IMAGE_FETCH_TIMEOUT_MS = 8_000;

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

const isEmbeddablePrintImageUrl = (value: string) => /^(?:https?:|blob:)/i.test(value);
const getNativePrintMarginTemplatePattern = (id: string) =>
  new RegExp(`(<template\\b[^>]*\\bid=["']${id}["'][^>]*>)([\\s\\S]*?)(<\\/template>)`, 'gi');
const IMAGE_SRC_ATTRIBUTE_PATTERN = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const IMAGE_TAG_PATTERN = /<img\b[^>]*>/gi;
const STYLE_ATTRIBUTE_PATTERN = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi;
const STYLE_IMAGE_URL_PATTERN = /url\((['"]?)(.*?)\1\)/gi;

const decodeHtmlAttribute = (value: string) => String(value || '')
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'");

const getImageSources = (html: string) => Array.from(html.matchAll(IMAGE_TAG_PATTERN))
  .map((match) => {
    const sourceMatch = match[0].match(IMAGE_SRC_ATTRIBUTE_PATTERN);
    return decodeHtmlAttribute(String(sourceMatch?.[1] || sourceMatch?.[2] || sourceMatch?.[3] || '')).trim();
  })
  .filter(isEmbeddablePrintImageUrl);

const getInlineStyleImageSources = (html: string) => Array.from(html.matchAll(STYLE_ATTRIBUTE_PATTERN))
  .flatMap((match) => Array.from(String(match[2] || '').matchAll(STYLE_IMAGE_URL_PATTERN)))
  .map((match) => decodeHtmlAttribute(String(match[2] || '')).trim())
  .filter(isEmbeddablePrintImageUrl);

const replaceImageSources = (html: string, dataUrlBySource: Map<string, string>, origin: string) =>
  html.replace(IMAGE_TAG_PATTERN, (imageTag) => imageTag.replace(IMAGE_SRC_ATTRIBUTE_PATTERN, (attribute, doubleQuoted, singleQuoted, unquoted) => {
    const source = decodeHtmlAttribute(String(doubleQuoted || singleQuoted || unquoted || '')).trim();
    if (!isEmbeddablePrintImageUrl(source)) return attribute;
    const replacement = dataUrlBySource.get(resolveAssetUrl(source, origin));
    return replacement ? `src="${escapeHtml(replacement)}"` : attribute;
  }));

const replaceInlineStyleImageSources = (html: string, dataUrlBySource: Map<string, string>, origin: string) =>
  html.replace(STYLE_ATTRIBUTE_PATTERN, (_attribute, quote, styleText) => {
    const nextStyle = String(styleText || '').replace(STYLE_IMAGE_URL_PATTERN, (urlMatch, _urlQuote, rawSource) => {
      const source = decodeHtmlAttribute(String(rawSource || '')).trim();
      if (!isEmbeddablePrintImageUrl(source)) return urlMatch;
      const replacement = dataUrlBySource.get(resolveAssetUrl(source, origin));
      return replacement ? `url(${replacement})` : urlMatch;
    });
    return `style=${quote}${nextStyle}${quote}`;
  });

const fetchPrintImageDataUrl = async (url: string) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), PRINT_IMAGE_FETCH_TIMEOUT_MS);

  try {
    // The PDF renderer runs in a different network context. Resolve an image
    // in the user's browser first, where signed URLs and local blob URLs are
    // valid, then send an inline copy to Chromium.
    const response = await fetch(url, { credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) return url;

    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('image/')) return url;

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > PRINT_IMAGE_MAX_BYTES) return url;

    return `data:${contentType};base64,${arrayBufferToBase64(bytes)}`;
  } catch {
    // Public images that do not allow CORS are still left for the renderer to
    // load directly. This fallback keeps custom external templates working.
    return url;
  } finally {
    window.clearTimeout(timeout);
  }
};

/**
 * Makes body images self-contained before the document crosses from the
 * browser to Gotenberg. This covers catalog artwork as well as user-authored
 * template images; previously only images in native header/footer templates
 * were embedded.
 */
export const materializePrintImageAssets = async (sourceHtml: string, origin: string) => {
  if (typeof window === 'undefined' || !sourceHtml) return sourceHtml;

  const sourceUrls = Array.from(new Set([...getImageSources(sourceHtml), ...getInlineStyleImageSources(sourceHtml)]
    .map((source) => resolveAssetUrl(source, origin))));
  if (sourceUrls.length === 0) return sourceHtml;

  const dataUrlBySource = new Map(await Promise.all(
    sourceUrls.map(async (source) => [source, await fetchPrintImageDataUrl(source)] as const),
  ));
  return replaceInlineStyleImageSources(
    replaceImageSources(sourceHtml, dataUrlBySource, origin),
    dataUrlBySource,
    origin,
  );
};

/**
 * Gotenberg receives the header and footer as independent documents. Embed
 * their public images before upload so a logo cannot disappear because that
 * secondary document has not finished its own network request yet.
 */
export const materializeNativePrintMarginImages = async (sourceHtml: string, origin: string) => {
  if (typeof window === 'undefined' || !sourceHtml) return sourceHtml;

  // Do not parse the outer document with DOMParser here. The contents of a
  // template are complete HTML documents and DOMParser would normalize away
  // their doctype/html/head/body tags before Gotenberg receives them.
  const marginTemplateContents = NATIVE_PRINT_MARGIN_TEMPLATE_IDS.flatMap((id) => {
    const matches = Array.from(sourceHtml.matchAll(getNativePrintMarginTemplatePattern(id)));
    return matches.map((match) => String(match[2] || ''));
  });
  if (marginTemplateContents.length === 0) return sourceHtml;

  const sourceUrls = Array.from(new Set(marginTemplateContents
    .flatMap(getImageSources)
    .filter(isEmbeddablePrintImageUrl)
    .map((source) => resolveAssetUrl(source, origin))));
  if (sourceUrls.length === 0) return sourceHtml;

  const dataUrlBySource = new Map(await Promise.all(sourceUrls.map(async (source) => [source, await fetchPrintImageDataUrl(source)] as const)));
  return NATIVE_PRINT_MARGIN_TEMPLATE_IDS.reduce(
    (html, id) => html.replace(getNativePrintMarginTemplatePattern(id), (_match, openingTag, content, closingTag) =>
      `${openingTag}${replaceImageSources(String(content || ''), dataUrlBySource, origin)}${closingTag}`),
    sourceHtml,
  );
};

export const buildPrintDocumentHtml = async ({ pageSize, sourceHtml, title }: BuildPrintDocumentHtmlOptions) => {
  const safeTitle = escapeHtml(title || 'چاپ');
  const safePageSize = escapeHtml(pageSize || 'A4 portrait');
  const isNativePrintFlow = /\bdata-kalamapp-native-print-flow="true"/i.test(sourceHtml);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseHref = origin ? `${origin}/` : '/';
  const fontCss = await getFontFaceCss(origin);
  const rootVars = getThemeVariableCss();
  const sourceHtmlWithNativeAssets = isNativePrintFlow
    ? await materializeNativePrintMarginImages(
        materializeNativePrintAssets({ sourceHtml, fontCss, baseHref }),
        origin,
      )
    : sourceHtml;
  const preparedSourceHtml = await materializePrintImageAssets(sourceHtmlWithNativeAssets, origin);

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
