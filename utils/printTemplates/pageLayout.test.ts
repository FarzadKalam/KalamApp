import { describe, expect, it } from 'vitest';
import {
  getFinalContentBodyHeightPx,
  getPrintBodyViewportHeightPx,
  getTemplatePageBodyStepPx,
} from './pageLayout';

describe('print page layout', () => {
  it('keeps exactly one physical pixel as the body boundary guard', () => {
    const bodyHeight = 640;
    const step = getTemplatePageBodyStepPx(bodyHeight);

    expect(step).toBe(639);
    expect(getPrintBodyViewportHeightPx(bodyHeight, step)).toBe(639);
  });

  it('uses the measured remaining content height for the last signed page', () => {
    expect(getFinalContentBodyHeightPx({
      pageBodyHeightPx: 640,
      pageStartOffset: 0,
      contentHeightPx: 318.2,
    })).toBe(319);
  });

  it('never lets a compact final page exceed its reserved printable body', () => {
    expect(getFinalContentBodyHeightPx({
      pageBodyHeightPx: 640,
      pageStartOffset: 640,
      contentHeightPx: 1600,
    })).toBe(640);
  });

  it('keeps the full body until the hidden measurement node has a real height', () => {
    expect(getFinalContentBodyHeightPx({
      pageBodyHeightPx: 640,
      pageStartOffset: 0,
      contentHeightPx: 1,
    })).toBe(640);
  });
});
