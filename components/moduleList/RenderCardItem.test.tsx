import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RenderCardItem from './RenderCardItem';
import { FieldType } from '../../types';

vi.mock('../../moduleRegistry', () => ({ MODULES: {} }));
vi.mock('../../supabaseClient', () => ({ supabase: {} }));
vi.mock('../common/AssigneeAvatarDisplay', () => ({ default: () => null }));
vi.mock('../recordLocks/RecordLockControl', () => ({ default: () => null }));
vi.mock('./RelatedActivityIndicators', () => ({ default: () => null }));

afterEach(cleanup);
const config = { id: 'marketing_leads', titles: { fa: 'لیدها' }, relatedTabs: [], fields: [
  { key: 'name', isKey: true, type: FieldType.TEXT, labels: { fa: 'عنوان' } },
  { key: 'status', type: FieldType.STATUS, labels: { fa: 'وضعیت' }, options: [{ value: 'new', label: 'جدید' }] },
] };

describe('card status badge', () => {
  it('omits the redundant badge in status-grouped kanban while preserving it in other views', () => {
    const props = { item: { id: 'lead', name: 'سرنخ آزمایشی', status: 'new' }, moduleId: 'marketing_leads', moduleConfig: config,
      statusField: 'status', minimal: true, kanbanCompact: true, selectedRowKeys: [], setSelectedRowKeys: vi.fn(), navigate: vi.fn() };
    const { rerender } = render(<RenderCardItem {...props} hideStatusBadge />);
    expect(screen.getByText('سرنخ آزمایشی')).toBeTruthy();
    expect(screen.queryByText('جدید')).toBeNull();
    rerender(<RenderCardItem {...props} hideStatusBadge={false} />);
    expect(screen.getByText('جدید')).toBeTruthy();
  });
});
