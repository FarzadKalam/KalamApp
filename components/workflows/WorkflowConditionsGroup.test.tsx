import React from 'react';
import { App, ConfigProvider } from 'antd';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import WorkflowConditionsGroup from './WorkflowConditionsGroup';
import { FieldType } from '../../types';

describe('WorkflowConditionsGroup', () => {
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
});
