import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PersianDateRangePicker from './PersianDateRangePicker';

describe('PersianDateRangePicker', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the selected range text in the trigger', () => {
    render(
      <PersianDateRangePicker
        value={['2026-04-01', '2026-04-30']}
        placeholder="بازه زمانی"
        pickerTitle="انتخاب بازه زمانی"
      />
    );

    const trigger = screen.getByRole('button', { name: 'انتخاب بازه زمانی' });
    expect(trigger).toHaveTextContent('تا');
    expect(trigger).not.toHaveTextContent('بازه زمانی');
  });
});
