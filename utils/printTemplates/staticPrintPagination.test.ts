import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildSmartPrintPageRanges, collectPrintPageAnchors } = vi.hoisted(() => ({
  buildSmartPrintPageRanges: vi.fn(),
  collectPrintPageAnchors: vi.fn(),
}));

vi.mock('./printPagination', () => ({
  buildSmartPrintPageRanges,
  collectPrintPageAnchors,
  trimTrailingPrintSpacerNodes: vi.fn(),
}));

import { repaginateStaticCustomPrintDocument } from './staticPrintPagination';

const createPage = () => {
  const page = document.createElement('div');
  page.className = 'print-template-page';
  page.innerHTML = `
    <div class="print-template-body">
      <div class="print-template-body-viewport">
        <div class="print-template-body-segment">
          <div class="print-template-body-inner">متن قرارداد</div>
        </div>
      </div>
    </div>
    <div class="print-template-footer"></div>
    <div class="print-template-page-counter"></div>
  `;
  const body = page.querySelector<HTMLElement>('.print-template-body')!;
  Object.defineProperty(body, 'clientHeight', { configurable: true, value: 640 });
  Object.defineProperty(body, 'offsetHeight', { configurable: true, value: 640 });
  body.getBoundingClientRect = () => ({ height: 640 } as DOMRect);
  const inner = page.querySelector<HTMLElement>('.print-template-body-inner')!;
  Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: 1780 });
  Object.defineProperty(inner, 'offsetHeight', { configurable: true, value: 1780 });
  Object.defineProperty(inner, 'clientHeight', { configurable: true, value: 1780 });
  return page;
};

describe('static custom print pagination', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    buildSmartPrintPageRanges.mockReset();
    collectPrintPageAnchors.mockReset();
    collectPrintPageAnchors.mockReturnValue([{ top: 0, bottom: 24, priority: 'normal', source: 'line' }]);
  });

  it('rebuilds the final print DOM from its actual body and adds every required page', () => {
    buildSmartPrintPageRanges.mockReturnValue([
      { start: 0, end: 610 },
      { start: 609, end: 1214 },
      { start: 1213, end: 1780 },
    ]);
    const root = document.createElement('div');
    const shell = document.createElement('div');
    shell.className = 'invoice-custom-print-shell';
    shell.append(createPage(), createPage());
    root.append(shell);
    document.body.append(root);

    expect(repaginateStaticCustomPrintDocument(root)).toBe(3);
    const pages = shell.querySelectorAll<HTMLElement>('.print-template-page');

    expect(buildSmartPrintPageRanges).toHaveBeenCalledWith(expect.objectContaining({
      totalHeight: 1780,
      pageBodyStepPx: 639,
    }));
    expect(pages).toHaveLength(3);
    expect(pages[2].querySelector<HTMLElement>('.print-template-body-segment')?.style.transform).toBe('translateY(-1213px)');
    expect(pages[2].querySelector<HTMLElement>('.print-template-body-viewport')?.style.height).toBe('567px');
    expect(pages[2].querySelector<HTMLElement>('.print-template-footer')?.style.marginTop).toBe('auto');
    expect(pages[2].querySelector<HTMLElement>('.print-template-page-counter')?.textContent).toBe('صفحه ۳ از ۳');
  });

  it('uses the final-context body capacity instead of a stale preview body height', () => {
    buildSmartPrintPageRanges.mockReturnValue([{ start: 0, end: 640 }]);
    const root = document.createElement('div');
    const shell = document.createElement('div');
    shell.className = 'invoice-custom-print-shell';
    const page = createPage();
    page.setAttribute('data-print-body-capacity-px', '720');
    shell.append(page);
    root.append(shell);
    document.body.append(root);

    repaginateStaticCustomPrintDocument(root);

    expect(buildSmartPrintPageRanges).toHaveBeenCalledWith(expect.objectContaining({
      pageBodyStepPx: 719,
    }));
  });
});
