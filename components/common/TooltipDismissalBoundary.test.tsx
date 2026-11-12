import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Modal, Popover, Tooltip } from 'antd';
import TooltipDismissalBoundary from './TooltipDismissalBoundary';

afterEach(cleanup);

const Example = () => {
  const [open, setOpen] = useState(false);
  return <>
    <TooltipDismissalBoundary />
    <Tooltip title="راهنمای دکمه" mouseEnterDelay={0} mouseLeaveDelay={0}>
      <button onClick={() => setOpen(true)}>بازکردن پنجره</button>
    </Tooltip>
    <Modal open={open} onCancel={() => setOpen(false)} title="پنجرهٔ نمونه" footer={null}>
      <Tooltip title="راهنمای داخل پنجره" mouseEnterDelay={0}>
        <button>دکمهٔ داخل پنجره</button>
      </Tooltip>
    </Modal>
  </>;
};

describe('TooltipDismissalBoundary', () => {
  it('closes an icon hover hint when its click opens a modal, while modal hints still work', async () => {
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'بازکردن پنجره' });
    fireEvent.mouseEnter(trigger);
    await waitFor(() => expect(trigger).toHaveClass('ant-tooltip-open'));
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    await screen.findByText('پنجرهٔ نمونه');
    await waitFor(() => expect(trigger).not.toHaveClass('ant-tooltip-open'));
    const inside = screen.getByRole('button', { name: 'دکمهٔ داخل پنجره' });
    fireEvent.mouseEnter(inside);
    await waitFor(() => expect(inside).toHaveClass('ant-tooltip-open'));
  });

  it('leaves click popovers usable', async () => {
    render(<><TooltipDismissalBoundary /><Popover trigger="click" content="محتوای منو"><button>بازکردن منو</button></Popover></>);
    const trigger = screen.getByRole('button', { name: 'بازکردن منو' });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    await screen.findByText('محتوای منو');
    expect(trigger).toHaveClass('ant-popover-open');
  });

  it('closes a hover popover when its trigger opens a modal', async () => {
    const HoverExample = () => {
      const [open, setOpen] = useState(false);
      return <><TooltipDismissalBoundary />
        <Popover trigger="hover" content="راهنمای شناور"><button onClick={() => setOpen(true)}>بازکردن جزئیات</button></Popover>
        <Modal open={open} onCancel={() => setOpen(false)} title="جزئیات" footer={null} />
      </>;
    };
    render(<HoverExample />);
    const trigger = screen.getByRole('button', { name: 'بازکردن جزئیات' });
    fireEvent.mouseEnter(trigger);
    await waitFor(() => expect(trigger).toHaveClass('ant-popover-open'));
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    await screen.findByText('جزئیات');
    await waitFor(() => expect(trigger).not.toHaveClass('ant-popover-open'));
  });
});
