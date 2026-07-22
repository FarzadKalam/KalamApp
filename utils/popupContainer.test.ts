import { describe, expect, it } from 'vitest';

import {
  KALAM_POPUP_ROOT_Z_INDEX,
  resolveModalPopupContainer,
  resolveOverlayPopupContainer,
  resolveSelectPopupContainer,
} from './popupContainer';

describe('resolveOverlayPopupContainer', () => {
  it('uses the dedicated popup root for triggers inside modal overlays', () => {
    document.body.innerHTML = `
      <div class="ant-modal-root">
        <div class="ant-modal-wrap">
          <div class="ant-modal">
            <button id="trigger" type="button">hover</button>
          </div>
        </div>
      </div>
    `;

    const trigger = document.getElementById('trigger') as HTMLElement;
    const container = resolveOverlayPopupContainer(trigger);

    expect(container.id).toBe('kalam-popup-root');
    expect(container.parentElement).toBe(document.body);
  });

  it('keeps using the shared popup root when no trigger is provided', () => {
    const container = resolveOverlayPopupContainer();

    expect(container.id).toBe('kalam-popup-root');
    expect(container.parentElement).toBe(document.body);
  });

  it('creates one stacking context above modals for every select popup', () => {
    const container = resolveSelectPopupContainer();

    expect(container.style.position).toBe('relative');
    expect(container.style.isolation).toBe('isolate');
    expect(container.style.zIndex).toBe(String(KALAM_POPUP_ROOT_Z_INDEX));
  });

  it('keeps select popups inside the current modal body when requested', () => {
    document.body.innerHTML = `
      <div class="ant-modal-root">
        <div class="ant-modal-wrap">
          <div class="ant-modal">
            <div class="ant-modal-content">
              <div class="ant-modal-body"><button id="modal-trigger" type="button">select</button></div>
            </div>
          </div>
        </div>
      </div>
    `;

    const trigger = document.getElementById('modal-trigger') as HTMLElement;
    expect(resolveModalPopupContainer(trigger)).toBe(trigger.closest('.ant-modal-body'));
  });
});
