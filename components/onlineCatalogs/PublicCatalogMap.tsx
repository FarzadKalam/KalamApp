import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Modal, Tag } from 'antd';
import { EnvironmentOutlined } from '@ant-design/icons';
import maplibregl from 'maplibre-gl';
import { billboardConfig } from '../../modules/billboardsConfig';
import { parseLocationValue, IRAN_BOUNDS, IRAN_CENTER, isInsideIran } from '../../utils/location';
import { buildMapStyle, buildMapTransformRequest, buildRasterStyle, MAP_MAX_ZOOM, MAP_STYLE_URL, sanitizeMapStyle } from '../../utils/mapConfig';
import { attachMissingMapImageFallback, ensureMapLibreRTLTextPlugin } from '../../utils/maplibreRuntime';
import { createThemeMapPinElement } from '../../utils/mapPin';
import { resolveMapStatusColor } from '../../utils/mapStatusColor';
import { getFieldLabelFa } from '../../utils/fieldLabel';
import { getFinancialStatusLabelFa } from '../../utils/financialValueLabels';

type PublicItem = { title?: string; image_url?: string | null; status?: string | null; location?: unknown; fields?: Record<string, unknown> };

const statusOptions = ((billboardConfig.fields.find((field: any) => field.key === 'status') as any)?.options || []);
const statusMeta = (status: unknown) => statusOptions.find((item: any) => String(item.value) === String(status)) || null;

const PublicCatalogMap: React.FC<{ items: PublicItem[]; displayFieldKeys: string[] }> = ({ items, displayFieldKeys }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const points = useMemo(() => items.map((item, index) => ({ item, index, point: parseLocationValue(item.location) }))
    .filter((entry) => !!entry.point && isInsideIran(entry.point!)), [items]);
  const legend = useMemo(() => Array.from(new Map(points.map(({ item }) => {
    const meta = statusMeta(item.status);
    return [String(item.status || ''), { label: meta?.label || getFinancialStatusLabelFa(item.status, 'نامشخص'), color: resolveMapStatusColor(meta?.color) || '#64748b' }];
  })).values()), [points]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !points.length) return;
    const [[minLat, minLng], [maxLat, maxLng]] = IRAN_BOUNDS;
    const fallbackStyle = buildRasterStyle();
    const map = new maplibregl.Map({
      container: containerRef.current, style: (MAP_STYLE_URL ? fallbackStyle : buildMapStyle()) as any,
      transformRequest: buildMapTransformRequest() as any, center: [IRAN_CENTER[1], IRAN_CENTER[0]], zoom: 5,
      minZoom: 4, maxZoom: Math.max(MAP_MAX_ZOOM, 18), maxBounds: [[minLng, minLat], [maxLng, maxLat]], attributionControl: {},
    });
    mapRef.current = map;
    ensureMapLibreRTLTextPlugin();
    map.on('load', () => map.resize());
    attachMissingMapImageFallback(map);
    if (MAP_STYLE_URL) map.setStyle(MAP_STYLE_URL, { diff: false, transformStyle: sanitizeMapStyle } as any);
    return () => { markersRef.current.forEach((marker) => marker.remove()); map.remove(); mapRef.current = null; };
  }, [points.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !points.length) return;
    markersRef.current.forEach((marker) => marker.remove());
    const bounds = new maplibregl.LngLatBounds();
    points.forEach(({ item, index, point }) => {
      if (!point) return;
      bounds.extend([point.lng, point.lat]);
      const meta = statusMeta(item.status);
      const markerElement = createThemeMapPinElement({ interactive: true, size: 'md', color: resolveMapStatusColor(meta?.color) || undefined });
      markerElement.title = String(item.title || 'تبلیغات محیطی');
      markerElement.onclick = (event) => { event.preventDefault(); setSelectedIndex(index); };
      markersRef.current.push(new maplibregl.Marker({ element: markerElement, anchor: 'bottom' }).setLngLat([point.lng, point.lat]).addTo(map));
    });
    map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 0 });
  }, [points]);

  const selected = selectedIndex === null ? null : items[selectedIndex];
  const selectedLocation = selected ? parseLocationValue(selected.location) : null;
  if (!points.length) return <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8"><Empty description="موقعیت معتبر برای نمایش نقشه ثبت نشده است" /></div>;
  return <section className="mt-8 overflow-hidden rounded-3xl border border-white/70 bg-white/65 p-3 shadow-[0_18px_46px_rgba(15,23,42,.10)] backdrop-blur-xl">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 pt-1"><div className="font-black text-slate-800">نقشه تبلیغات محیطی</div><div className="flex flex-wrap gap-2">{legend.map((item) => <span key={item.label} className="inline-flex items-center gap-1 text-xs text-slate-600"><i className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />{item.label}</span>)}</div></div>
    <div ref={containerRef} className="h-[360px] w-full overflow-hidden rounded-2xl" />
    <Modal open={!!selected} footer={null} onCancel={() => setSelectedIndex(null)} title={selected?.title || 'اطلاعات تبلیغات محیطی'}>
      {selected ? <div className="space-y-4">{selected.image_url ? <img src={String(selected.image_url)} alt="تصویر تبلیغات محیطی" className="h-52 w-full rounded-2xl object-cover" /> : null}
        {statusMeta(selected.status) ? <Tag color={statusMeta(selected.status)?.color}>{statusMeta(selected.status)?.label}</Tag> : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{displayFieldKeys.map((key) => <div key={key} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-500">{getFieldLabelFa((billboardConfig.fields as any[]).find((field) => field.key === key) || { key }, { moduleId: 'billboards', fallback: key })}</div><div className="mt-1 break-words font-semibold text-slate-800">{String(selected.fields?.[key] ?? '—')}</div></div>)}</div>
        {selectedLocation ? <Button block icon={<EnvironmentOutlined />} onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedLocation.lat},${selectedLocation.lng}`, '_blank', 'noopener,noreferrer')}>مسیریابی</Button> : null}
      </div> : null}
    </Modal>
  </section>;
};

export default PublicCatalogMap;
