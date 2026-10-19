// All demo writes and their manifest entries commit together inside PostgreSQL.
// The adapter keeps the existing domain-specific sample builders reusable by industry packs.
export const DEMO_TABLE_ORDER: Record<string, number> = {
  org_roles: 210, warehouses: 190, shelves: 189, suppliers: 180, products: 175,
  price_lists: 170, product_bundles: 165, bundle_items: 164, customers: 160,
  marketing_leads: 158, process_templates: 150, process_template_stages: 149,
  projects: 145, project_members: 144, process_runs: 143, process_run_stages: 142,
  tasks: 141, invoices: 138, purchase_invoices: 137, secretariat_documents: 136,
  delivery_forms: 135, stock_transfers: 134, work_schedules: 128, employees: 126,
  attendance_logs: 124, leave_requests: 122, overtime_requests: 121, mission_requests: 120,
  recruitment_applicants: 118, employee_contracts: 116, payroll_slips: 114,
  employee_bonus_requests: 113, employee_penalty_requests: 112, surveys: 110,
  goals: 108, expense_documents: 107, reservation_resources: 106, reservations: 105,
  workflows: 100,
};

export type DemoPack = { key: string; title: string; industries: readonly string[] };
export const DEMO_PACKS: readonly DemoPack[] = [
  { key: 'general_v2', title: 'شروع کار با فروش، پروژه و منابع انسانی', industries: [] },
];
export function resolveDemoPack(industry?: string | null): DemoPack {
  const key = String(industry || '').trim().toLowerCase();
  return DEMO_PACKS.find(pack => pack.industries.includes(key)) || DEMO_PACKS[0];
}

export function prepareDemoRows(input: Record<string, unknown> | Record<string, unknown>[]) {
  return (Array.isArray(input) ? input : [input]).map(row => {
    const next = { ...row };
    // Let each module's existing numbering rules allocate a non-conflicting code.
    delete next.system_code;
    // Fictional contacts must never route messages to real telephone subscribers.
    for (const key of ['mobile', 'mobile_1', 'mobile_2', 'phone', 'respondent_phone']) {
      if (key in next) next[key] = null;
    }
    if ('notify_supplier' in next) next.notify_supplier = false;
    return next;
  });
}

export function createTrackedDemoClient(client: any, batchId: string) {
  return {
    from(table: string) {
      const query = client.from(table);
      if (!(table in DEMO_TABLE_ORDER)) return query;
      const insert = (input: Record<string, unknown> | Record<string, unknown>[]) => {
        let single = false;
        let execution: Promise<any> | undefined;
        const builder: any = {
          select: () => builder,
          single: () => { single = true; return builder; },
          then(resolve: (value: any) => unknown, reject: (error: unknown) => unknown) {
            execution ||= Promise.resolve(client.rpc('insert_demo_seed_rows', {
              p_batch_id: batchId, p_table_name: table, p_rows: prepareDemoRows(input),
            })).then((result: any) => ({ ...result, data: single ? result.data?.[0] || null : result.data }));
            return execution.then(resolve, reject);
          },
        };
        return builder;
      };
      return new Proxy(query, { get(target, key) {
        if (key === 'insert') return insert;
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    },
  };
}
