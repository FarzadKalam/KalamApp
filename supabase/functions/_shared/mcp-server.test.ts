// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  computePkceS256Challenge,
  detectMcpClientKind,
  isAllowedMcpRedirectUri,
  normalizeScopes,
  verifyPkceS256,
} from './mcp-oauth';
import {
  executeMcpTool,
  getMcpToolsDefinition,
  handleMcpJsonRpcMessage,
  type McpAuthContext,
  type McpStorageAdapter,
} from './mcp-runtime';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000009';
const ROLE_ID = '00000000-0000-4000-8000-000000000003';
const SUB_USER_ID = '00000000-0000-4000-8000-000000000004';
const RECORD_ID = '00000000-0000-4000-8000-000000000010';
const OTHER_RECORD_ID = '00000000-0000-4000-8000-000000000011';

const makeAuth = (overrides: Partial<McpAuthContext> = {}): McpAuthContext => ({
  orgId: ORG_ID,
  orgName: 'شرکت نمونه تازه‌سیستم',
  userId: USER_ID,
  userName: 'سارا محمدی',
  userEmail: 'sara@example.com',
  roleId: ROLE_ID,
  roleName: 'کارشناس فروش',
  softwareRole: 'member',
  isOwner: false,
  permissions: {
    customers: {
      view: true,
      create: true,
      edit: true,
      delete: false,
      record_scope: 'all',
      fields: { mobile_2: false },
      field_actions: {
        email: { view: false },
        credit_limit: { view: true, create: false, edit: false, delete: false },
        first_name: { view: true, create: true, edit: true, delete: false },
      },
    },
    invoices: {
      view: false,
    },
  },
  allowedRoleIds: [ROLE_ID],
  allowedUserIds: [USER_ID, SUB_USER_ID],
  planContext: {
    available: true,
    isReadonly: false,
    features: {
      mcp_access: true,
      api_access: true,
    },
    enabledModules: {
      customers: true,
      products: true,
      invoices: true,
      tasks: false,
    },
    moduleOverrides: {},
  },
  scopes: ['mcp:read', 'mcp:write'],
  isReadonlyOrg: false,
  moduleSettings: {},
  ...overrides,
});

const makeStorage = (overrides: Partial<McpStorageAdapter> = {}): McpStorageAdapter => ({
  select: vi.fn(async () => []),
  count: vi.fn(async () => 0),
  insert: vi.fn(async (_table, rows) => rows.map((row, idx) => ({ id: RECORD_ID, system_code: `C-${idx + 1}`, ...row }))),
  patch: vi.fn(async (_table, _params, payload) => [{ id: RECORD_ID, org_id: ORG_ID, ...payload }]),
  remove: vi.fn(async () => [{ id: RECORD_ID }]),
  upsert: vi.fn(async (_table, rows) => rows),
  ...overrides,
});

