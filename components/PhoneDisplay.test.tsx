import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PhoneDisplay from './PhoneDisplay';

describe('PhoneDisplay', () => {
  it('keeps compact phone values on one row with content-sized country code', () => {
    const { container } = render(<PhoneDisplay value="+989121234567" size="sm" />);

    const wrapper = container.firstElementChild as HTMLElement;
    const countryCode = screen.getByText('+۹۸');
    const nationalNumber = screen.getByText('۰۹۱۲۱۲۳۴۵۶۷');

    expect(wrapper.className).toContain('grid-cols-[max-content_minmax(0,1fr)]');
    expect(wrapper.className).toContain('min-w-0');
    expect(countryCode.className).toContain('w-max');
    expect(countryCode.className).toContain('min-w-0');
    expect(nationalNumber.className).toContain('whitespace-nowrap');
    expect(nationalNumber.className).toContain('truncate');
    expect(nationalNumber.className).not.toContain('break-all');
  });
});
