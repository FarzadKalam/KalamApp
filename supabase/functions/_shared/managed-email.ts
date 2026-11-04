export const MANAGED_EMAIL_FEATURE = 'managed_organization_email';

// Organization namespace is resolved by the server, never supplied by the browser.
export function managedEmailAddress(slug: string, alias: string, domain: string) {
  const namespace = String(slug || '').trim().toLowerCase();
  const local = String(alias || '').trim().toLowerCase();
  const host = String(domain || '').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(namespace) ||
      !/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/.test(local) ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || `${namespace}.${local}`.length > 64) {
    throw new Error('نام لاتین سازمان یا نام صندوق برای ساخت آدرس ایمیل معتبر نیست.');
  }
  return `${namespace}.${local}@${host}`;
}

export async function requireManagedEmailFeature(service: any, orgId: string) {
  if (await service.rpc('org_has_plan_feature', {
    p_org_id: orgId, p_feature_key: MANAGED_EMAIL_FEATURE, p_default_enabled: false,
  }) !== true) throw new Error('صندوق میزبانی‌شدهٔ تازه سیستم در پلن سازمان فعال نیست؛ برای استفاده، پلن را ارتقا دهید.');
}
