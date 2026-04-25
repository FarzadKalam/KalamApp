import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdaptiveSelectField from './AdaptiveSelectField';

describe('AdaptiveSelectField', () => {
  afterEach(() => {
    cleanup();
  });

  it('updates the mobile trigger text immediately after selecting a single option', async () => {
    const handleChange = vi.fn();

    render(
      <AdaptiveSelectField
        adaptiveMode="mobile-sheet"
        value={undefined}
        onChange={handleChange}
        placeholder="انتخاب کنید"
        pickerTitle="وضعیت"
        showSearch={false}
        options={[
          { label: 'ایجاد شده', value: 'created' },
          { label: 'تایید شده', value: 'confirmed' },
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'وضعیت' });
    expect(trigger).toHaveTextContent('انتخاب کنید');

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('button', { name: 'تایید شده' }));

    expect(handleChange).toHaveBeenCalledWith('confirmed');
    await waitFor(() => {
      expect(trigger).toHaveTextContent('تایید شده');
    });
  });

  it('mounts the mobile picker surface into a stable overlay root instead of nesting inside the parent modal node', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="ant-modal-root"><div class="ant-modal"></div></div>';
    document.body.appendChild(host);

    const modalRoot = host.querySelector('.ant-modal-root') as HTMLElement;
    const modalNode = host.querySelector('.ant-modal') as HTMLElement;

    render(
      <AdaptiveSelectField
        adaptiveMode="mobile-sheet"
        value={undefined}
        placeholder="انتخاب کنید"
        pickerTitle="وضعیت"
        showSearch={false}
        modalContainer={() => modalNode}
        options={[
          { label: 'ایجاد شده', value: 'created' },
          { label: 'تایید شده', value: 'confirmed' },
        ]}
      />,
      { container: modalNode }
    );

    fireEvent.click(within(modalNode).getByRole('button', { name: 'وضعیت' }));

    const dialog = await screen.findByRole('dialog');
    expect(modalRoot.contains(dialog)).toBe(true);
    expect(modalNode.contains(dialog)).toBe(false);

    host.remove();
  });

  it('uses a more readable mobile trigger layout for long selected labels', () => {
    render(
      <AdaptiveSelectField
        adaptiveMode="mobile-sheet"
        value="product-1"
        pickerTitle="نام محصول"
        options={[
          { label: 'محصول چرمی دست‌دوز مدل کلاسیک بسیار بلند', value: 'product-1' },
        ]}
      />
    );

    const trigger = screen.getByRole('button', { name: 'نام محصول' });
    const text = trigger.querySelector('.kalam-adaptive-picker__trigger-text');

    expect(trigger.classList.contains('kalam-adaptive-picker__trigger--comfortable')).toBe(true);
    expect(text?.classList.contains('is-comfortable')).toBe(true);
  });

  it('keeps desktop select popups out of the local overlay container by default', async () => {
    const host = document.createElement('div');
    host.innerHTML = '<div class="ant-modal"><div class="mount"></div></div>';
    document.body.appendChild(host);

    const modalNode = host.querySelector('.ant-modal') as HTMLElement;
    const mountNode = host.querySelector('.mount') as HTMLElement;

    render(
      <AdaptiveSelectField
        adaptiveMode="desktop"
        value={undefined}
        options={[
          { label: 'ایجاد شده', value: 'created' },
          { label: 'تایید شده', value: 'confirmed' },
        ]}
        getPopupContainer={() => modalNode}
      />,
      { container: mountNode }
    );

    fireEvent.mouseDown(within(mountNode).getByRole('combobox'));

    const dropdown = await screen.findByRole('listbox');
    expect(modalNode.contains(dropdown)).toBe(false);

    host.remove();
  });
});
