import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WizardStepCards from './WizardStepCards';

const ITEMS = [
  { key: 'basics', title: 'مشخصات کمپین' },
  { key: 'audience', title: 'مخاطبان و شرط‌ها' },
  { key: 'tools', title: 'تنظیمات ابزارها' },
  { key: 'dashboard', title: 'داشبورد کمپین' },
];

afterEach(cleanup);

describe('WizardStepCards', () => {
  it('renders the report-builder card contract in a compact mobile grid', () => {
    const { container } = render(
      <WizardStepCards items={ITEMS} currentIndex={1} onChange={() => undefined} />,
    );

    expect(screen.getByRole('button', { name: 'مرحله ۲: مخاطبان و شرط‌ها' }))
      .toHaveAttribute('aria-current', 'step');
    expect(container.firstElementChild).toHaveStyle({ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' });
    expect(screen.getByText('مشخصات کمپین').className).toContain('text-[10px]');
  });

  it('changes stages only when the target card is enabled', () => {
    const onChange = vi.fn();
    render(
      <WizardStepCards
        items={ITEMS}
        currentIndex={0}
        onChange={onChange}
        canChange={(index) => index !== 3}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'مرحله ۳: تنظیمات ابزارها' }));
    fireEvent.click(screen.getByRole('button', { name: 'مرحله ۴: داشبورد کمپین' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2, ITEMS[2]);
  });
});
