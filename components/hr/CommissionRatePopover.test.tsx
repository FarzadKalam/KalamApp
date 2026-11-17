import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CommissionRatePopover from './CommissionRatePopover';
import type { CommissionDraftLine } from '../../utils/commissionRuntime';

const line = { product_label: 'تابلوی آزمایشی', product_id: 'product', product_module: 'billboards', commission_percent: 0,
  commission_rate_missing: true } as CommissionDraftLine;

describe('commission rate editor', () => {
  it('requires a separate choice for the product default and retains failed input for retry', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('ذخیره مجاز نیست')).mockResolvedValue(undefined);
    render(<CommissionRatePopover line={line} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'مشاهده پورسانت تابلوی آزمایشی' }));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال درصد' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(5, false));
    expect(await screen.findByText('ذخیره مجاز نیست')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'اعمال درصد' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(5, true));
  });
});
