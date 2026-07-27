import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Empty, Image, Input, Tag } from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined, EnvironmentOutlined, FileTextOutlined, GlobalOutlined, MailOutlined, PhoneOutlined, SearchOutlined, SendOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import { FieldType } from '../types';
import { MODULES } from '../moduleRegistry';
import { supabasePublic } from '../supabaseClient';
import { getFieldLabelFa } from '../utils/fieldLabel';
import { getOptionLabel } from '../utils/optionHelpers';
import { formatPersianPrice, safeJalaliFormat, toPersianNumber } from '../utils/persianNumberFormatter';
import { parseLocationValue, IRAN_BOUNDS, IRAN_CENTER, isInsideIran } from '../utils/location';
import { buildMapStyle, buildMapTransformRequest, buildRasterStyle, MAP_MAX_ZOOM, MAP_STYLE_URL, sanitizeMapStyle } from '../utils/mapConfig';
import { attachMissingMapImageFallback, ensureMapLibreRTLTextPlugin } from '../utils/maplibreRuntime';
import { createThemeMapPinElement } from '../utils/mapPin';
import { getPublicOnlineCatalog } from '../utils/onlineCatalog';
import { normalizePublicAssetUrl } from '../utils/assetUrl';
import { buildImagePreviewUrl } from '../utils/imagePreview';
import { getOnlineCatalogIcon } from '../utils/onlineCatalogIcons';
import BrandLoadingScreen from '../components/common/BrandLoadingScreen';
import { persistLoadingBrandIdentity, resolveLoadingBrandIdentity } from '../utils/loadingBrand';

const STATUS_COLORS: Record<string, string> = { green: '#16a34a', red: '#dc2626', blue: '#2563eb', orange: '#ea580c', yellow: '#ca8a04', purple: '#7c3aed', cyan: '#0891b2', gray: '#64748b', grey: '#64748b', pink: '#db2777', gold: '#d97706', volcano: '#e34d20', default: '#64748b' };
const resolveStatusColor = (value: unknown) => { const color = String(value || '').trim().toLowerCase(); return color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl') ? color : STATUS_COLORS[color] || STATUS_COLORS.default; };
const text = (value: unknown) => String(value ?? '').trim();
const numberValue = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const normalizeSearchText = (value: unknown) => text(value)
  .toLocaleLowerCase('fa-IR')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[\u0660-\u0669]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const formatCatalogValue = (field: any, value: any, currencyLabel: string) => {
  if (value === null || value === undefined || value === '') return '';
  if (field?.type === FieldType.PRICE) return `${formatPersianPrice(value)} ${currencyLabel}`.trim();
  if (field?.type === FieldType.CHECKBOX) return value === true || value === 'true' || value === 1 ? 'بله' : 'خیر';
  if (field?.type === FieldType.NUMBER || field?.type === FieldType.STOCK || field?.type === FieldType.PERCENTAGE) return `${toPersianNumber(Number(value).toLocaleString('en-US'))}${field?.type === FieldType.PERCENTAGE ? '٪' : ''}`;
  if (field?.type === FieldType.DATE) return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD') || text(value));
  if (field?.type === FieldType.DATETIME) return toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || text(value));
  if (field?.type === FieldType.TIME) return toPersianNumber(safeJalaliFormat(value, 'HH:mm') || text(value));
  if ([FieldType.SELECT, FieldType.MULTI_SELECT, FieldType.STATUS, FieldType.RELATION, FieldType.MULTI_RELATION].includes(field?.type)) return getOptionLabel(field, value);
  if (Array.isArray(value)) return value.map((item) => text(item)).join('، ');
  return text(value);
};

