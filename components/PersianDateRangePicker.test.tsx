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

  it('renders placeholder when no range is selected', () => {
    render(
      <PersianDateRangePicker
        value={[null, null]}
        placeholder="بازه زمانی"
        pickerTitle="انتخاب بازه زمانی"
      />
    );

    expect(screen.getByRole('button', { name: 'انتخاب بازه زمانی' })).toHaveTextContent('بازه زمانی');
  });

  it('does not interpret jalali range values as gregorian dates', () => {
    render(
      <PersianDateRangePicker
        value={['1405/01/01', '1405/01/31']}
        placeholder="بازه زمانی"
        pickerTitle="انتخاب بازه زمانی"
      />
    );

    const trigger = screen.getByRole('button', { name: 'انتخاب بازه زمانی' });
    expect(trigger).toHaveTextContent('۱۴۰۵/۰۱/۰۱');
    expect(trigger).toHaveTextContent('۱۴۰۵/۰۱/۳۱');
    expect(trigger).not.toHaveTextContent('۷۸۳');
  });
});
