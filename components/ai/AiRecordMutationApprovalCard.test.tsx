import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiRecordMutationApprovalCard from './AiRecordMutationApprovalCard';

vi.mock('../../moduleRegistry', () => ({
  MODULES: {
    marketing_leads: {
      fields: [
        { key: 'full_name', type: 'text', labels: { fa: 'نام کامل' } },
        { key: 'mobile', type: 'phone', labels: { fa: 'موبایل' } },
        { key: 'description', type: 'long_text', labels: { fa: 'توضیحات' } },
      ],
    },
  },
}));

vi.mock('../SmartFieldRenderer', () => ({
  default: ({ field, value, onChange }: any) => (
    <button type="button" onClick={() => onChange(`${String(value || '')}-ویرایش`)}>
      {field.labels.fa}: {String(value || 'خالی')}
    </button>
  ),
}));

describe('AiRecordMutationApprovalCard', () => {
  afterEach(cleanup);

  it('renders multi-record drafts without exposing raw record ids and edits fields inline', () => {
    const onChange = vi.fn();
    render(
      <AiRecordMutationApprovalCard
        actionType="update_record_from_prompt"
        moduleId="marketing_leads"
        schema={{ fields: [{ key: 'full_name' }, { key: 'mobile' }, { key: 'description' }] }}
        records={[
          { record_id: '11111111-1111-4111-8111-111111111111', record_title: 'لید آرمان', fields: { full_name: 'آرمان' } },
          { record_id: '22222222-2222-4222-8222-222222222222', record_title: 'لید بهار', fields: { full_name: 'بهار' } },
        ]}
        onChange={onChange}
      />,
    );

    expect(screen.getByText('رکورد ۱ از ۲')).toBeTruthy();
    expect(screen.queryByText('11111111-1111-4111-8111-111111111111')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /نام کامل: آرمان/ }));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ fields: { full_name: 'آرمان-ویرایش' } }),
      expect.objectContaining({ fields: { full_name: 'بهار' } }),
    ]);
  });

  it('shows untouched module fields only after the user enables the toggle', () => {
    render(
      <AiRecordMutationApprovalCard
        actionType="create_record_from_prompt"
        moduleId="marketing_leads"
        schema={{ fields: [{ key: 'full_name' }, { key: 'mobile' }, { key: 'description' }] }}
        records={[{ fields: { full_name: 'سارا' } }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText(/موبایل:/)).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: 'مشاهده دیگر فیلدها' }));
    expect(screen.getByText(/موبایل:/)).toBeTruthy();
    expect(screen.getByText(/توضیحات:/)).toBeTruthy();
  });
});
