import React from 'react';
import { App, ConfigProvider, Modal } from 'antd';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkflowConditionsGroup from './WorkflowConditionsGroup';
import { FieldType } from '../../types';

describe('WorkflowConditionsGroup', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses central relationOptions for synthetic assignee fields', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <ConfigProvider direction="rtl">
        <App>
          <WorkflowConditionsGroup
            value={[
              {
                id: 'cond-1',
                field: '__workflow_assignee',
                operator: 'eq',
                value: undefined,
              } as any,
            ]}
            onChange={onChange}
            fields={[
              {
                key: '__workflow_assignee',
                type: FieldType.SELECT,
                labels: { fa: 'مسئول' },
              } as any,
            ]}
            dynamicOptions={{}}
            relationOptions={{
              __workflow_assignee: [
                { label: 'عضو: علی رضایی', value: 'user_user-1' },
                { label: 'نقش: فروش', value: 'role_role-1' },
              ],
            }}
          />
        </App>
      </ConfigProvider>
    );

    const valueSelect = screen.getAllByRole('combobox')[2];
    await user.click(valueSelect);

    expect(await screen.findByText('عضو: علی رضایی')).toBeInTheDocument();
    expect(screen.getByText('نقش: فروش')).toBeInTheDocument();
  });

  it('renders workflow condition controls safely inside modal context', async () => {
    const onChange = vi.fn();

    render(
      <ConfigProvider direction="rtl">
        <App>
          <Modal open footer={null} onCancel={() => undefined}>
            <WorkflowConditionsGroup
              value={[
                {
                  id: 'cond-1',
                  field: 'status',
                  operator: 'eq',
                  value: undefined,
                } as any,
              ]}
              onChange={onChange}
              fields={[
                {
                  key: 'status',
                  type: FieldType.SELECT,
                  labels: { fa: 'وضعیت' },
                  options: [
                    { label: 'باز', value: 'open' },
                    { label: 'بسته', value: 'closed' },
                  ],
                } as any,
              ]}
              dynamicOptions={{}}
              relationOptions={{}}
            />
          </Modal>
        </App>
      </ConfigProvider>
    );

    expect(screen.getAllByRole('combobox')).toHaveLength(3);
  });

  it('uses mobile sheet mode for workflow condition values on small screens and commits single-select immediately', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 480 });
    const onChange = vi.fn();

    render(
      <ConfigProvider direction="rtl">
        <App>
          <WorkflowConditionsGroup
            value={[
              {
                id: 'cond-1',
                field: 'status',
                operator: 'eq',
                value: undefined,
              } as any,
            ]}
            onChange={onChange}
            fields={[
              {
                key: 'status',
                type: FieldType.SELECT,
                labels: { fa: 'وضعیت' },
                options: [
                  { label: 'باز', value: 'open' },
                  { label: 'بسته', value: 'closed' },
                ],
              } as any,
            ]}
            dynamicOptions={{}}
            relationOptions={{}}
          />
        </App>
      </ConfigProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'انتخاب مقدار' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'باز' }));

    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'تایید' })).not.toBeInTheDocument();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  }, 10000);
});
