// @vitest-environment node
import { describe,expect,it,vi } from 'vitest';
import { createEmployeeDataRuntime, EMPLOYEE_DATA_SOURCES } from './ai-employee-data';
import { createGoalDataRuntime } from './ai-goal-data';
import type { AgentDataAccess } from './ai-agent-data';
const org = '10000000-0000-4000-8000-000000000001';
const employee = '20000000-0000-4000-8000-000000000001';
const entry = '30000000-0000-4000-8000-000000000001';
const access: AgentDataAccess = { orgId: org,userId: employee,roleId: null,allowedUserIds: [],allowedRoleIds: [],modules: [
  { id: 'employees',table: 'employees',label: 'همکاران',recordScope: 'own',fields: [{ key: 'full_name',label: 'نام',type: 'text' }] },
  { id: 'payroll_slips',table: 'payroll_slips',label: 'فیش حقوق',recordScope: 'all',fields: [{ key: 'name',label: 'نام',type: 'text' }] },
] };
const setup = (read: any,extra = {}) => createEmployeeDataRuntime({ access,read,actorScoped: true,canReadPayroll: true,canReadGoals: true,
  canReadSource: () => true,
  canReadGoalModule: () => true,
  fieldAllowed: (_module,field) => !['secret','api_key'].includes(field),...extra });
describe('persisted employee calculation sources',() => {
  it('reads real commission amounts and details with actor, employee, period and organization scope',async () => {
    const read = vi.fn(async (table,params) => {
      if(table === 'employees') { expect(params.and).toContain(`assignee_id.eq.${employee}`); return [{ id: employee,full_name: 'همکار' }]; }
      expect(params.org_id).toBe(`eq.${org}`);
      expect(params.and).toContain(`employee_id.eq."${employee}"`);
      expect(params.and).toContain('period_end.gte."2026-11-01"');
      expect(params.and).toContain('source_type.eq."commission"');
      return [{ id: entry,employee_id: employee,amount: '499',details: { rate: 2,api_key: 'secret' } }];
    });
    const result = await setup(read).execute({ employeeId: employee,section: 'payroll_entries',periodStart: '2026-11-01',sourceType: 'commission' });
    expect(result.records[0].amount).toBe('499');
    expect(result.records[0].details).toEqual({ rate: 2 });
  });
  it('denies employee scope, financial fields and missing caller before reading payroll',async () => {
    const deny = vi.fn(async () => []);
    await expect(setup(deny).execute({ employeeId: employee,section: 'payroll_entries' })).rejects.toThrow();
    expect(deny).toHaveBeenCalledTimes(1);
    const read = vi.fn(async () => [{ id: employee,full_name: 'همکار' }]);
    await expect(setup(read,{ actorScoped: false }).execute({ employeeId: employee,section: 'payroll_entries' })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    await expect(setup(read,{ fieldAllowed: (_m,f) => f !== 'base_salary' }).execute({ employeeId: employee,section: 'payroll_entries' })).rejects.toThrow();
    expect(read.mock.calls.every(call => call[0] === 'employees')).toBe(true);
  });
  it('keeps the employee constraint on nested calculation detail reads',async () => {
    const read = vi.fn(async table => table === 'employees' ? [{ id: employee,full_name: 'همکار' }]
      : [{ id: entry,employee_id: employee,details: { rows: Array.from({ length: 23 },(_,i) => ({ amount: i })) } }]);
    const result = await setup(read).execute({ employeeId: employee,section: 'payroll_entries',recordId: entry,field: 'details',path: ['rows'],pageSize: 10 });
    expect(result.value).toHaveLength(10); expect(result.nextOffset).toBe(10);
    for(const call of read.mock.calls.filter(call => call[0] !== 'employees')) expect(call[1].and).toContain(`employee_id.eq."${employee}"`);
  });
  it('does not widen payroll record conditions or source plan gates',async () => {
    const read = vi.fn(async () => [{ id: employee,full_name: 'همکار' }]);
    const scoped = { ...access,modules: access.modules.map(module => module.id === 'payroll_slips'
      ? { ...module,viewConditions: { conditions_all: [{ field: 'status',operator: 'eq',value: 'approved' }] } } : module) };
    await expect(setup(read,{ access: scoped }).execute({ employeeId: employee,section: 'payroll_entries' })).rejects.toThrow();
    expect(read.mock.calls.every(call => call[0] === 'employees')).toBe(true);
    read.mockClear();
    await expect(setup(read,{ canReadSource: () => false }).execute({ employeeId: employee,section: 'commission_rules' })).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it('bounds wide calculation pages and continues after the last emitted record',async () => {
    const rows = Array.from({ length: 21 },(_,i) => ({
      ...Object.fromEntries(EMPLOYEE_DATA_SOURCES.payroll_entries.fields.map(key => [key,'x'.repeat(900)])),
      id: `30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,employee_id: employee,
    }));
    const read = vi.fn(async table => table === 'employees' ? [{ id: employee,full_name: 'همکار' }] : rows);
    const result = await setup(read).execute({ employeeId: employee,section: 'payroll_entries' });
    expect(JSON.stringify(result).length).toBeLessThan(50000);
    expect(result.hasMore).toBe(true);
    expect(result.records.length).toBeLessThan(20);
    expect(result.nextAfterId).toBe(result.records.at(-1).id);
  });
  it('reads module-scoped goal definitions and recovers full configuration without leaking secrets',async () => {
    const read = vi.fn(async (_table,params) => {
      expect(params.org_id).toBe(`eq.${org}`); expect(params.and).toContain('module_id.eq."employees"');
      return [{ id: entry,name: 'هدف آموزش',config: { rewards: [{ amount: 500 }],secret: 'private' } }];
    });
    const runtime = createGoalDataRuntime({ access,read,canRead: () => true,fieldAllowed: (_m,f) => f !== 'secret' });
    expect((await runtime.execute({ moduleId: 'employees',recordId: entry,field: 'config' })).value).toEqual({ rewards: [{ amount: 500 }] });
    const forbidden = createGoalDataRuntime({ access,read,canRead: () => false,fieldAllowed: () => true });
    await expect(forbidden.execute({ moduleId: 'employees' })).rejects.toThrow();
    await expect(runtime.execute({ moduleId: 'saas_orgs' })).rejects.toThrow();
  });
});

