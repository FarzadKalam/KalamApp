import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdaptiveSelectField from './AdaptiveSelectField';

describe('AdaptiveSelectField', () => {
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
});
