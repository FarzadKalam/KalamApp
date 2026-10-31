import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldType, type ModuleDefinition, type ModuleField } from '../types';
import { fetchCurrentUserRoleContext } from './permissions';
import { resolveRelationPopulatePatch } from './relationPopulate';

vi.mock('./permissions', () => ({ fetchCurrentUserRoleContext: vi.fn() }));
vi.mock('../moduleRegistry', () => ({ MODULES: {
  job_descriptions: {
    id: 'job_descriptions', table: 'job_descriptions',
    fields: [{ key: 'job_goal' }, { key: 'job_duties' }],
  },
} }));

const module = {
  id: 'employees', fields: [{ key: 'job_goal' }, { key: 'job_duties' }],
} as ModuleDefinition;
const field = {
  key: 'job_description_id', type: FieldType.RELATION,
  relationConfig: {
    targetModule: 'job_descriptions',
    populateFields: { job_goal: 'job_goal', job_duties: 'job_duties' },
    populateConfirmation: { title: 'آیا فیلدهای شرح شغل در رکورد کارمند به‌روز شوند؟' },
  },
} as ModuleField;

const setup = () => {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({ data: { job_goal: 'هدف جدید', job_duties: null }, error: null }));
  const supabaseClient = { from: vi.fn(() => query) };
  const confirm = vi.fn(async () => true);
  return { query, supabaseClient, confirm, request: {
    supabaseClient, module, field, value: 'new-description', previousValue: 'old-description',
    confirm, isCurrent: () => true,
  } };
};

beforeEach(() => {
  vi.mocked(fetchCurrentUserRoleContext).mockResolvedValue({
    userId: 'user', orgId: 'current-org', roleId: 'role', permissions: {},
  });
});

describe('confirmed relation population', () => {
  it('copies all mapped values including empty fields only after confirmation, scoped to the org', async () => {
    const { request, query, confirm } = setup();
    expect(await resolveRelationPopulatePatch(request)).toEqual({ job_goal: 'هدف جدید', job_duties: null });
    expect(confirm).toHaveBeenCalledOnce();
    expect(query.eq).toHaveBeenCalledWith('org_id', 'current-org');
    expect(query.eq).toHaveBeenCalledWith('id', 'new-description');
    expect(query.select).toHaveBeenCalledWith('job_goal,job_duties');
  });

  it('keeps employee text and does not query source data when the user selects only link', async () => {
    const { request, supabaseClient, confirm } = setup();
    confirm.mockResolvedValue(false);
    expect(await resolveRelationPopulatePatch(request)).toEqual({});
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('does not prompt or erase text when removing or keeping the same relation', async () => {
    const { request, confirm } = setup();
    expect(await resolveRelationPopulatePatch({ ...request, value: null })).toEqual({});
    expect(await resolveRelationPopulatePatch({ ...request, value: 'old-description' })).toEqual({});
    expect(confirm).not.toHaveBeenCalled();
  });

  it('ignores a delayed response if the user changes the record or selected description', async () => {
    const { request, query } = setup();
    let current = true;
    query.maybeSingle.mockImplementation(async () => {
      current = false;
      return { data: { job_goal: 'قدیمی' }, error: null };
    });
    expect(await resolveRelationPopulatePatch({ ...request, isCurrent: () => current })).toEqual({});
  });

  it('preserves current text if the source record is unavailable', async () => {
    const { request, query } = setup();
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(resolveRelationPopulatePatch(request)).rejects.toThrow('متن‌های فعلی حفظ شدند');
  });

  it('filters denied fields from both the source query and the destination patch', async () => {
    vi.mocked(fetchCurrentUserRoleContext).mockResolvedValue({
      userId: 'user', orgId: 'current-org', roleId: 'role',
      permissions: { employees: { fields: { job_duties: false } } },
    });
    const { request, query } = setup();
    expect(await resolveRelationPopulatePatch(request)).toEqual({ job_goal: 'هدف جدید' });
    expect(query.select).toHaveBeenCalledWith('job_goal');
  });

  it('fails closed without an organization', async () => {
    vi.mocked(fetchCurrentUserRoleContext).mockResolvedValue({ userId: 'user', orgId: null, roleId: null, permissions: {} });
    const { request, supabaseClient, confirm } = setup();
    expect(await resolveRelationPopulatePatch(request)).toEqual({});
    expect(confirm).not.toHaveBeenCalled();
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('preserves configured automatic readonly snapshots without a confirmation prompt', async () => {
    const { request, confirm } = setup();
    const automaticField = {
      ...field,
      relationConfig: { ...field.relationConfig!, populateConfirmation: undefined },
    };
    const readonlyModule = {
      ...module, fields: module.fields.map((definition) => ({ ...definition, readonly: true })),
    };
    expect(await resolveRelationPopulatePatch({ ...request, field: automaticField, module: readonlyModule }))
      .toEqual({ job_goal: 'هدف جدید', job_duties: null });
    expect(confirm).not.toHaveBeenCalled();
  });
});
