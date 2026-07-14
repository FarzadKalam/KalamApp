import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import MessagingSurfacePrototype from './MessagingSurfacePrototype';

describe('MessagingSurfacePrototype', () => {
  it('renders the omnichannel messaging v2 surface without mixing AI threads into messaging', () => {
    render(<MessagingSurfacePrototype />);

    expect(screen.getByTestId('messaging-v2-prototype')).toBeInTheDocument();
    expect(screen.getAllByText('پیام رسانی')[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText('باز کردن فهرست گفتگوها')[0]).toBeInTheDocument();
    expect(screen.queryByText('گروه فروش و پشتیبانی')).not.toBeInTheDocument();
    expect(screen.queryByText('دستیار هوش مصنوعی فروش')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ارسال پیام')).not.toBeInTheDocument();
  }, 15000);

  it('opens and closes the mobile full-screen conversation list', async () => {
    const user = userEvent.setup();
    render(<MessagingSurfacePrototype />);

    await user.click(screen.getAllByLabelText('باز کردن فهرست گفتگوها')[0]);
    expect(screen.getByText('گفتگوها')).toBeInTheDocument();

    await user.click(screen.getByLabelText('بستن فهرست گفتگوها'));
    expect(screen.queryByText('گفتگوها')).not.toBeInTheDocument();
  }, 15000);
});