describe('mcp-oauth helpers', () => {
  it('validates official ChatGPT/Codex, Gemini, Claude, and localhost CLI redirect URIs while rejecting unsafe URIs', () => {
    expect(isAllowedMcpRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
    expect(isAllowedMcpRedirectUri('https://platform.openai.com/apps-manage/oauth')).toBe(true);
    expect(isAllowedMcpRedirectUri('https://oauth-redirect.googleusercontent.com/r/project-1')).toBe(true);
    expect(isAllowedMcpRedirectUri('https://vertexaisearch.cloud.google.com/oauth-callback')).toBe(true);
    expect(isAllowedMcpRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowedMcpRedirectUri('http://127.0.0.1:43210/callback')).toBe(true);
    expect(isAllowedMcpRedirectUri('http://localhost:8085/oauth/cb')).toBe(true);

    expect(isAllowedMcpRedirectUri('https://evil.example.com/callback')).toBe(false);
    expect(isAllowedMcpRedirectUri('http://chatgpt.com/callback')).toBe(false);
    expect(isAllowedMcpRedirectUri('http://192.168.1.50:8080/callback')).toBe(false);
    expect(isAllowedMcpRedirectUri('https://user:pass@claude.ai/cb')).toBe(false);
    expect(isAllowedMcpRedirectUri('https://claude.ai/cb#fragment')).toBe(false);
  });

  it('verifies PKCE S256 challenges and detects client priorities', async () => {
    const verifier = 'a_valid_pkce_code_verifier_string_with_over_43_chars_12345';
    const challenge = await computePkceS256Challenge(verifier);
    expect(await verifyPkceS256(verifier, challenge)).toBe(true);
    expect(await verifyPkceS256('wrong_verifier_of_sufficient_length_123456789012345', challenge)).toBe(false);
    expect(await verifyPkceS256('short', challenge)).toBe(false);

    expect(detectMcpClientKind('OpenAI Codex CLI')).toBe('codex');
    expect(detectMcpClientKind('Custom', ['https://chatgpt.com/callback'])).toBe('chatgpt');
    expect(detectMcpClientKind('Google Gemini', ['https://oauth-redirect.googleusercontent.com/r/1'])).toBe('gemini');
    expect(detectMcpClientKind('Claude', ['https://claude.ai/api/mcp/auth_callback'])).toBe('claude');
    expect(detectMcpClientKind('My Tool')).toBe('custom');
    expect(normalizeScopes('unknown mcp:read')).toEqual(['mcp:read']);
  });

  it('builds RFC 9728 and RFC 8414 discovery payloads', () => {
    const base = 'https://api.tazesystem.ir/functions/v1/mcp-server';
    expect(buildProtectedResourceMetadata(base)).toMatchObject({
      resource: base,
      authorization_servers: [base],
      scopes_supported: ['mcp:read', 'mcp:write'],
    });
    expect(buildAuthorizationServerMetadata(base)).toMatchObject({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      code_challenge_methods_supported: ['S256'],
    });
  });
});

describe('mcp-runtime authorization and protocol', () => {
  it('denies execution when mcp_access plan feature is disabled', async () => {
    const auth = makeAuth({
      planContext: { available: true, features: { mcp_access: false }, enabledModules: { customers: true } },
    });
    await expect(executeMcpTool(auth, makeStorage(), 'list_modules', {})).rejects.toThrow('mcp_access'.length ? 'فعال نیست' : '');
  });

  it('exposes read-only tools when org is readonly or token lacks mcp:write', () => {
    const readOnlyTokenTools = getMcpToolsDefinition(makeAuth({ scopes: ['mcp:read'] })).map((t) => t.name);
    expect(readOnlyTokenTools).toContain('query_records');
    expect(readOnlyTokenTools).not.toContain('create_record');

    const readonlyOrgTools = getMcpToolsDefinition(makeAuth({ isReadonlyOrg: true })).map((t) => t.name);
    expect(readonlyOrgTools).not.toContain('update_record');
  });

  it('intersects plan modules with user permissions and strips blocked system modules', async () => {
    const auth = makeAuth();
    const listed = await executeMcpTool(auth, makeStorage(), 'list_modules', {});
    const moduleIds = listed.modules.map((m: any) => m.moduleId);
    expect(moduleIds).toContain('customers');
    // Denied by role permission
    expect(moduleIds).not.toContain('invoices');
    // Enabled in plan, omitted from non-owner role permissions -> denied
    expect(moduleIds).not.toContain('products');
    // Blocked system modules never exposed
    expect(moduleIds).not.toContain('profiles');
    expect(moduleIds).not.toContain('org_api_tokens');
  });

  it('grants fallback module access to org owners unless explicitly denied', async () => {
    const ownerAuth = makeAuth({
      isOwner: true,
      permissions: { invoices: { view: false } },
    });
    const listed = await executeMcpTool(ownerAuth, makeStorage(), 'list_modules', {});
    const moduleIds = listed.modules.map((m: any) => m.moduleId);
    expect(moduleIds).toContain('customers');
    expect(moduleIds).toContain('products');
    expect(moduleIds).not.toContain('invoices');
  });

  it('strips sensitive and role-hidden fields on get_record and enforces record_scope', async () => {
    const auth = makeAuth({
      permissions: {
        customers: {
          view: true,
          record_scope: 'own',
          fields: { mobile_2: false },
          field_actions: { email: { view: false } },
        },
      },
    });
    const storage = makeStorage({
      select: vi.fn(async (_table, params) => {
        if (params.id === `eq.${RECORD_ID}`) {
          return [{
            id: RECORD_ID,
            org_id: ORG_ID,
            assignee_type: 'user',
            assignee_id: USER_ID,
            first_name: 'علی',
            last_name: 'رضایی',
            mobile_1: '09120000000',
            mobile_2: '09129999999',
            email: 'hidden@example.com',
            webhook_secret: 'should_never_leak',
          }];
        }
        return [{
          id: OTHER_RECORD_ID,
          org_id: ORG_ID,
          assignee_type: 'user',
          assignee_id: OTHER_USER_ID,
          first_name: 'دیگر',
        }];
      }),
    });

    const res = await executeMcpTool(auth, storage, 'get_record', { moduleId: 'customers', id: RECORD_ID });
    expect(res.record.first_name).toBe('علی');
    expect(res.record.mobile_2).toBeUndefined();
    expect(res.record.email).toBeUndefined();
    expect(res.record.webhook_secret).toBeUndefined();

    await expect(
      executeMcpTool(auth, storage, 'get_record', { moduleId: 'customers', id: OTHER_RECORD_ID }),
    ).rejects.toThrow('محدودهٔ دسترسی');
  });

  it('enforces field create/edit/delete permissions and explicit delete permission on mutations', async () => {
    const auth = makeAuth();
    const storage = makeStorage({
      select: vi.fn(async (table) => {
        if (table === 'dynamic_options') return [];
        return [{
          id: RECORD_ID,
          org_id: ORG_ID,
          assignee_type: 'user',
          assignee_id: USER_ID,
          first_name: 'الهام',
          last_name: 'کاظمی',
        }];
      }),
    });

    // Denied credit_limit create
    await expect(
      executeMcpTool(auth, storage, 'create_record', {
        moduleId: 'customers',
        fields: { first_name: 'مریم', last_name: 'سلیمی', credit_limit: 5000000 },
      }),
    ).rejects.toThrow('credit_limit');

    // Denied protected org_id write
    await expect(
      executeMcpTool(auth, storage, 'create_record', {
        moduleId: 'customers',
        fields: { first_name: 'مریم', org_id: OTHER_USER_ID },
      }),
    ).rejects.toThrow('org_id');

    // Clearing first_name when field_actions.first_name.delete === false is blocked
    await expect(
      executeMcpTool(auth, storage, 'update_record', {
        moduleId: 'customers',
        id: RECORD_ID,
        fields: { first_name: '' },
      }),
    ).rejects.toThrow('first_name');

    // Valid edit succeeds
    const updated = await executeMcpTool(auth, storage, 'update_record', {
      moduleId: 'customers',
      id: RECORD_ID,
      fields: { first_name: 'نگار' },
    });
    expect(updated.updated).toBe(true);
    expect(updated.record.first_name).toBe('نگار');

    // Delete blocked when role.delete !== true
    await expect(
      executeMcpTool(auth, storage, 'delete_record', { moduleId: 'customers', id: RECORD_ID }),
    ).rejects.toThrow('حذف');
  });

  it('handles JSON-RPC initialize, notifications, tools/list, and tools/call', async () => {
    const auth = makeAuth();
    const storage = makeStorage();

    const init = await handleMcpJsonRpcMessage(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      auth,
      storage,
    );
    expect(init?.result?.protocolVersion).toBe('2025-11-25');
    expect(init?.result?.serverInfo?.name).toBe('tazesystem-mcp');

    const notif = await handleMcpJsonRpcMessage(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      auth,
      storage,
    );
    expect(notif).toBeNull();

    const toolsRes = await handleMcpJsonRpcMessage(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      auth,
      storage,
    );
    expect(Array.isArray(toolsRes?.result?.tools)).toBe(true);

    const ctxRes = await handleMcpJsonRpcMessage(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_my_context', arguments: {} } },
      auth,
      storage,
    );
    expect(ctxRes?.result?.isError).toBe(false);
    expect(ctxRes?.result?.structuredContent?.organization?.name).toBe('شرکت نمونه تازه‌سیستم');
  });
});
