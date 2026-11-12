import React from 'react';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, planRows } = vi.hoisted(() => ({
  rpc: vi.fn(),
  planRows: [{ code: 'demo', title: 'نسخه آزمایشی کامل', is_demo_default: true, enabled_modules: { tasks: true }, enabled_features: { api_access: true } }],
}));
vi.mock('../../supabaseClient', () => ({ supabase: {
  rpc: (...args: any[]) => rpc(...args),
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: planRows, error: null }) }) }) }),
} }));
vi.mock('../../utils/saasAdminModules', () => ({ executeSaasModuleAction: vi.fn() }));
import SaasOrgAdminDrawer from './SaasOrgAdminDrawer';

const account = {
  plan: { code: 'demo', title: 'نسخه آزمایشی کامل' },
  management: { plan_code: 'demo', module_overrides: {}, feature_overrides: { webhooks: false, future_feature: true }, quota_adjustments: { webhooks: 2, future_quota: 3 } },
  access: { modules: { tasks: true }, features: { api_access: true, webhooks: false } },
};
beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (name: string) => ({ error: null, data:
    name === 'admin_get_saas_org_account' ? account :
    name === 'admin_get_saas_org_access' ? { planCode: 'demo', inheritedModules: { tasks: true }, inheritedFeatures: { api_access: true } } :
    name === 'admin_provision_demo_request_with_access' ? { success: true } : null,
  }));
});
afterEach(cleanup);

describe('SaaS organization access management', () => {
  it('saves only deliberate overrides and retains unknown features and quotas', async () => {
    render(<App><SaasOrgAdminDrawer open record={{ id: 'org-a', source_kind: 'org' }} onClose={vi.fn()} onChanged={vi.fn()} /></App>);
    const save = await screen.findByRole('button', { name: /ذخیره وضعیت حساب/ });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_update_saas_org_account', {
      p_org_id: 'org-a', p_plan_code: 'demo', p_module_overrides: {},
      p_feature_overrides: { webhooks: false, future_feature: true },
      p_quota_adjustments: { webhooks: 2, future_quota: 3 },
    }));
  });
  it('configures a request before one atomic provisioning call without querying it as an organization', async () => {
    render(<App><SaasOrgAdminDrawer open record={{ id: 'request-a', source_kind: 'request', request_id: 'request-a' }} onClose={vi.fn()} onChanged={vi.fn()} /></App>);
    const create = screen.getByRole('button', { name: /ایجاد سازمان از این درخواست/ });
    await waitFor(() => expect(create).toBeEnabled());
    expect(screen.getByText('پلن و دسترسی‌های سازمان جدید')).toBeInTheDocument();
    fireEvent.click(create);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_provision_demo_request_with_access', {
      p_request_id: 'request-a', p_plan_code: 'demo', p_module_overrides: {}, p_feature_overrides: {},
    }));
    expect(rpc.mock.calls.some(([name]) => name === 'admin_get_saas_org_account')).toBe(false);
  });
});
