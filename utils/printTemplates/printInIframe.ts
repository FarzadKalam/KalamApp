import { printStyles } from './styles';
import { fitCompactPrintCells } from './fitCompactPrintCells';

interface PrintInIframeOptions {
  pageSize?: string;
  sourceHtml?: string;
  sourceNode?: HTMLElement | null;
  title?: string;
}

const PRINT_ROOT_ID = 'print-root';
const PRINT_SESSION_STYLE_ID = 'kalamapp-print-session-style';
const PRINT_SESSION_ATTR = 'data-kalamapp-print-session';
const PRINT_SETTLE_DELAY_MS = 180;

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const getSourceHtml = ({ sourceHtml, sourceNode }: PrintInIframeOptions) => {
  if (typeof sourceHtml === 'string') return sourceHtml;
  return sourceNode?.innerHTML || '';
};

const waitForFonts = async (timeoutMs = 1800) => {
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (!fonts?.ready) return;
  await Promise.race([fonts.ready, delay(timeoutMs)]);
};

const parseCssBackgroundUrls = (backgroundImage: string) =>
  Array.from(String(backgroundImage || '').matchAll(/url\((['"]?)(.*?)\1\)/gi))
    .map((match) => String(match[2] || '').trim())
    .filter(Boolean);

const loadImageUrl = (url: string) =>
  new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
  });

const waitForImages = async (root: HTMLElement, timeoutMs = 2200) => {
  const pending = Array.from(root.querySelectorAll('img')).filter((img) => !img.complete);
  const backgroundUrls = Array.from(root.querySelectorAll<HTMLElement>('*')).flatMap((element) =>
    parseCssBackgroundUrls(element.style.backgroundImage)
  );
  const uniqueBackgroundUrls = Array.from(new Set(backgroundUrls));
  if (!pending.length && !uniqueBackgroundUrls.length) return;

  await Promise.race([
    Promise.allSettled(
      [
        ...pending.map(
          (img) =>
            new Promise<void>((resolve) => {
              const finish = () => resolve();
              img.addEventListener('load', finish, { once: true });
              img.addEventListener('error', finish, { once: true });
            })
        ),
        ...uniqueBackgroundUrls.map(loadImageUrl),
      ]
    ),
    delay(timeoutMs),
  ]);
};

const waitForPaint = async () => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
};

const ensureSessionStyle = (pageSize?: string) => {
  let styleEl = document.getElementById(PRINT_SESSION_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = PRINT_SESSION_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    ${printStyles}
    @page {
      size: ${pageSize || 'A4 portrait'};
      margin: 0;
    }
    html,
    body[${PRINT_SESSION_ATTR}="true"] {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      overflow: visible !important;
    }
    body[${PRINT_SESSION_ATTR}="true"] > *:not(#${PRINT_ROOT_ID}) {
      display: none !important;
    }
    body[${PRINT_SESSION_ATTR}="true"] #${PRINT_ROOT_ID} {
      display: block !important;
      position: static !important;
      width: max-content !important;
      max-width: none !important;
      min-height: 100vh !important;
      margin: 0 auto !important;
      padding: 0 !important;
      overflow: visible !important;
      background: #fff !important;
      font-family: 'Peyda', Tahoma, Arial, sans-serif !important;
    }
    body[${PRINT_SESSION_ATTR}="true"] #${PRINT_ROOT_ID} * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @media screen {
      body[${PRINT_SESSION_ATTR}="true"] #${PRINT_ROOT_ID} {
        visibility: visible !important;
      }
      body[${PRINT_SESSION_ATTR}="true"] #${PRINT_ROOT_ID} .print-card,
      body[${PRINT_SESSION_ATTR}="true"] #${PRINT_ROOT_ID} .print-template-page,
      body[${PRINT_SESSION_ATTR}="true"] #${PRINT_ROOT_ID} .list-print-page {
        box-shadow: none !important;
      }
    }
  `;
};

const createPrintRoot = (html: string) => {
  const root = document.createElement('div');
  root.id = PRINT_ROOT_ID;
  root.innerHTML = html;
  return root;
};

const activatePrintSession = (html: string, pageSize?: string) => {
  ensureSessionStyle(pageSize);
  const originalNodes = Array.from(document.body.childNodes);
  const root = createPrintRoot(html);
  document.body.setAttribute(PRINT_SESSION_ATTR, 'true');
  document.body.replaceChildren(root);
  return { originalNodes, root };
};

const createCleanup = (originalNodes: ChildNode[], originalTitle: string, nextTitle?: string) => {
  let cleaned = false;
  let focusBound = false;
  let didEnterPrint = false;

  if (nextTitle) {
    document.title = nextTitle;
  }

  const handleFocus = () => cleanup();
  const handleBeforePrint = () => {
    didEnterPrint = true;
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.clearTimeout(fallbackTimer);
    if (focusBound) {
      window.removeEventListener('focus', handleFocus, true);
    }
    window.removeEventListener('beforeprint', handleBeforePrint);
    window.removeEventListener('afterprint', cleanup);
    document.body.removeAttribute(PRINT_SESSION_ATTR);
    document.body.replaceChildren(...originalNodes);
    document.title = originalTitle;
  };

  window.addEventListener('beforeprint', handleBeforePrint, { once: true });
  window.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(() => {
    focusBound = true;
    window.addEventListener('focus', handleFocus, { once: true, capture: true });
  }, 400);

  const fallbackTimer = window.setTimeout(cleanup, 60000);
  return { cleanup, didEnterPrint: () => didEnterPrint };
};

export const printInIframe = async (options: PrintInIframeOptions) => {
  const html = getSourceHtml(options).trim();
  if (!html) return;

  const originalTitle = document.title;
  const { originalNodes, root } = activatePrintSession(html, options.pageSize);
  const { cleanup, didEnterPrint } = createCleanup(originalNodes, originalTitle, options.title);

  try {
    await waitForFonts();
    await waitForImages(root);
    await waitForPaint();
    fitCompactPrintCells(root);
    await delay(PRINT_SETTLE_DELAY_MS);
    await waitForPaint();

    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.focus();
    window.print();
    window.setTimeout(() => {
      if (!didEnterPrint()) {
        cleanup();
      }
    }, 1200);
  } catch (error) {
    cleanup();
    throw error;
  }
};
