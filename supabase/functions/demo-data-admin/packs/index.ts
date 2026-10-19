import { resolveDemoPack } from '../_shared/demo-seed-runtime.ts';
import { seedGeneralOrgDemoData } from './general-v2.ts';

// Explicit pack dispatch keeps a future industry's data isolated from the general pack.
const builders: Record<string, typeof seedGeneralOrgDemoData> = { general_v2: seedGeneralOrgDemoData };
export async function seedOrgDemoData(client: any, caller: any, context: any) {
  const pack = resolveDemoPack(context.company?.industry);
  const build = builders[pack.key];
  if (!build) throw new Error('بستهٔ داده‌های نمونه این صنف هنوز آماده نیست.');
  return build(client, caller, context);
}
