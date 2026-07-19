import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Empty, Spin, Tag } from 'antd';
import { EnvironmentOutlined, GlobalOutlined, MailOutlined, PhoneOutlined, SendOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { MODULES } from '../moduleRegistry';
import { supabasePublic } from '../supabaseClient';
import { getFieldLabelFa } from '../utils/fieldLabel';
import { parseLocationValue, IRAN_BOUNDS, IRAN_CENTER, isInsideIran } from '../utils/location';
import { buildMapStyle, buildMapTransformRequest, buildRasterStyle, MAP_MAX_ZOOM, MAP_STYLE_URL, sanitizeMapStyle } from '../utils/mapConfig';
import { attachMissingMapImageFallback, ensureMapLibreRTLTextPlugin } from '../utils/maplibreRuntime';
import { createThemeMapPinElement } from '../utils/mapPin';
import { getPublicOnlineCatalog } from '../utils/onlineCatalog';
import { normalizePublicAssetUrl } from '../utils/assetUrl';

const STATUS_COLORS: Record<string, string> = {
  green: '#16a34a', red: '#dc2626', blue: '#2563eb', orange: '#ea580c', yellow: '#ca8a04',
  purple: '#7c3aed', cyan: '#0891b2', gray: '#64748b', grey: '#64748b', pink: '#db2777',
  gold: '#ca8a04', volcano: '#ea580c', default: '#64748b',
};

const resolveStatusColor = (color: unknown) => {
  const raw = String(color || '').trim().toLowerCase();
  if (!raw) return STATUS_COLORS.default;
  if (raw.startsWith('#') || raw.startsWith('rgb') || raw.startsWith('hsl')) return raw;
  return STATUS_COLORS[raw] || STATUS_COLORS.default;
};

const escapeText = (value: unknown) => String(value ?? '').trim();

const OnlineCatalogPublicPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getPublicOnlineCatalog(supabasePublic, token).then((result) => {
      if (!cancelled) setPayload(result);
    }).catch(() => {
      if (!cancelled) setPayload({ error: 'not_found' });
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  const catalog = payload?.catalog || null;
  const company = payload?.company || {};
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const moduleId = String(catalog?.module_id || '').trim();
  const moduleConfig = MODULES[moduleId];
  const presentation = catalog?.presentation && typeof catalog.presentation === 'object' ? catalog.presentation : {};
  const statusOptions = useMemo(() => {
    const field = moduleConfig?.fields?.find((item: any) => String(item?.key || '') === 'status');
    return Array.isArray(field?.options) ? field.options : [];
  }, [moduleConfig]);
  const statusMeta = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>();
    statusOptions.forEach((option: any) => map.set(String(option?.value || ''), {
      label: String(option?.label || option?.value || ''),
      color: resolveStatusColor(option?.color),
    }));
    return map;
  }, [statusOptions]);
  const visibleFields = useMemo(() => {
    const keys = Array.isArray(catalog?.display_field_keys) ? catalog.display_field_keys.map(String) : [];
    return keys.map((key: string) => moduleConfig?.fields?.find((field: any) => String(field?.key || '') === key) || { key, labels: { fa: key } });
  }, [catalog?.display_field_keys, moduleConfig]);

  const mapItems = useMemo(() => moduleId === 'billboards'
    ? items.map((item: any, index: number) => {
      const location = parseLocationValue(item?.location || item?.fields?.location);
      if (!location || !isInsideIran(location)) return null;
      const status = statusMeta.get(String(item?.status || ''));
      return { item, index, location, color: status?.color || STATUS_COLORS.default };
    }).filter(Boolean) as Array<{ item: any; index: number; location: { lat: number; lng: number }; color: string }>
    : [], [items, moduleId, statusMeta]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || moduleId !== 'billboards' || !mapItems.length || mapRef.current) return;
    ensureMapLibreRTLTextPlugin();
    const fallbackStyle = buildRasterStyle();
    const useRemoteStyle = Boolean(MAP_STYLE_URL);
    const map = new maplibregl.Map({
      container, style: useRemoteStyle ? fallbackStyle as any : buildMapStyle() as any,
      transformRequest: buildMapTransformRequest() as any, center: [IRAN_CENTER[1], IRAN_CENTER[0]], zoom: 5,
      minZoom: 4, maxZoom: Math.max(MAP_MAX_ZOOM, 18), maxBounds: [[IRAN_BOUNDS[0][1], IRAN_BOUNDS[0][0]], [IRAN_BOUNDS[1][1], IRAN_BOUNDS[1][0]]], attributionControl: {},
    });
    mapRef.current = map;
    attachMissingMapImageFallback(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    let fallbackApplied = false;
    map.on('error', (event: any) => {
      if (!useRemoteStyle || fallbackApplied) return;
      const text = String(event?.error?.message || event?.error || '').toLowerCase();
      if (!text.includes('fetch') && !text.includes('style') && !text.includes('timeout')) return;
      fallbackApplied = true;
      map.setStyle(fallbackStyle as any, { diff: false } as any);
    });
    if (useRemoteStyle) map.setStyle(MAP_STYLE_URL, { diff: false, transformStyle: sanitizeMapStyle } as any);
    const bounds = new maplibregl.LngLatBounds();
    mapItems.forEach(({ item, index, location, color }) => {
      bounds.extend([location.lng, location.lat]);
      const pin = createThemeMapPinElement({ interactive: true, size: 'md', color, strokeColor: color });
      pin.title = escapeText(item?.title) || 'تبلیغ محیطی';
      pin.onclick = () => setSelectedItem({ ...item, __mapIndex: index });
      markersRef.current.push(new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat([location.lng, location.lat]).addTo(map));
    });
    map.fitBounds(bounds, { padding: 42, maxZoom: 16, duration: 300 });
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mapItems, moduleId]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-100"><Spin size="large" /></div>;
  if (!catalog || payload?.error) return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-5"><Empty description="کاتالوگ عمومی فعال پیدا نشد" /></div>;

  const palette = String(company?.palette_key || 'blue');
  const openNavigation = (item: any) => {
    const location = parseLocationValue(item?.location || item?.fields?.location);
    if (!location || typeof window === 'undefined') return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className={`online-catalog-public online-catalog-${palette} min-h-screen bg-slate-100 px-3 py-4 text-slate-800 sm:px-6 sm:py-8`} dir="rtl">
      <div className="mx-auto max-w-7xl">
        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/85 shadow-[0_26px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl">
          <header className="relative overflow-hidden bg-gradient-to-br from-[rgb(var(--brand-800-rgb,30,58,138))] via-[rgb(var(--brand-600-rgb,37,99,235))] to-[rgb(var(--brand-400-rgb,96,165,250))] px-5 py-7 text-white sm:px-10 sm:py-10">
            <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-white/10" /><div className="absolute -bottom-28 -right-10 h-72 w-72 rounded-full bg-white/10" />
            <div className="relative flex flex-wrap items-center gap-4">
              {company.logo_url ? <img src={normalizePublicAssetUrl(company.logo_url) || company.logo_url} alt="لوگو" className="h-16 w-16 rounded-2xl bg-white/90 object-contain p-2 shadow-lg" /> : <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-3xl">✦</div>}
              <div className="min-w-0"><div className="text-sm font-semibold text-white/75">{escapeText(company.trade_name || company.company_name)}</div><h1 className="mt-1 text-2xl font-black sm:text-4xl">{escapeText(catalog.title)}</h1>{company.slogan ? <div className="mt-2 text-sm text-white/80">{escapeText(company.slogan)}</div> : null}</div>
            </div>
            {catalog.description ? <p className="relative mt-6 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-white/90 sm:text-base">{catalog.description}</p> : null}
          </header>

          <div className="space-y-6 p-4 sm:p-8">
            {presentation.organization_intro ? <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">{escapeText(presentation.organization_intro)}</p> : null}
            {Array.isArray(presentation.feature_cards) && presentation.feature_cards.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{presentation.feature_cards.slice(0, 4).map((card: any, index: number) => <div key={index} className="rounded-2xl border border-white/70 bg-white/80 p-4 text-center shadow-[0_8px_25px_rgba(15,23,42,.06)]"><div className="text-2xl">{escapeText(card?.icon) || '★'}</div><div className="mt-2 font-black">{escapeText(card?.title) || 'ویژگی'}</div>{card?.subtitle ? <div className="mt-1 text-xs text-slate-500">{escapeText(card.subtitle)}</div> : null}</div>)}</div> : null}
            {items.length === 0 ? <Alert type="info" showIcon message="رکوردی برای نمایش در این کاتالوگ پیدا نشد." /> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item: any, index: number) => {
              const status = statusMeta.get(String(item?.status || ''));
              return <article key={`${index}-${item?.title || 'item'}`} className="group overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_15px_35px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(15,23,42,0.14)]">
                {item?.image_url ? <img src={normalizePublicAssetUrl(item.image_url) || item.image_url} alt={escapeText(item.title)} className="h-48 w-full object-cover" loading="lazy" /> : <div className="flex h-48 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-5xl text-slate-400">✦</div>}
                <div className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><h2 className="min-w-0 text-lg font-black">{escapeText(item?.title) || 'بدون عنوان'}</h2>{status ? <Tag color={status.color} style={{ color: '#fff', backgroundColor: status.color, borderColor: status.color }} className="m-0 shrink-0">{status.label}</Tag> : null}</div>
                  <div className="grid gap-2 sm:grid-cols-2">{visibleFields.map((field: any) => { const value = item?.fields?.[field.key] ?? item?.[field.key]; return value === null || value === undefined || value === '' ? null : <div key={field.key} className="rounded-xl bg-slate-50 px-3 py-2"><div className="text-[10px] font-semibold text-slate-400">{getFieldLabelFa(field, { moduleId, fallback: field?.labels?.fa || field.key })}</div><div className="mt-1 break-words text-sm font-bold">{Array.isArray(value) ? value.join('، ') : String(value)}</div></div>; })}</div>
                  {moduleId === 'billboards' && parseLocationValue(item?.location || item?.fields?.location) ? <button type="button" onClick={() => openNavigation(item)} className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--brand-600-rgb,37,99,235))] px-3 py-2 text-xs font-bold text-white"><EnvironmentOutlined /> مسیریابی</button> : null}
                </div></article>;
            })}</div>}

            {moduleId === 'billboards' ? <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black">موقعیت تبلیغات محیطی</h2><div className="flex flex-wrap gap-2">{Array.from(new Set(mapItems.map(({ item }) => String(item?.status || '')))).map((key) => { const meta = statusMeta.get(key); return meta ? <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />{meta.label}</span> : null; })}</div></div>{mapItems.length ? <div ref={mapContainerRef} className="h-[26rem] overflow-hidden rounded-3xl border border-slate-200" /> : <div className="flex h-40 items-center justify-center rounded-3xl border border-dashed border-slate-300 text-sm text-slate-500">موقعیت معتبر برای نمایش روی نقشه پیدا نشد.</div>}</section> : null}

            {Array.isArray(presentation.customers) && presentation.customers.length ? <section><h2 className="mb-3 text-lg font-black">بخشی از مشتریان ما</h2><div className="flex flex-wrap gap-3">{presentation.customers.map((customer: any, index: number) => <div key={index} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold">{customer?.logo_url ? <img src={normalizePublicAssetUrl(customer.logo_url) || customer.logo_url} alt="" className="h-8 w-8 rounded-lg object-contain" /> : null}{escapeText(customer?.name)}</div>)}</div></section> : null}
            <footer className="grid gap-3 border-t border-slate-200 pt-5 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">{presentation.advisor_name ? <span>مشاور شما: {escapeText(presentation.advisor_name)}</span> : null}{company.phone ? <span><PhoneOutlined /> {company.phone}</span> : null}{company.mobile ? <span><PhoneOutlined /> {company.mobile}</span> : null}{company.email ? <span><MailOutlined /> {company.email}</span> : null}{company.website ? <span><GlobalOutlined /> {company.website}</span> : null}{company.address ? <span className="sm:col-span-2 lg:col-span-4"><EnvironmentOutlined /> {company.address}</span> : null}</footer>
          </div>
        </section>
        {selectedItem ? <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center" onClick={() => setSelectedItem(null)}><div className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-black">{escapeText(selectedItem.title) || 'تبلیغ محیطی'}</h2><button type="button" className="text-slate-400" onClick={() => setSelectedItem(null)}>×</button></div>{selectedItem.image_url ? <img src={normalizePublicAssetUrl(selectedItem.image_url) || selectedItem.image_url} alt="" className="mt-4 h-52 w-full rounded-2xl object-cover" /> : null}<div className="mt-4 grid gap-2 sm:grid-cols-2">{visibleFields.map((field: any) => { const value = selectedItem?.fields?.[field.key] ?? selectedItem?.[field.key]; return value === null || value === undefined || value === '' ? null : <div key={field.key} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{getFieldLabelFa(field, { moduleId, fallback: field.key })}</div><div className="mt-1 font-bold">{String(value)}</div></div>; })}</div>{moduleId === 'billboards' ? <button type="button" onClick={() => openNavigation(selectedItem)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--brand-600-rgb,37,99,235))] px-4 py-2 font-bold text-white"><SendOutlined /> مسیریابی</button> : null}</div></div> : null}
      </div>
    </main>
  );
};

export default OnlineCatalogPublicPage;
