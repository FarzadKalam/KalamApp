import { describe, expect, it } from 'vitest';
import { collectPrintFlowLeaves, createPrintFragmentAppender } from './printFlowStructure';

describe('print content flow', () => {
  it('finds nested tables in document order while keeping side-by-side sections intact', () => {
    const root = document.createElement('main');
    root.innerHTML = '<section><p>مقدمه</p><div><table><tbody><tr><td>قلم</td></tr></tbody></table><p>توضیحات</p></div></section><div style="display:grid"><p>فروشنده</p><p>خریدار</p></div>';
    expect(collectPrintFlowLeaves(root).map((node) => node.tagName)).toEqual(['P', 'TABLE', 'P', 'DIV']);
  });

  it('rebuilds shared section styling without copying rows belonging to other pages', () => {
    const root = document.createElement('main');
    root.innerHTML = '<section style="font-size:13px;height:500px"><div style="padding:4px;border:1px solid"><p>توضیح</p><table><tbody><tr><td>اول</td></tr><tr><td>دوم</td></tr></tbody></table></div></section>';
    const leaves = collectPrintFlowLeaves(root);
    const fragment = document.createDocumentFragment();
    const append = createPrintFragmentAppender(document, root, fragment);
    append(leaves[0], leaves[0].cloneNode(true));
    const selectedTable = leaves[1].cloneNode(true) as HTMLElement;
    selectedTable.querySelector('tr:last-child')!.remove();
    append(leaves[1], selectedTable);
    expect(fragment.querySelectorAll('section')).toHaveLength(1);
    expect(fragment.querySelectorAll('section > div')).toHaveLength(1);
    expect(fragment.querySelector('section')!.style.fontSize).toBe('13px');
    expect(fragment.querySelector('section')!.style.height).toBe('auto');
    expect(fragment.querySelector('section > div')!.getAttribute('style')).toContain('padding: 4px');
    expect(fragment.textContent).toBe('توضیحاول');
  });

  it('preserves explicit indivisible sections and direct text between nested blocks', () => {
    const root = document.createElement('main');
    root.innerHTML = '<section>ابتدا<p>متن</p>انتها</section><div data-print-keep-together><p>امضا</p><p>مهر</p></div>';
    expect(collectPrintFlowLeaves(root).map((node) => node.textContent)).toEqual(['ابتدا', 'متن', 'انتها', 'امضامهر']);
  });
});
