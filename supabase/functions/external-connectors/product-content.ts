import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';
import { normalizeWooProductDescription } from './product-content-html.ts';
import { normalizeProductSiteSlug } from '../_shared/product-site-slug.ts';
import { buildWooProductContentPayload, mergeWooProductImages } from '../_shared/product-site-content.ts';
import {
  getProductContentStatus, hashProductContent, hashProductContentImageUrl, productContentFields,
  type ProductContentBaseline, type ProductContentSnapshot,
} from '../_shared/product-content-status.ts';

const trim = (value: unknown) => String(value ?? '').trim();
const contentColumns = `id,updated_at,${productContentFields.join(',')}`;
const storeColumns = 'id,org_id,name,base_url,is_active,sync_policy,credentials_encrypted';
type Connection = { id: string; org_id: string; name: string; base_url: string; is_active: boolean; sync_policy?: { products?: string } };
type WooRequest = (connection: Connection, method: 'GET' | 'PUT', path: string, payload?: unknown) => Promise<any>;
type Direction = 'from_site' | 'to_site';
type StoredDraft = ProductContentSnapshot & { id: string; updated_at: string };

const safeUrl = (value: unknown) => {
  try {
    const url = new URL(trim(value));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};

const localSnapshot = (product: any, draft: any): ProductContentSnapshot => ({
  title: trim(draft?.title || product.name).replace(/[<>\u0000-\u001f]/g, ''),
  short_description: normalizeWooProductDescription(draft?.short_description),
  description: normalizeWooProductDescription(draft?.description),
  slug: normalizeProductSiteSlug(draft?.slug),
  site_image_url: trim(draft?.site_image_url),
  site_image_alt: trim(draft?.site_image_url) ? trim(draft?.site_image_alt) : '',
});

const remoteSnapshot = (remote: any): ProductContentSnapshot => ({
  title: trim(remote.name).replace(/[<>\u0000-\u001f]/g, '').slice(0, 180),
  short_description: normalizeWooProductDescription(remote.short_description, true),
  description: normalizeWooProductDescription(remote.description, true),
  slug: normalizeProductSiteSlug(remote.slug),
  site_image_url: safeUrl(remote.images?.[0]?.src),
  site_image_alt: trim(remote.images?.[0]?.alt).slice(0, 250),
});

const remoteDate = (remote: any) => {
  const value = trim(remote.date_modified_gmt);
  if (!value) return null;
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const difference = (local: ProductContentSnapshot, remote: ProductContentSnapshot) =>
  productContentFields.filter((field) => local[field] !== remote[field]);

export async function withWooProductLease<T>(
  client: SupabaseClient, orgId: string, linkId: string,
  work: (operation: string, baseline: ProductContentBaseline | null) => Promise<T>,
): Promise<T> {
  const operation = crypto.randomUUID();
  const { data, error } = await client.from('external_record_links').update({
    product_content_operation: operation,
    product_content_operation_until: new Date(Date.now() + 120_000).toISOString(),
  }).eq('org_id', orgId).eq('id', linkId)
    .or(`product_content_operation.is.null,product_content_operation_until.lt.${new Date().toISOString()}`)
    .select('product_content_sync').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('انتقال دیگری برای همین محصول در حال اجراست یا نگاشت برداشته شده است.');
  try {
    return await work(operation, data.product_content_sync);
  } finally {
    await client.from('external_record_links').update({ product_content_operation: null, product_content_operation_until: null })
      .eq('org_id', orgId).eq('id', linkId).eq('product_content_operation', operation);
  }
}

export const createWooProductContentService = (
  client: SupabaseClient,
  wooRequest: WooRequest,
  allowedOrigins: () => string[],
) => {
  const loadProduct = async (orgId: string, localId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(localId)) throw new Error('محصول معتبر نیست.');
    const [product, draft] = await Promise.all([
      client.from('products').select('id,name,updated_at').eq('org_id', orgId).eq('id', localId).maybeSingle(),
      client.from('product_site_content').select(contentColumns).eq('org_id', orgId).eq('product_id', localId)
        .returns<StoredDraft[]>().maybeSingle(),
    ]);
    if (product.error || draft.error) throw product.error || draft.error;
    if (!product.data) throw new Error('محصول در این سازمان پیدا نشد.');
    return { product: product.data, draft: draft.data };
  };

  const loadLink = async (connection: Connection, localId: string) => {
    const { data, error } = await client.from('external_record_links')
      .select('id,external_id,product_content_sync')
      .eq('org_id', connection.org_id).eq('connection_id', connection.id)
      .eq('module_key', 'products').eq('local_id', localId).maybeSingle();
    if (error) throw error;
    return data;
  };

  const loadStore = (orgId: string, connectionId: string) =>
    client.from('external_connections').select(storeColumns).eq('org_id', orgId)
      .eq('id', connectionId).eq('is_active', true).eq('provider', 'woocommerce').maybeSingle();

  const inspect = async (connection: Connection, local: Awaited<ReturnType<typeof loadProduct>>) => {
    const link = await loadLink(connection, local.product.id);
    const policy = connection.sync_policy?.products || 'manual';
    const summary = {
      connectionId: connection.id, connectionName: connection.name, policy,
      localUpdatedAt: local.draft?.updated_at || local.product.updated_at || null,
      lastSyncedAt: (link?.product_content_sync as ProductContentBaseline | null)?.syncedAt || null,
    };
    if (!link || !/^\d+$/.test(trim(link.external_id))) return { ...summary, status: 'unlinked' as const };
    try {
      const remote = await wooRequest(connection, 'GET', `products/${link.external_id}?context=edit`);
      const app = localSnapshot(local.product, local.draft);
      const site = remoteSnapshot(remote);
      const [localHash, remoteHash, appImageHash] = await Promise.all([
        hashProductContent(app), hashProductContent(site), hashProductContentImageUrl(app.site_image_url),
      ]);
      const baseline = link.product_content_sync as ProductContentBaseline | null;
      const pairedImage = app.site_image_url && baseline?.appImageHash === appImageHash
        && baseline.siteImageId === remote.images?.[0]?.id;
      return {
        ...summary, status: getProductContentStatus(localHash, remoteHash, baseline),
        remoteUpdatedAt: remoteDate(remote), permalink: safeUrl(remote.permalink),
        localHash, remoteHash, appImageHash, link, app, site, remote,
        changedFields: difference(app, site).filter((field) => field !== 'site_image_url' || !pairedImage),
      };
    } catch (error) {
      return { ...summary, status: 'unavailable' as const, error: error instanceof Error ? error.message : 'خواندن محصول از فروشگاه ناموفق بود.' };
    }
  };

  const overview = async (orgId: string, localId: string, selectedConnectionId: string, page: number) => {
    const local = await loadProduct(orgId, localId);
    const query = client.from('external_connections').select('id,name')
      .eq('org_id', orgId).eq('provider', 'woocommerce').eq('is_active', true).order('name').order('id');
    const { data: stores, error } = await query;
    if (error) throw error;
    const selected = stores?.find((store) => store.id === selectedConnectionId) || stores?.[0];
    const selectedStore = selected ? await loadStore(orgId, selected.id) : null;
    if (selectedStore?.error) throw selectedStore.error;
    const result = selectedStore?.data ? await inspect(selectedStore.data, local) : null;
    const status = result && 'link' in result ? {
      connectionId: result.connectionId, connectionName: result.connectionName,
      policy: result.policy, status: result.status, localUpdatedAt: result.localUpdatedAt,
      remoteUpdatedAt: result.remoteUpdatedAt, lastSyncedAt: result.lastSyncedAt, permalink: result.permalink,
      localHash: result.localHash, remoteHash: result.remoteHash, changedFields: result.changedFields,
      app: result.app, site: result.site, hasDraft: Boolean(local.draft),
    } : result;
    const { data: events, count, error: historyError } = await client.from('external_sync_history')
      .select('id,connection_id,direction,started_at,finished_at,status,changed_fields,error_code', { count: 'exact' })
      .eq('org_id', orgId).eq('module_key', 'products').eq('local_record_id', localId)
      .order('started_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 10, page * 10 - 1);
    if (historyError) throw historyError;
    return { stores: stores || [], status, events: events || [], total: count || 0 };
  };

  const sync = async (
    connection: Connection, localId: string, userId: string, direction: Direction,
    expected: { localHash: string; remoteHash: string },
  ) => {
    const local = await loadProduct(connection.org_id, localId);
    const state = await inspect(connection, local);
    if (!('link' in state) || !state.link) throw new Error('ابتدا نگاشت محصول و دسترسی خواندن فروشگاه را بررسی کنید.');
    if (state.localHash !== expected.localHash || state.remoteHash !== expected.remoteHash) {
      throw new Error('محتوا پس از آخرین بررسی تغییر کرده است. تفاوت‌ها را دوباره بررسی کنید.');
    }
    if ((direction === 'to_site' && state.policy === 'woocommerce') || (direction === 'from_site' && state.policy === 'taze')) {
      throw new Error('جهت انتقال با مرجع تعیین‌شده برای کالاهای این فروشگاه سازگار نیست.');
    }
    if (direction === 'to_site' && !local.draft) throw new Error('ابتدا پیش‌نویس محتوا را در اپ ذخیره کنید.');
    return withWooProductLease(client, connection.org_id, state.link.id, async (operation, baselineBefore) => {
      const [latest, store] = await Promise.all([
        loadProduct(connection.org_id, localId),
        loadStore(connection.org_id, connection.id),
      ]);
      if (store.error || !store.data || store.data.base_url !== connection.base_url) {
        throw new Error('اتصال فروشگاه تغییر کرده است. وضعیت محصول را دوباره بررسی کنید.');
      }
      const current = await inspect(store.data, latest);
      if (!('link' in current) || !current.link || current.link.id !== state.link.id ||
        current.localHash !== expected.localHash || current.remoteHash !== expected.remoteHash || current.policy !== state.policy) {
        throw new Error('محتوا یا نگاشت تغییر کرده است. وضعیت محصول را دوباره بررسی کنید.');
      }
      let app = current.app;
      let site = current.site;
      let siteImageId: number | undefined = current.remote.images?.[0]?.id;
      let reportedPartial = false;
      let changedFields: readonly string[];
      if (direction === 'from_site') {
        if (site.short_description.length > 8000 || site.description.length > 60000) {
          throw new Error('توضیحات فروشگاه از ظرفیت ذخیرهٔ محتوای محصول بیشتر است.');
        }
        changedFields = difference(app, site);
        const draft = client.from('product_site_content');
        const values = { ...site, status: 'draft', updated_by: userId };
        const write = latest.draft
          ? draft.update(values).eq('org_id', connection.org_id).eq('product_id', localId).eq('updated_at', latest.draft.updated_at)
          : draft.insert({ ...values, org_id: connection.org_id, product_id: localId, created_by: userId });
        const { data, error } = await write.select('id').maybeSingle();
        if (error || !data) throw new Error('ذخیرهٔ محتوای دریافت‌شده ممکن نشد. نسخهٔ اپ را دوباره بررسی کنید.');
        app = site;
      } else {
        const attached = app.site_image_url && Array.isArray(current.remote.images) ? current.remote.images.find((image: any) =>
          trim(image.src) === app.site_image_url || (baselineBefore?.appImageHash === current.appImageHash
            && baselineBefore.siteImageId === image.id),
        ) : null;
        const { payload } = buildWooProductContentPayload(
          { title: app.title, slug: app.slug, site_image_url: attached ? '' : app.site_image_url, site_image_alt: app.site_image_alt },
          local.product.name, allowedOrigins(),
        );
        if (app.short_description) payload.short_description = app.short_description;
        if (app.description) payload.description = app.description;
        const selectedImage = payload.selectedImage as { src: string; alt: string } | undefined;
        delete payload.selectedImage;
        const needsImageUpdate = attached && (siteImageId !== attached.id || app.site_image_alt !== site.site_image_alt);
        if (selectedImage || needsImageUpdate) {
          const desired = selectedImage || { src: trim(attached.src), alt: app.site_image_alt };
          const images = mergeWooProductImages(current.remote.images, desired) || [];
          const selected = images.find((image) => image.src === desired.src);
          if (selected) {
            const ordered = [selected, ...images.filter((image) => image !== selected)];
            payload.images = ordered.map(({ id, src, alt }, position) => ({ ...(id ? { id } : { src }), alt, position }));
          }
        }
        const remote = await wooRequest(store.data, 'PUT', `products/${current.link.external_id}?context=edit`, payload);
        site = remoteSnapshot(remote);
        siteImageId = remote.images?.[0]?.id;
        changedFields = difference(current.site, site);
        const sameAsset = Boolean(app.site_image_url && site.site_image_url && siteImageId
          && (attached?.id === siteImageId || (selectedImage && siteImageId !== current.remote.images?.[0]?.id)));
        reportedPartial = difference(app, site).some((field) =>
          field !== 'site_image_url' || !sameAsset,
        );
        if (!sameAsset && app.site_image_url !== site.site_image_url) siteImageId = undefined;
      }
      const [localHash, remoteHash] = await Promise.all([hashProductContent(app), hashProductContent(site)]);
      const syncedAt = reportedPartial ? current.lastSyncedAt : new Date().toISOString();
      const baseline: ProductContentBaseline = {
        localHash, remoteHash, syncedAt, partial: reportedPartial,
        ...(siteImageId && app.site_image_url ? {
          siteImageId, appImageHash: await hashProductContentImageUrl(app.site_image_url),
        } : {}),
      };
      const { data, error } = await client.from('external_record_links').update({ product_content_sync: baseline })
        .eq('org_id', connection.org_id).eq('id', current.link.id).eq('product_content_operation', operation).select('id').maybeSingle();
      return { status: reportedPartial || error || !data ? 'partial' : 'succeeded', changedFields, baselineSaved: !error && !!data };
    });
  };

  return { overview, sync };
};
