import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ProductWooSyncTable from './ProductWooSyncTable';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../supabaseClient', () => ({ supabase: { functions: { invoke } } }));

afterEach(() => {
  cleanup();
  invoke.mockReset();
});

const overview = {
  stores: [{ id: 'store-a', name: 'فروشگاه الف' }],
  status: {
    connectionId: 'store-a', connectionName: 'فروشگاه الف', status: 'conflict', policy: 'manual',
    hasDraft: true, localHash: 'app-revision', remoteHash: 'woo-revision', changedFields: ['title'],
    app: { title: 'عنوان اپ' }, site: { title: 'عنوان فروشگاه' },
  },
  events: [], total: 0,
};

it('shows both versions and sends the confirmed direction with the compared revisions', async () => {
  const onReceived = vi.fn(async () => {});
  invoke.mockImplementation(async (_name, { body }) => body.action === 'sync_product_content'
    ? { data: { success: true, historySaved: true, result: { status: 'succeeded', baselineSaved: true } } }
    : { data: overview });
  render(<App><ProductWooSyncTable orgId="org-a" productId="product-a" canEdit
    hasUnsavedChanges={false} saving={false} onReceived={onReceived} onBusyChange={vi.fn()} /></App>);

  expect(await screen.findByText('تغییر در هر دو سمت')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'دریافت از فروشگاه' }));
  const confirmation = await screen.findByRole('dialog');
  expect(within(confirmation).getByText('عنوان اپ')).toBeInTheDocument();
  expect(within(confirmation).getByText('عنوان فروشگاه')).toBeInTheDocument();
  fireEvent.click(within(confirmation).getByRole('button', { name: 'دریافت از فروشگاه' }));
  await waitFor(() => expect(onReceived).toHaveBeenCalledOnce());
  expect(invoke).toHaveBeenCalledWith('external-connectors', { body: {
    action: 'sync_product_content', orgId: 'org-a', localId: 'product-a', id: 'store-a',
    direction: 'from_site', localHash: 'app-revision', remoteHash: 'woo-revision',
  } });
});

it('shows the comparison for read-only users and blocks transfer', async () => {
  invoke.mockResolvedValue({ data: overview });
  render(<App><ProductWooSyncTable orgId="org-a" productId="product-a" canEdit={false}
    hasUnsavedChanges={false} saving={false} onReceived={vi.fn()} onBusyChange={vi.fn()} /></App>);
  expect(await screen.findByText('تغییر در هر دو سمت')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ارسال به فروشگاه' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'دریافت از فروشگاه' })).toBeDisabled();
});
