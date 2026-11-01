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

import { cloneTableRows, positionPrintPageFooter, repaginateStaticCustomPrintDocument } from './staticPrintPagination';

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
  it('starts a short table in the remaining space instead of moving the entire table to the next page', () => {
    const root = document.createElement('div');
    const shell = document.createElement('div'); shell.className = 'invoice-custom-print-shell';
    const page = createPage();
    const inner = page.querySelector<HTMLElement>('.print-template-body-inner')!;
    inner.innerHTML = '<section><p>مشخصات طرف حساب</p><table><thead><tr><th>اقلام</th></tr></thead><tbody>' + Array.from({ length: 10 }, (_, i) => `<tr data-item="${i}"><td>قلم ${i}</td></tr>`).join('') + '</tbody></table></section>';
    const bounds = (top: number, height: number) => () => ({ top, bottom: top + height, height } as DOMRect);
    inner.getBoundingClientRect = bounds(0, 680);
    inner.querySelector('p')!.getBoundingClientRect = bounds(0, 360);
    inner.querySelector('table')!.getBoundingClientRect = bounds(360, 320);
    inner.querySelector('thead tr')!.getBoundingClientRect = bounds(360, 20);
    inner.querySelectorAll('tbody tr').forEach((row, index) => { row.getBoundingClientRect = bounds(380 + index * 30, 30); });
    shell.append(page); root.append(shell); document.body.append(root);
    expect(repaginateStaticCustomPrintDocument(root)).toBe(2);
    const firstRows = shell.querySelector('.print-template-page')!.querySelectorAll('[data-item]');
    expect(firstRows.length).toBeGreaterThan(0);
    expect(firstRows.length).toBeLessThan(10);
    expect(Array.from(shell.querySelectorAll('[data-item]'), (row) => row.getAttribute('data-item'))).toEqual(Array.from({ length: 10 }, (_, i) => String(i)));
  });
  it('retains nested party details and the header while selecting only this page’s invoice rows', () => {
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>عنوان</th></tr></thead><tbody><tr><td><table><tbody><tr><td>فروشنده</td></tr><tr><td>خریدار</td></tr></tbody></table></td></tr><tr><td>قلم صفحه بعد</td></tr></tbody>';
    const first = table.tBodies[0].rows[0];
    const clone = cloneTableRows(table, [first]);
    expect(clone.textContent).toBe('عنوانفروشندهخریدار');
    expect(clone.querySelector('td table')!.querySelectorAll('tr')).toHaveLength(2);
    expect(table.textContent).toContain('قلم صفحه بعد');
  });
  it('shows signatures on every page and shrinks only the last body to its measured content', () => {
    const page = createPage();
    page.querySelector('.print-template-footer')!.innerHTML = '<div class="print-template-signatures" style="display:none">امضا</div>';
    const viewport = page.querySelector<HTMLElement>('.print-template-body-viewport')!;
    const segment = page.querySelector<HTMLElement>('.print-template-body-segment')!;
    viewport.style.height = '600px';
    segment.getBoundingClientRect = () => ({ height: 120 } as DOMRect);
    positionPrintPageFooter(page, false, true);
    expect(page.querySelector<HTMLElement>('.print-template-signatures')?.style.display).toBe('');
    expect(page.querySelector<HTMLElement>('.print-template-footer')?.style.marginTop).toBe('auto');
    expect(viewport.style.height).toBe('600px');
    positionPrintPageFooter(page, true, true);
    expect(page.querySelector<HTMLElement>('.print-template-footer')?.style.marginTop).toBe('0px');
    expect(page.querySelector<HTMLElement>('.print-template-body')?.style.height).toBe('120px');
    expect(viewport.style.height).toBe('120px');
  });
  beforeEach(() => {
    document.body.replaceChildren();
    buildSmartPrintPageRanges.mockReset();
    collectPrintPageAnchors.mockReset();
    collectPrintPageAnchors.mockReturnValue([{ top: 0, bottom: 24, priority: 'normal', source: 'line' }]);
  });

  it('rebuilds the final print DOM from its actual body and adds every required page', () => {
    buildSmartPrintPageRanges.mockReturnValue([
      { start: 0, end: 610 },
      { start: 610, end: 1214 },
      { start: 1214, end: 1780 },
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
      pageBodyStepPx: 592,
    }));
    expect(pages).toHaveLength(3);
    expect(pages[2].querySelector<HTMLElement>('.print-template-body-segment')?.style.transform).toBe('translateY(-1190px)');
    expect(pages[2].querySelector<HTMLElement>('.print-template-body-segment')?.style.position).toBe('absolute');
    expect(pages[2].querySelector<HTMLElement>('.print-template-body-viewport')?.style.height).toBe('614px');
    expect(pages[0].querySelector<HTMLElement>('.print-template-footer')?.style.marginTop).toBe('auto');
    expect(pages[2].querySelector<HTMLElement>('.print-template-footer')?.style.marginTop).toBe('0px');
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
      pageBodyStepPx: 672,
    }));
  });

  it('materializes separate body fragments so no prior page source remains below a repeated header', () => {
    const root = document.createElement('div');
    const shell = document.createElement('div');
    shell.className = 'invoice-custom-print-shell';
    const page = createPage();
    const inner = page.querySelector<HTMLElement>('.print-template-body-inner')!;
    inner.innerHTML = '<p>بند اول</p><p>بند دوم</p><p>بند سوم</p><p>بند چهارم</p>';
    inner.getBoundingClientRect = () => ({ top: 0, bottom: 900, height: 900 } as DOMRect);
    Object.defineProperty(inner, 'scrollHeight', { configurable: true, value: 900 });
    Object.defineProperty(inner, 'offsetHeight', { configurable: true, value: 900 });
    Object.defineProperty(inner, 'clientHeight', { configurable: true, value: 900 });
    const bounds = [
      { top: 0, bottom: 150 },
      { top: 200, bottom: 400 },
      { top: 450, bottom: 620 },
      { top: 650, bottom: 900 },
    ];
    Array.from(inner.children).forEach((child, index) => {
      const rect = bounds[index];
      (child as HTMLElement).getBoundingClientRect = () => ({
        top: rect.top,
        bottom: rect.bottom,
        height: rect.bottom - rect.top,
      } as DOMRect);
    });
    shell.append(page);
    root.append(shell);
    document.body.append(root);

    expect(repaginateStaticCustomPrintDocument(root)).toBe(2);
    expect(buildSmartPrintPageRanges).not.toHaveBeenCalled();
    const pages = shell.querySelectorAll<HTMLElement>('.print-template-page');

    expect(pages).toHaveLength(2);
    expect(pages[0].querySelector<HTMLElement>('.print-template-body-inner')?.textContent).toContain('بند اول');
    expect(pages[0].querySelector<HTMLElement>('.print-template-body-inner')?.textContent).toContain('بند دوم');
    expect(pages[0].querySelector<HTMLElement>('.print-template-body-inner')?.textContent).not.toContain('بند سوم');
    expect(pages[1].querySelector<HTMLElement>('.print-template-body-inner')?.textContent).toContain('بند سوم');
    expect(pages[1].querySelector<HTMLElement>('.print-template-body-inner')?.textContent).toContain('بند چهارم');
    expect(pages[1].querySelector<HTMLElement>('.print-template-body-segment')?.style.transform).toBe('none');
    expect(pages[1].querySelector<HTMLElement>('.print-template-body-segment')?.style.paddingTop).toBe('24px');
    expect(pages[1].querySelector<HTMLElement>('.print-template-body-viewport')?.style.height).toBe('640px');
  });
});
