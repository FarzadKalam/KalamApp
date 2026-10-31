import { describe, expect, it } from 'vitest';
import { splitPrintTextBlock } from './splitPrintTextBlock';

describe('rich text print continuations', () => {
  it('preserves inline formatting and complete lines without leading blank lines', () => {
    const paragraph = document.createElement('p');
    paragraph.innerHTML = '<strong>ردیف اول</strong><br><em>ردیف دوم</em><br>ردیف سوم';
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const texts: Node[] = []; let node = walker.nextNode();
    while (node) { texts.push(node); node = walker.nextNode(); }
    const original = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = function () {
      const top = texts.indexOf(this.startContainer) * 30;
      return { top, bottom: top + 20, height: 20 } as DOMRect;
    };
    try {
      const parts = splitPrintTextBlock(paragraph, 100, 0)!;
      expect(parts.map((part) => part.node.textContent)).toEqual(['ردیف اول', 'ردیف دوم', 'ردیف سوم']);
      expect(parts[0].node.querySelector('strong')?.textContent).toBe('ردیف اول');
      expect(parts[1].node.querySelector('em')?.textContent).toBe('ردیف دوم');
      expect(parts.every((part) => !part.node.querySelector('br'))).toBe(true);
      expect(paragraph.querySelectorAll('br')).toHaveLength(2);
    } finally { Range.prototype.getBoundingClientRect = original; }
  });
  it('leaves images and embedded tables to their structural paginator', () => {
    const paragraph = document.createElement('p'); paragraph.innerHTML = '<img src="/logo.png">';
    expect(splitPrintTextBlock(paragraph, 100, 0)).toBeNull();
  });
});
