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
    vi.useRealTimers();
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

  it('places the print modal above the modal that opened it', async () => {
    setDesktopViewport();

    render(
      <PrintSection
        isPrintModalOpen
        onClose={vi.fn()}
        onPrint={vi.fn()}
        printTemplates={templates}
        selectedTemplateId="custom:a4"
        onSelectTemplate={vi.fn()}
        renderPrintCard={() => <div data-testid="print-card">سند چاپی</div>}
        printMode={false}
        modalZIndex={14100}
      />
    );

    await screen.findByText('انتخاب قالب چاپ');
    const modalWrap = document.querySelector('.print-select-modal .ant-modal-wrap') as HTMLElement | null;
    const modalMask = document.querySelector('.print-select-modal .ant-modal-mask') as HTMLElement | null;
    expect(modalWrap?.style.zIndex).toBe('14101');
    expect(modalMask?.style.zIndex).toBe('14100');
  });

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

  it('labels an explicit empty field selection as none, never all', async () => {
    setDesktopViewport();

    render(
      <PrintSection
        isPrintModalOpen
        onClose={vi.fn()}
        onPrint={vi.fn()}
        printTemplates={templates}
        selectedTemplateId="custom:a4"
        onSelectTemplate={vi.fn()}
        renderPrintCard={() => <div data-testid="print-card">سند چاپی</div>}
        printMode={false}
        allowFieldSelectionTab
        printableFields={[{ key: 'record.description', labels: { fa: 'توضیحات' }, hasValue: true }]}
        selectedPrintFields={{ 'custom:a4': [] }}
      />
    );

    expect(await screen.findByText('فیلدهای قابل چاپ (هیچ‌کدام)')).toBeInTheDocument();
    expect(screen.queryByText('فیلدهای قابل چاپ (همه)')).not.toBeInTheDocument();
  });

  it('removes the modal portal after cancel so it cannot block page clicks', async () => {
    setDesktopViewport();
    const user = userEvent.setup();

    const ControlledPrintSection = () => {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <button type="button">دکمه پشت مودال</button>
          <PrintSection
            isPrintModalOpen={open}
            onClose={() => setOpen(false)}
            onPrint={vi.fn()}
            printTemplates={templates}
            selectedTemplateId="custom:a4"
            onSelectTemplate={vi.fn()}
            renderPrintCard={() => <div data-testid="print-card">سند چاپی</div>}
            printMode={false}
          />
        </>
      );
    };

    render(<ControlledPrintSection />);

    await user.click(await screen.findByRole('button', { name: 'انصراف' }));

    await waitFor(() => {
      expect(screen.queryByText('انتخاب قالب چاپ')).not.toBeInTheDocument();
      expect(document.querySelector('.print-select-modal .ant-modal-wrap')).toBeNull();
      expect(document.querySelector('.print-select-modal .ant-modal-mask')).toBeNull();
    });

    expect(screen.getByRole('button', { name: 'دکمه پشت مودال' })).toBeInTheDocument();
  });

  it('still triggers print after closing when the section unmounts immediately', async () => {
    setDesktopViewport();
    const user = userEvent.setup();
    const onPrint = vi.fn();

    const ControlledPrintSection = () => {
      const [open, setOpen] = React.useState(true);
      return open ? (
        <PrintSection
          isPrintModalOpen
          onClose={() => setOpen(false)}
          onPrint={onPrint}
          printTemplates={templates}
          selectedTemplateId="custom:a4"
          onSelectTemplate={vi.fn()}
          renderPrintCard={() => <div data-testid="print-card">سند چاپی</div>}
          printMode={false}
        />
      ) : null;
    };

    render(<ControlledPrintSection />);

    await user.click(await screen.findByRole('button', { name: 'چاپ' }));

    await waitFor(() => {
      expect(screen.queryByText('انتخاب قالب چاپ')).not.toBeInTheDocument();
      expect(onPrint).toHaveBeenCalledTimes(1);
    });
  });

  it('uses the generated final PDF for preview instead of a separate React layout', async () => {
    setDesktopViewport();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:final-print-preview');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const onGenerateFinalPdfPreview = vi.fn(async (onProgress) => {
      onProgress({ percent: 60, label: 'در حال ساخت PDF نهایی…' });
      return { blob: new Blob(['%PDF-final-preview']) };
    });

    try {
      render(
        <PrintSection
          isPrintModalOpen
          onClose={vi.fn()}
          onPrint={vi.fn()}
          onGenerateFinalPdfPreview={onGenerateFinalPdfPreview}
          printTemplates={templates}
          selectedTemplateId="custom:a4"
          onSelectTemplate={vi.fn()}
          renderPrintCard={() => <div data-testid="print-card">پیش‌نمایش قدیمی</div>}
          printMode={false}
        />
      );

      await waitFor(() => expect(onGenerateFinalPdfPreview).toHaveBeenCalledTimes(1));
      const finalPdfFrame = await screen.findByTitle('پیش‌نمایش نهایی PDF');
      expect(finalPdfFrame).toHaveAttribute('src', 'blob:final-print-preview');
      expect(screen.queryByTestId('print-card')).not.toBeInTheDocument();
      expect(screen.getByText('PDF نهایی')).toBeInTheDocument();
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
    }
  });

  it('groups printable fields by section and marks empty values', async () => {
    setDesktopViewport();
    const user = userEvent.setup();

    render(
      <PrintSection
        isPrintModalOpen
        onClose={vi.fn()}
        onPrint={vi.fn()}
        printTemplates={[
          {
            id: 'custom:test',
            title: 'قالب تست',
            description: 'توضیحات',
          },
        ]}
        selectedTemplateId="custom:test"
        onSelectTemplate={vi.fn()}
        renderPrintCard={() => <div data-testid="print-card">سند چاپی</div>}
        printMode={false}
        allowFieldSelectionTab
        printableFields={[
          { key: 'name', labels: { fa: 'عنوان' }, group: 'فیلدهای عمومی', hasValue: true },
          { key: 'width', labels: { fa: 'طول' }, group: 'بخش: اطلاعات پایه', hasValue: true },
          { key: 'address', labels: { fa: 'آدرس کامل' }, group: 'بخش: اطلاعات پایه', hasValue: false },
        ]}
        selectedPrintFields={{ 'custom:test': ['name', 'width'] }}
      />
    );

    await user.click(await screen.findByRole('tab', { name: /فیلدهای قابل چاپ/i }));

    expect(await screen.findByText('فیلدهای عمومی')).toBeInTheDocument();
    expect(screen.getByText('بخش: اطلاعات پایه')).toBeInTheDocument();
    expect(screen.getByText('بدون مقدار')).toBeInTheDocument();
    expect(screen.getByText('آدرس کامل')).toBeInTheDocument();
  });

  it('renders and changes image display mode for print templates with images', async () => {
    setDesktopViewport();
    const user = userEvent.setup();
    const onChangeImageDisplayMode = vi.fn();

    render(
      <PrintSection
        isPrintModalOpen
        onClose={vi.fn()}
        onPrint={vi.fn()}
        printTemplates={[{ id: 'custom:test', title: 'قالب تست', description: 'توضیحات' }]}
        selectedTemplateId="custom:test"
        onSelectTemplate={vi.fn()}
        renderPrintCard={() => <div data-testid="print-card">سند چاپی</div>}
        printMode={false}
        allowFieldSelectionTab
        showImageDisplayModeControl
        imageDisplayMode="fit"
        onChangeImageDisplayMode={onChangeImageDisplayMode}
        printableFields={[
          { key: 'image_url', labels: { fa: 'تصویر' }, group: 'فیلدهای عمومی', hasValue: true },
        ]}
        selectedPrintFields={{ 'custom:test': ['image_url'] }}
      />
    );

    await user.click(await screen.findByRole('tab', { name: /فیلدهای قابل چاپ/i }));
    expect(await screen.findByText('نوع نمایش تصویر')).toBeInTheDocument();

    await user.click(screen.getByText('اندازه واقعی'));

    expect(onChangeImageDisplayMode).toHaveBeenCalledWith('custom:test', 'actual');
  });
});