const OnlineCatalogPublicPage: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [payload, setPayload] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slidePausedByUser, setSlidePausedByUser] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const slideTouchStartX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getPublicOnlineCatalog(supabasePublic, token)
      .then((result) => {
        persistLoadingBrandIdentity(resolveLoadingBrandIdentity(result?.company));
        if (!cancelled) setPayload(result);
      })
      .catch(() => { if (!cancelled) setPayload({ error: 'not_found' }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const catalog = payload?.catalog || null;
  const company = payload?.company || {};
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];
  const moduleId = text(catalog?.module_id);
  const moduleConfig = MODULES[moduleId];
  const isSlide = catalog?.template_id === 'catalog_fullpage';
  const isBundleCatalog = moduleId === 'product_bundles';
  const presentation = catalog?.presentation && typeof catalog.presentation === 'object' ? catalog.presentation : {};
  const imagesEnabled = presentation.images_enabled !== false;
  const currencyLabel = text(company.currency_label);
  const selectedFieldKeys = useMemo(() => new Set((Array.isArray(catalog?.display_field_keys) ? catalog.display_field_keys : []).map(text)), [catalog?.display_field_keys]);
  const statusOptions = useMemo(() => {
    const field = moduleConfig?.fields?.find((item: any) => text(item?.key) === 'status');
    return Array.isArray(field?.options) ? field.options : [];
  }, [moduleConfig]);
  const statusMeta = useMemo(() => new Map(statusOptions.map((option: any) => [text(option.value), { label: text(option.label || option.value), color: resolveStatusColor(option.color) }])), [statusOptions]);
  const visibleFields = useMemo(() => {
    const storedMeta = Array.isArray(presentation.field_meta) ? presentation.field_meta : [];
    return (Array.isArray(catalog?.display_field_keys) ? catalog.display_field_keys : []).map((key: string) => {
      const normalizedKey = text(key);
      return storedMeta.find((field: any) => text(field?.key) === normalizedKey)
        || moduleConfig?.fields?.find((field: any) => text(field?.key) === normalizedKey)
        || { key: normalizedKey, labels: { fa: normalizedKey } };
    });
  }, [catalog?.display_field_keys, moduleConfig, presentation.field_meta]);
  const bundleGroups = useMemo(() => isBundleCatalog ? rawItems.map((bundle: any, bundleIndex: number) => ({
    ...bundle,
    __bundleIndex: bundleIndex,
    items: (Array.isArray(bundle?.items) ? bundle.items : []).map((item: any, itemIndex: number) => ({ ...item, __bundle: bundle, __bundleIndex: bundleIndex, __itemIndex: itemIndex })),
  })) : [], [isBundleCatalog, rawItems]);
  const catalogItems = useMemo(() => isBundleCatalog ? bundleGroups.flatMap((bundle: any) => bundle.items) : rawItems, [bundleGroups, isBundleCatalog, rawItems]);
  const filteredItems = useMemo(() => {
    const query = normalizeSearchText(searchQuery);
    if (!query) return catalogItems;
    return catalogItems.filter((item: any) => {
      const values = [text(item?.title), text(item?.__bundle?.title), ...visibleFields.flatMap((field: any) => {
        const value = item?.fields?.[field.key] ?? item?.[field.key];
        return [getFieldLabelFa(field, { moduleId, fallback: field?.labels?.fa || field?.title || field.key }), formatCatalogValue(field, value, currencyLabel)];
      }), ...Object.values(item?.catalog_details || {}).map(text)];
      return normalizeSearchText(values.join(' ')).includes(query);
    });
  }, [catalogItems, currencyLabel, moduleId, searchQuery, visibleFields]);
  const filteredBundleGroups = useMemo(() => bundleGroups.map((bundle: any) => ({
    ...bundle,
    items: bundle.items.filter((item: any) => filteredItems.includes(item)),
  })).filter((bundle: any) => bundle.items.length > 0), [bundleGroups, filteredItems]);
  const mapItems = useMemo(() => moduleId === 'billboards' ? filteredItems.map((item: any, index: number) => {
    const location = parseLocationValue(item?.location || item?.fields?.location);
    if (!location || !isInsideIran(location)) return null;
    const status = statusMeta.get(text(item?.status));
    return { item, index, location, color: status?.color || STATUS_COLORS.default };
  }).filter(Boolean) as any[] : [], [filteredItems, moduleId, statusMeta]);

  useEffect(() => { setSlideIndex(0); setSlidePausedByUser(false); }, [searchQuery, filteredItems.length]);
  useEffect(() => {
    if (!isSlide || slidePausedByUser || filteredItems.length < 2) return;
    const timer = window.setInterval(() => setSlideIndex((current) => (current + 1) % filteredItems.length), 6000);
    return () => window.clearInterval(timer);
  }, [filteredItems.length, isSlide, slidePausedByUser]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || moduleId !== 'billboards' || !mapItems.length || mapRef.current) return;
    ensureMapLibreRTLTextPlugin();
    const fallbackStyle = buildRasterStyle();
    const useRemoteStyle = Boolean(MAP_STYLE_URL);
    const map = new maplibregl.Map({ container, style: (useRemoteStyle ? fallbackStyle : buildMapStyle()) as any, transformRequest: buildMapTransformRequest() as any, center: [IRAN_CENTER[1], IRAN_CENTER[0]], zoom: 5, minZoom: 4, maxZoom: Math.max(MAP_MAX_ZOOM, 18), maxBounds: [[IRAN_BOUNDS[0][1], IRAN_BOUNDS[0][0]], [IRAN_BOUNDS[1][1], IRAN_BOUNDS[1][0]]], attributionControl: {} });
    mapRef.current = map;
    attachMissingMapImageFallback(map);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    if (useRemoteStyle) map.setStyle(MAP_STYLE_URL, { diff: false, transformStyle: sanitizeMapStyle } as any);
    const bounds = new maplibregl.LngLatBounds();
    mapItems.forEach(({ item, index, location, color }) => {
      bounds.extend([location.lng, location.lat]);
      const pin = createThemeMapPinElement({ interactive: true, size: 'md', color, strokeColor: color });
      pin.title = text(item?.title) || 'تبلیغ محیطی';
      pin.onclick = () => setSelectedItem({ ...item, __mapIndex: index });
      markersRef.current.push(new maplibregl.Marker({ element: pin, anchor: 'bottom' }).setLngLat([location.lng, location.lat]).addTo(map));
    });
    map.fitBounds(bounds, { padding: 42, maxZoom: 16, duration: 300 });
    return () => { markersRef.current.forEach((marker) => marker.remove()); markersRef.current = []; map.remove(); mapRef.current = null; };
  }, [mapItems, moduleId]);

  const imageUrl = (url: unknown, preset: 'card' | 'hero' | 'gallery' | 'thumb' = 'card') => buildImagePreviewUrl(normalizePublicAssetUrl(url) || text(url), preset === 'thumb' ? 'card' : preset, { forceTransform: true });
  const logoUrl = (url: unknown) => {
    const normalized = normalizePublicAssetUrl(url);
    if (!normalized || /^(data:|blob:)/i.test(normalized)) return '';
    return buildImagePreviewUrl(normalized, 'avatar', { forceTransform: true });
  };
  const renderBrandLogo = (url: unknown, alt: string, sizeClassName: string, lazy = false) => {
    const src = logoUrl(url);
    return src ? <div className={`${sizeClassName} shrink-0 overflow-hidden rounded-2xl bg-white/90 p-1 shadow-lg`}><img src={src} alt={alt} loading={lazy ? 'lazy' : undefined} decoding="async" referrerPolicy="no-referrer" className="block h-full w-full object-contain" /></div> : null;
  };
  const renderImage = (url: unknown, alt: string, className: string) => {
    if (!imagesEnabled) return null;
    return url ? <Image src={imageUrl(url, 'gallery')} preview={{ src: imageUrl(url, 'hero') }} alt={alt} className={className} /> : <div className={`${className} flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-5xl text-slate-400 dark:from-slate-800 dark:to-slate-700`}>★</div>;
  };
  const renderFields = (item: any, compact = false) => {
    const packagePricingKeys = new Set(['quantity', 'main_unit', 'unit_price', 'discount', 'total_price']);
    return <div className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-2'}`}>{visibleFields.map((field: any) => {
      if (isBundleCatalog && packagePricingKeys.has(text(field?.key))) return null;
      const value = item?.fields?.[field.key] ?? item?.[field.key];
      const formatted = formatCatalogValue(field, value, currencyLabel);
      return !formatted ? null : <div key={field.key} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"><div className="text-[10px] font-semibold text-slate-400">{getFieldLabelFa(field, { moduleId, fallback: field?.labels?.fa || field?.title || field.key })}</div><div className="mt-1 break-words text-sm font-bold text-slate-800 dark:text-slate-100">{formatted}</div></div>;
    })}</div>;
  };
  const pricingTile = (label: string, value: unknown, className = '') => {
    const formatted = formatCatalogValue({ type: FieldType.PRICE }, value, currencyLabel);
    return !formatted ? null : <div className={`rounded-xl border px-3 py-2 ${className}`}><div className="text-[10px] font-semibold opacity-80">{label}</div><div className="mt-1 break-words text-sm font-black">{formatted}</div></div>;
  };
  const renderPackageRowDetails = (item: any) => {
    const details = item?.catalog_details || {};
    const quantity = formatCatalogValue({ type: FieldType.NUMBER }, details.quantity, currencyLabel);
    const unitPrice = formatCatalogValue({ type: FieldType.PRICE }, details.unit_price, currencyLabel);
    const discountAmount = numberValue(details.discount_amount);
    const discountPercent = numberValue(details.discount_percent);
    const showDiscount = selectedFieldKeys.has('discount');
    return <div className="grid gap-2 sm:grid-cols-2">
      {quantity ? <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"><div className="text-[10px] font-semibold text-slate-400">تعداد / مقدار</div><div className="mt-1 text-sm font-bold">{quantity} {text(details.unit_name)}</div></div> : null}
      {unitPrice ? <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"><div className="text-[10px] font-semibold text-slate-400">قیمت واحد</div><div className="mt-1 text-sm font-bold">{unitPrice}</div></div> : null}
      {pricingTile('قیمت قبل از تخفیف', details.gross_price, 'border-red-100 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/35 dark:text-red-300 [&>div:last-child]:line-through')}
      {showDiscount && discountAmount > 0 ? <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-300"><div className="text-[10px] font-semibold opacity-80">تخفیف</div><div className="mt-1 text-sm font-black">{toPersianNumber(discountPercent.toLocaleString('en-US'))}٪ · {formatCatalogValue({ type: FieldType.PRICE }, discountAmount, currencyLabel)}</div></div> : null}
      {pricingTile('قیمت پکیج', details.total_price, 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-300')}
    </div>;
  };
  const renderInternalRowDetails = (item: any) => {
    const details = item?.catalog_details && typeof item.catalog_details === 'object' ? item.catalog_details : {};
    if (isBundleCatalog) {
      const description = text(details.description);
      return <div className="space-y-2">{renderPackageRowDetails(item)}{description ? <div className="flex gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm leading-6 text-slate-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-slate-200"><FileTextOutlined className="mt-1 text-amber-600" /><div><div className="text-xs font-bold text-amber-800 dark:text-amber-300">توضیحات ردیف</div><p className="m-0 whitespace-pre-wrap">{description}</p></div></div> : null}</div>;
    }
    const legacyRows = moduleId === 'price_lists' ? [
      !selectedFieldKeys.has('price') ? { label: 'قیمت فروش', value: details.price, type: FieldType.PRICE, currencyLabel: text(details.currency_label) || currencyLabel } : null,
      !selectedFieldKeys.has('unit_name') ? { label: 'واحد', value: details.unit_name } : null,
    ].filter(Boolean) as Array<{ label: string; value: any; type?: FieldType; currencyLabel?: string }> : [];
    const description = text(details.description);
    if (!legacyRows.some((row) => row.value !== null && row.value !== undefined && row.value !== '') && !description) return null;
    return <div className="space-y-2"><div className="grid gap-2 sm:grid-cols-2">{legacyRows.map((row) => {
      const value = row.type ? formatCatalogValue({ type: row.type }, row.value, row.currencyLabel || currencyLabel) : text(row.value);
      return !value ? null : <div key={row.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"><div className="text-[10px] font-semibold text-slate-400">{row.label}</div><div className="mt-1 break-words text-sm font-bold">{value}</div></div>;
    })}</div>{description ? <div className="flex gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm leading-6 text-slate-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-slate-200"><FileTextOutlined className="mt-1 text-amber-600" /><div><div className="text-xs font-bold text-amber-800 dark:text-amber-300">توضیحات ردیف</div><p className="m-0 whitespace-pre-wrap">{description}</p></div></div> : null}</div>;
  };
  const renderBundleSummary = (bundle: any, compact = false) => {
    const details = bundle?.catalog_details || {};
    const gross = details.gross_price;
    const discount = numberValue(details.discount_amount);
    const discountPercent = numberValue(details.discount_percent);
    const finalPrice = details.final_price;
    return <section className={`rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-4 shadow-sm dark:border-emerald-900/70 dark:from-slate-900 dark:to-emerald-950/35 ${compact ? 'mb-3' : 'mb-4'}`}>
      {!compact ? <h2 className="mb-3 text-xl font-black text-slate-900 dark:text-white">{text(bundle?.title) || 'پکیج'}</h2> : null}
      <div className="grid gap-2 sm:grid-cols-3">
        {pricingTile('قیمت پکیج قبل از تخفیف', gross, 'border-red-100 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/35 dark:text-red-300 [&>div:last-child]:line-through')}
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/35 dark:text-emerald-300"><div className="text-[10px] font-semibold opacity-80">سود شما از خرید این پکیج</div><div className="mt-1 break-words text-sm font-black">{discount > 0 ? `${toPersianNumber(discountPercent.toLocaleString('en-US'))}٪ · ${formatCatalogValue({ type: FieldType.PRICE }, discount, currencyLabel)}` : '—'}</div></div>
        {pricingTile('قیمت نهایی پکیج', finalPrice, 'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/55 dark:text-emerald-100')}
      </div>
    </section>;
  };
  const openNavigation = (item: any) => { const location = parseLocationValue(item?.location || item?.fields?.location); if (location) window.open(`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`, '_blank', 'noopener,noreferrer'); };
  const searchSection = <div className="order-first rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"><Input allowClear prefix={<SearchOutlined className="text-slate-400" />} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="جست‌وجو..." size="large" className="online-catalog-search" /></div>;
  const mapSection = moduleId === 'billboards' ? <section className="order-first space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-black">موقعیت تبلیغات محیطی</h2><div className="flex flex-wrap gap-2">{Array.from(new Set(mapItems.map(({ item }) => text(item?.status)))).map((key) => { const meta = statusMeta.get(key); return meta ? <span key={key} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold dark:bg-slate-800"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />{meta.label}</span> : null; })}</div></div>{mapItems.length ? <div ref={mapContainerRef} className="h-[26rem] overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700" /> : <div className="flex h-40 items-center justify-center rounded-3xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-slate-700">موقعیت معتبر برای نمایش روی نقشه پیدا نشد.</div>}</section> : null;
  const renderItemCard = (item: any, key: string) => {
    const status = statusMeta.get(text(item?.status));
    return <article key={key} className="group overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_15px_35px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(15,23,42,0.14)] dark:border-slate-700 dark:bg-slate-900">
      {renderImage(item?.image_url, text(item?.title), 'h-48 w-full object-cover')}
      <div className="space-y-3 p-4"><div className="flex items-start justify-between gap-2"><h2 className="min-w-0 text-lg font-black text-slate-900 dark:text-white">{text(item?.title) || 'بدون عنوان'}</h2>{status ? <Tag style={{ color: '#fff', backgroundColor: status.color, borderColor: status.color }} className="m-0 shrink-0">{status.label}</Tag> : null}</div>{renderInternalRowDetails(item)}{renderFields(item)}{moduleId === 'billboards' && parseLocationValue(item?.location || item?.fields?.location) ? <Button type="primary" icon={<EnvironmentOutlined />} onClick={() => openNavigation(item)}>مسیریابی</Button> : null}</div>
    </article>;
  };
  const renderGrid = () => isBundleCatalog
    ? <div className="space-y-6">{filteredBundleGroups.map((bundle: any) => <section key={`${bundle.__bundleIndex}-${text(bundle?.title)}`}><div>{renderBundleSummary(bundle)}</div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{bundle.items.map((item: any) => renderItemCard(item, `${bundle.__bundleIndex}-${item.__itemIndex}-${text(item?.title)}`))}</div></section>)}</div>
    : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filteredItems.map((item: any, index: number) => renderItemCard(item, `${index}-${text(item?.title)}`))}</div>;
  const renderSlide = () => {
    const item = filteredItems[Math.min(slideIndex, Math.max(0, filteredItems.length - 1))];
    if (!item) return null;
    const status = statusMeta.get(text(item?.status));
    const selectSlide = (next: number) => setSlideIndex((next + filteredItems.length) % filteredItems.length);
    const pauseForScroll = () => setSlidePausedByUser(true);
    const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
      const startX = slideTouchStartX.current;
      slideTouchStartX.current = null;
      if (startX === null) return;
      const delta = event.changedTouches[0].clientX - startX;
      if (Math.abs(delta) < 42) return;
      pauseForScroll();
      selectSlide(delta > 0 ? slideIndex - 1 : slideIndex + 1);
    };
    return <div className="relative rounded-[2rem] border border-slate-200 bg-white p-3 shadow-[0_20px_55px_rgba(15,23,42,.12)] dark:border-slate-700 dark:bg-slate-900" onTouchMove={pauseForScroll} onTouchStart={(event) => { slideTouchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={onTouchEnd} onWheel={(event) => { if (window.innerWidth < 768 && Math.abs(event.deltaY) > 20) { pauseForScroll(); selectSlide(slideIndex + (event.deltaY > 0 ? 1 : -1)); } }}>
      <div className="mb-3 flex items-center justify-center gap-3 text-sm font-bold text-slate-600 dark:text-slate-300"><button type="button" aria-label="اسلاید قبلی" className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-[rgb(var(--brand-500-rgb,59,130,246))] hover:text-[rgb(var(--brand-600-rgb,37,99,235))] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" onClick={() => selectSlide(slideIndex - 1)}><ArrowRightOutlined /></button><span>{toPersianNumber(slideIndex + 1)} از {toPersianNumber(filteredItems.length)}</span><button type="button" aria-label="اسلاید بعدی" className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-[rgb(var(--brand-500-rgb,59,130,246))] hover:text-[rgb(var(--brand-600-rgb,37,99,235))] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" onClick={() => selectSlide(slideIndex + 1)}><ArrowLeftOutlined /></button></div>
      {isBundleCatalog ? renderBundleSummary(item.__bundle, true) : null}
      <div className={`grid gap-4 ${imagesEnabled ? 'md:grid-cols-2' : ''}`}>
        {imagesEnabled ? <div className="min-w-0">{renderImage(item?.image_url, text(item?.title), 'h-64 w-full rounded-[1.5rem] object-cover sm:h-80 md:h-full md:min-h-[28rem]')}</div> : null}
        <div className="min-w-0 p-2 sm:p-4 md:p-8"><div className="flex items-start gap-2"><h2 className="min-w-0 text-2xl font-black text-slate-900 dark:text-[rgb(var(--brand-text-rgb))] sm:text-3xl">{text(item?.title) || 'بدون عنوان'}</h2>{status ? <Tag style={{ color: '#fff', backgroundColor: status.color, borderColor: status.color }}>{status.label}</Tag> : null}</div><div className="mt-5 space-y-3">{renderInternalRowDetails(item)}{renderFields(item)}</div>{moduleId === 'billboards' && parseLocationValue(item?.location || item?.fields?.location) ? <Button className="mt-5 w-fit" type="primary" icon={<EnvironmentOutlined />} onClick={() => openNavigation(item)}>مسیریابی</Button> : null}</div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2"><Button className="border-slate-200 bg-white text-slate-700 shadow-sm hover:!border-[rgb(var(--brand-500-rgb,59,130,246))] hover:!text-[rgb(var(--brand-600-rgb,37,99,235))] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" icon={<ArrowRightOutlined />} onClick={() => selectSlide(slideIndex - 1)}>قبلی</Button><Button className="border-slate-200 bg-white text-slate-700 shadow-sm hover:!border-[rgb(var(--brand-500-rgb,59,130,246))] hover:!text-[rgb(var(--brand-600-rgb,37,99,235))] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" icon={<ArrowLeftOutlined />} onClick={() => selectSlide(slideIndex + 1)}>بعدی</Button></div>
    </div>;
  };

  if (loading) return <BrandLoadingScreen message="در حال بارگذاری کاتالوگ آنلاین…" />;
  if (!catalog || payload?.error) return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-5 dark:bg-slate-950"><Empty description="کاتالوگ عمومی فعال پیدا نشد" /></div>;
  const palette = text(company?.palette_key || 'blue');
  const catalogTags = Array.isArray(catalog?.tags) ? catalog.tags : [];

  return <main className={`online-catalog-public online-catalog-${palette} min-h-screen bg-slate-100 px-3 py-4 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:px-6 sm:py-8`} dir="rtl"><div className="mx-auto max-w-7xl"><section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/85 shadow-[0_26px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/90"><header className="relative overflow-hidden bg-gradient-to-br from-[rgb(var(--brand-800-rgb,30,58,138))] via-[rgb(var(--brand-600-rgb,37,99,235))] to-[rgb(var(--brand-400-rgb,96,165,250))] px-5 py-7 text-white sm:px-10 sm:py-10"><div className="relative flex flex-wrap items-center gap-4">{renderBrandLogo(company.logo_url, 'لوگوی سازمان', 'h-16 w-16') || <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-3xl">★</div>}<div className="min-w-0"><div className="text-sm font-semibold text-white/75">{text(company.trade_name || company.company_name)}</div><h1 className="mt-1 text-2xl font-black sm:text-4xl">{text(catalog.title)}</h1>{company.slogan ? <div className="mt-2 text-sm text-white/80">{text(company.slogan)}</div> : null}</div></div>{catalog.description ? <p className="relative mt-6 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-white/90 sm:text-base">{text(catalog.description)}</p> : null}{catalogTags.length ? <div className="relative mt-4 flex flex-wrap gap-2">{catalogTags.map((tag: any, index: number) => <Tag key={index} color={tag?.color || 'blue'}>{text(tag?.title || tag?.label || tag)}</Tag>)}</div> : null}</header><div className="flex flex-col gap-6 p-4 sm:p-8">{presentation.organization_intro ? <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600 dark:bg-slate-800 dark:text-slate-200">{text(presentation.organization_intro)}</p> : null}{Array.isArray(presentation.feature_cards) && presentation.feature_cards.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{presentation.feature_cards.slice(0, 4).map((card: any, index: number) => <div key={index} className="rounded-2xl border border-white/70 bg-white/80 p-4 text-center shadow-[0_8px_25px_rgba(15,23,42,.06)] dark:border-slate-700 dark:bg-slate-800"><div className="text-2xl">{getOnlineCatalogIcon(card?.icon)}</div><div className="mt-2 font-black">{text(card?.title) || 'ویژگی'}</div>{card?.subtitle ? <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">{text(card.subtitle)}</div> : null}</div>)}</div> : null}{searchSection}{mapSection}{filteredItems.length === 0 ? <Alert type="info" showIcon message={searchQuery.trim() ? 'نتیجه‌ای برای جست‌وجوی شما پیدا نشد.' : 'رکوردی برای نمایش در این کاتالوگ پیدا نشد.'} /> : (isSlide ? renderSlide() : renderGrid())}{Array.isArray(presentation.customers) && presentation.customers.length ? <section><h2 className="mb-3 text-lg font-black">بخشی از مشتریان ما</h2><div className="flex flex-wrap gap-3">{presentation.customers.map((customer: any, index: number) => <div key={index} className="flex max-w-full items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold dark:bg-slate-800">{renderBrandLogo(customer?.logo_url, text(customer?.name) || 'لوگوی مشتری', 'h-9 w-9', true)}<span className="min-w-0 break-words">{text(customer?.name)}</span></div>)}</div></section> : null}<footer className="grid gap-3 border-t border-slate-200 pt-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300 sm:grid-cols-2 lg:grid-cols-4">{presentation.advisor_name ? <span>مشاور شما: {text(presentation.advisor_name)}</span> : null}{company.phone ? <span><PhoneOutlined /> {text(company.phone)}</span> : null}{company.mobile ? <span><PhoneOutlined /> {text(company.mobile)}</span> : null}{company.email ? <span><MailOutlined /> {text(company.email)}</span> : null}{company.website ? <span><GlobalOutlined /> {text(company.website)}</span> : null}{company.address ? <span className="sm:col-span-2 lg:col-span-4"><EnvironmentOutlined /> {text(company.address)}</span> : null}</footer></div></section>{selectedItem ? <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-slate-950/45 p-3 sm:items-center" onClick={() => setSelectedItem(null)}><div className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><h2 className="text-xl font-black">{text(selectedItem.title) || 'تبلیغ محیطی'}</h2><button type="button" className="text-slate-400" onClick={() => setSelectedItem(null)}>×</button></div>{imagesEnabled && selectedItem.image_url ? <div className="mt-4">{renderImage(selectedItem.image_url, text(selectedItem.title), 'h-52 w-full rounded-2xl object-cover')}</div> : null}<div className="mt-4">{renderFields(selectedItem)}</div>{moduleId === 'billboards' ? <Button className="mt-4" type="primary" icon={<SendOutlined />} onClick={() => openNavigation(selectedItem)}>مسیریابی</Button> : null}</div></div> : null}</div></main>;
};

export default OnlineCatalogPublicPage;
