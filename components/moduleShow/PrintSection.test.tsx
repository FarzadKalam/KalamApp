import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PrintSection from './PrintSection';

const templates = [
  {
    id: 'custom:a4',
    title: 'قالب A4 تست',
    description: 'قالب فارسی برای تست',
  },
  {
    id: 'custom:a5',
    title: 'قالب A5 تست',
    description: 'قالب دوم',
  },
];

const setDesktopViewport = () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1280,
  });
  window.dispatchEvent(new Event('resize'));
};

describe('PrintSection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('runs direct PDF send once without triggering print or closing the modal', async () => {
    setDesktopViewport();
    const user = userEvent.setup();
    const onSendInternalPdf = vi.fn(async () => undefined);
    const onPrint = vi.fn();
    const onClose = vi.fn();
    const renderPrintCard = vi.fn(() => <div data-testid="print-card">پیش‌نمایش PDF فارسی</div>);

    render(
      <PrintSection
        isPrintModalOpen
        onClose={onClose}
        onPrint={onPrint}
        onSendInternalPdf={onSendInternalPdf}
        printTemplates={templates}
        selectedTemplateId="custom:a4"
        onSelectTemplate={vi.fn()}
        renderPrintCard={renderPrintCard}
        printMode={false}
        previewMeta={{ paperSize: 'A4', orientation: 'portrait' }}
      />
    );

    expect(await screen.findByText('انتخاب قالب چاپ')).toBeInTheDocument();
    expect(screen.getAllByTestId('print-card')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'ارسال مستقیم' }));

    await waitFor(() => expect(onSendInternalPdf).toHaveBeenCalledTimes(1));
    expect(onPrint).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('انتخاب قالب چاپ')).toBeInTheDocument();
  }, 10000);

  it('selects another template without duplicating the heavy preview node', async () => {
    setDesktopViewport();
    const user = userEvent.setup();
    const onSelectTemplate = vi.fn();

    render(
      <PrintSection
        isPrintModalOpen
        onClose={vi.fn()}
        onPrint={vi.fn()}
        printTemplates={templates}
        selectedTemplateId="custom:a4"
        onSelectTemplate={onSelectTemplate}
        renderPrintCard={() => <div data-testid="print-card">سند چاپی</div>}
        printMode={false}
      />
    );

    await user.click(await screen.findByText('قالب A5 تست'));

    expect(onSelectTemplate).toHaveBeenCalledWith('custom:a5');
    expect(screen.getAllByTestId('print-card')).toHaveLength(1);
  });
});
