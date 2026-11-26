import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import PersianDatePicker from './PersianDatePicker';

vi.mock('./AdaptivePickerSurface', () => ({
  default: ({ open, afterClose, onClose, onConfirm, children }: {
    open: boolean; afterClose?: () => void; onClose: () => void; onConfirm: () => void; children: React.ReactNode;
  }) => {
    React.useEffect(() => { if (!open) afterClose?.(); }, [open, afterClose]);
    return <div data-testid="picker-surface">
      {children}<button onClick={onConfirm}>تأیید آزمایشی</button><button onClick={onClose}>بستن آزمایشی</button>
    </div>;
  },
}));

it('mounts the optional time surface on demand and reads the current value on every open', () => {
  const onChange = vi.fn();
  const { rerender } = render(<PersianDatePicker type="TIME" value="08:30" onChange={onChange} mountOnOpen />);
  expect(screen.queryByTestId('picker-surface')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'انتخاب زمان' }));
  fireEvent.click(screen.getByRole('button', { name: 'تأیید آزمایشی' }));
  expect(onChange).toHaveBeenLastCalledWith('08:30');
  expect(screen.queryByTestId('picker-surface')).toBeNull();

  rerender(<PersianDatePicker type="TIME" value="16:45" onChange={onChange} mountOnOpen />);
  fireEvent.click(screen.getByRole('button', { name: 'انتخاب زمان' }));
  fireEvent.click(screen.getByRole('button', { name: 'تأیید آزمایشی' }));
  expect(onChange).toHaveBeenLastCalledWith('16:45');
});
