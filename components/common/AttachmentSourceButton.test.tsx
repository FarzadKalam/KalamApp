import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AttachmentSourceButton from './AttachmentSourceButton';

describe('attachment source menu', () => {
  it('offers device multi-selection separately from the application file manager', async () => {
    const onFilesSelected = vi.fn(); const onChooseExisting = vi.fn();
    render(<AttachmentSourceButton onFilesSelected={onFilesSelected} onChooseExisting={onChooseExisting} />);
    fireEvent.click(screen.getByRole('button', { name: 'افزودن پیوست' }));
    const input = screen.getByLabelText('انتخاب فایل از دستگاه') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined);
    fireEvent.click(await screen.findByRole('button', { name: 'آپلود از دستگاه' }));
    expect(click).toHaveBeenCalledOnce(); expect(onChooseExisting).not.toHaveBeenCalled();
    const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];
    fireEvent.change(input, { target: { files } });
    expect(onFilesSelected).toHaveBeenCalledWith(files);
    fireEvent.click(screen.getByRole('button', { name: 'افزودن پیوست' }));
    fireEvent.click(await screen.findByRole('button', { name: 'انتخاب از نرم‌افزار' }));
    expect(onChooseExisting).toHaveBeenCalledOnce();
  });
});
