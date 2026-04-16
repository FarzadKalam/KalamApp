import React from 'react';
import { App, ConfigProvider } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockType, FieldLocation, FieldType } from '../types';

const makeSupabaseQuery = (result: any = { data: [], error: null }) => {
  const query: any = {};
  [
    'select',
    'eq',
    'neq',
    'in',
    'is',
    'or',
    'order',
    'limit',
    'single',
    'maybeSingle',
    'insert',
    'update',
    'upsert',
    'delete',
  ].forEach((method) => {
    query[method] = vi.fn(() => query);
  });
  query.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return query;
};

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => makeSupabaseQuery()),
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'current-user' } }, error: null })),
    },
  },
}));

vi.mock('../utils/permissions', () => ({
  fetchCurrentUserRoleContext: vi.fn(async () => ({
    roleId: 'admin',
    permissions: {},
  })),
}));

vi.mock('../utils/referenceData', () => ({
  fetchAssigneeDirectory: vi.fn(async () => ({ users: [], roles: [] })),
  fetchDynamicOptionsMap: vi.fn(async () => ({})),
  fetchFormulaOptions: vi.fn(async () => ({})),
}));

vi.mock('../utils/relationOptions', () => ({
  fetchRelationOptionsForField: vi.fn(async () => []),
}));

vi.mock('../utils/sessionCache', () => ({
  getCachedAuthUser: vi.fn(async () => ({ id: 'current-user' })),
}));

vi.mock('../utils/channelSettings', () => ({
  ACTIVE_NOTIFICATION_BOTS_CATEGORY: '__active_notification_bots__',
  listActiveNotificationBotOptions: vi.fn(async () => []),
}));

vi.mock('../utils/moduleOptionSnapshot', () => ({
  mergeOptionLists: (...lists: any[][]) => lists.flat().filter(Boolean),
  mergeOptionMaps: (...maps: any[]) => Object.assign({}, ...maps.filter(Boolean)),
  readModuleOptionSnapshot: vi.fn(() => null),
  writeModuleOptionSnapshot: vi.fn(),
}));

vi.mock('./SmartFieldRenderer', () => ({
  default: ({ field, value, onChange }: any) => (
    <input
      aria-label={field?.labels?.fa || field?.key}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  ),
}));

vi.mock('./EditableTable.tsx', () => ({
  default: () => <div data-testid="editable-table" />,
}));

vi.mock('./GridTable', () => ({
  default: () => <div data-testid="grid-table" />,
}));

vi.mock('./SmartTableRenderer', () => ({
  default: () => <div data-testid="smart-table-renderer" />,
}));

vi.mock('./SummaryCard', () => ({
  default: () => <div data-testid="summary-card" />,
}));

vi.mock('./ProductionStagesField', () => ({
  default: () => <div data-testid="production-stages-field" />,
}));

import SmartForm from './SmartForm';

const buildLargeModule = () => ({
  id: 'critical_smart_form',
  table: 'critical_smart_form',
  titles: { fa: 'فرم تست', faSingular: 'رکورد تست' },
  fields: Array.from({ length: 90 }, (_, index) => ({
    key: `field_${index}`,
    type: FieldType.TEXT,
    labels: { fa: `فیلد فارسی ${index}` },
    location: FieldLocation.BLOCK,
    blockId: 'main',
    order: index,
  })),
  blocks: [
    {
      id: 'main',
      type: BlockType.FIELD_GROUP,
      titles: { fa: 'اطلاعات اصلی' },
      order: 1,
    },
  ],
});

const renderSmartForm = (initialValues: Record<string, any> = {
  field_0: 'مقدار اولیه',
  field_5: 'متن فارسی',
}) => render(
  <ConfigProvider direction="rtl">
    <App>
      <SmartForm
        module={buildLargeModule() as any}
        visible
        onCancel={vi.fn()}
        onSave={vi.fn()}
        displayMode="embedded"
        initialValues={initialValues}
      />
    </App>
  </ConfigProvider>
);

describe('SmartForm critical render', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a large Persian form without crashing or losing initial values', async () => {
    const startedAt = performance.now();
    renderSmartForm();

    expect(await screen.findByText('افزودن رکورد تست جدید')).toBeInTheDocument();
    expect(screen.getByText('اطلاعات اصلی')).toBeInTheDocument();
    expect(screen.getByLabelText('فیلد فارسی 0')).toHaveValue('مقدار اولیه');
    expect(screen.getByLabelText('فیلد فارسی 5')).toHaveValue('متن فارسی');
    expect(screen.getByLabelText('فیلد فارسی 89')).toBeInTheDocument();

    await waitFor(() => {
      expect(performance.now() - startedAt).toBeLessThan(5000);
    });
  });

  it('keeps typed values when the parent re-renders with equivalent initial values', async () => {
    const { rerender } = render(
      <ConfigProvider direction="rtl">
        <App>
          <SmartForm
            module={buildLargeModule() as any}
            visible
            onCancel={vi.fn()}
            onSave={vi.fn()}
            displayMode="embedded"
            initialValues={{}}
          />
        </App>
      </ConfigProvider>
    );

    const field = await screen.findByLabelText('فیلد فارسی 0');
    fireEvent.change(field, { target: { value: 'مقدار تایپ شده' } });

    rerender(
      <ConfigProvider direction="rtl">
        <App>
          <SmartForm
            module={buildLargeModule() as any}
            visible
            onCancel={vi.fn()}
            onSave={vi.fn()}
            displayMode="embedded"
            initialValues={{}}
          />
        </App>
      </ConfigProvider>
    );

    expect(screen.getByLabelText('فیلد فارسی 0')).toHaveValue('مقدار تایپ شده');
  });
});
