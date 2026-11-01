import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CalendarDayEvents from './CalendarDayEvents';

describe('calendar day overflow', () => {
  it('toggles all events in place without opening the day or a parent record', () => {
    const parent = vi.fn();
    render(<div onClick={parent}><CalendarDayEvents items={[1,2,3,4,5]} renderItem={(item) => <div key={item}>فعالیت {item}</div>} /></div>);
    expect(screen.queryByText('فعالیت 5')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+۲ مورد دیگر' }));
    expect(screen.getByText('فعالیت 5')).toBeVisible();
    expect(screen.getByRole('button', { name: 'نمایش کمتر' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'نمایش کمتر' }));
    expect(screen.queryByText('فعالیت 5')).not.toBeInTheDocument();
    expect(parent).not.toHaveBeenCalled();
  });
});
