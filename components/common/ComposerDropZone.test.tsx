import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ComposerDropZone from './ComposerDropZone';

describe('composer file drop', () => {
  it('shows feedback while the browser hides drag file objects, and accepts all dropped files once', () => {
    const onFiles = vi.fn(); const { container } = render(<ComposerDropZone onFiles={onFiles}><textarea /></ComposerDropZone>);
    const zone = container.firstElementChild!;
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'], files: [] } });
    expect(screen.getByText('فایل‌ها را اینجا رها کنید')).toBeVisible();
    const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files } });
    expect(onFiles).toHaveBeenCalledExactlyOnceWith(files);
    expect(screen.queryByText('فایل‌ها را اینجا رها کنید')).not.toBeInTheDocument();
  });
  it('ignores text drags and disabled composers', () => {
    const onFiles = vi.fn(); const { container } = render(<ComposerDropZone disabled onFiles={onFiles}>پیام</ComposerDropZone>);
    fireEvent.drop(container.firstElementChild!, { dataTransfer: { types: ['Files'], files: [new File(['a'], 'a.txt')] } });
    expect(onFiles).not.toHaveBeenCalled();
  });
});
