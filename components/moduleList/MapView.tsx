import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Empty } from 'antd';
import maplibregl from 'maplibre-gl';
import { FieldType, ModuleDefinition } from '../../types';
import { getRecordTitle } from '../../utils/recordTitle';
import { formatLocationValue, IRAN_BOUNDS, IRAN_CENTER, isInsideIran, parseLocationValue } from '../../utils/location';
import { buildMapStyle, buildMapTransformRequest, buildRasterStyle, MAP_MAX_ZOOM, MAP_STYLE_URL } from '../../utils/mapConfig';
import { createThemeMapPinElement } from '../../utils/mapPin';
import RelatedRecordPopover from '../RelatedRecordPopover';

type MapViewProps = {
  data: any[];
  moduleId: string;
  moduleConfig: ModuleDefinition;
  navigate: (path: string) => void;
};

type PointRecord = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  rawLocation: string;
  statusColor?: string;
};

const STATUS_COLOR_MAP: Record<string, string> = {
  green: '#16a34a',
  red: '#dc2626',
  blue: '#2563eb',
  orange: '#ea580c',
  yellow: '#ca8a04',
  purple: '#7c3aed',
  cyan: '#0891b2',
  gray: '#64748b',
  grey: '#64748b',
};

const resolveStatusColor = (rawColor: any) => {
  const color = String(rawColor || '').trim().toLowerCase();
  if (!color) return '';
  if (color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl')) return color;
  return STATUS_COLOR_MAP[color] || '';
};

const MapView: React.FC<MapViewProps> = ({ data, moduleId, moduleConfig, navigate }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const mapMaxZoom = Math.max(MAP_MAX_ZOOM, 18);
  const [previewRecordId, setPreviewRecordId] = useState<string | null>(null);

  const locationFieldKeys = useMemo(() => {
    const byType = moduleConfig.fields
      .filter((field) => field.type === FieldType.LOCATION)
      .map((field) => field.key);

    if (byType.length) return byType;

    return moduleConfig.fields
      .filter((field) => field.key === 'location')
      .map((field) => field.key);
  }, [moduleConfig.fields]);

  const optionLabelLookup = useMemo<Record<string, Record<string, string>>>(() => {
    const lookup: Record<string, Record<string, string>> = {};

    moduleConfig.fields.forEach((field: any) => {
      const options = Array.isArray(field?.options) ? field.options : [];
      if (!options.length) return;

      const map: Record<string, string> = {};
      options.forEach((opt: any) => {
        if (opt?.value === undefined || opt?.value === null) return;
        const value = String(opt.value);
        if (!value) return;
        map[value] = String(opt?.label || value);
      });

      if (Object.keys(map).length) {
        lookup[String(field.key)] = map;
      }
    });

    return lookup;
  }, [moduleConfig.fields]);

  const statusColorLookup = useMemo<Record<string, string>>(() => {
    const statusField = moduleConfig.fields.find((field: any) => String(field?.key || '') === 'status');
    const options = Array.isArray((statusField as any)?.options) ? (statusField as any).options : [];
    const map: Record<string, string> = {};
    options.forEach((opt: any) => {
      const value = String(opt?.value || '').trim();
      if (!value) return;
      const color = resolveStatusColor(opt?.color);
      if (color) map[value] = color;
    });
    return map;
  }, [moduleConfig.fields]);

  const points = useMemo<PointRecord[]>(() => {
    if (!locationFieldKeys.length) return [];

    return data
      .map((record: any) => {
        for (const fieldKey of locationFieldKeys) {
          const parsed = parseLocationValue(record?.[fieldKey]);
          if (!parsed) continue;
          if (!isInsideIran(parsed)) continue;

          const rawLocation = formatLocationValue(parsed);
          const baseLabel = getRecordTitle(record, moduleConfig, { fallback: '-' });
          const statusKey = String(record?.status || '').trim();

          return {
            id: String(record?.id || ''),
            lat: parsed.lat,
            lng: parsed.lng,
            label: baseLabel,
            rawLocation,
            statusColor: statusColorLookup[statusKey] || undefined,
          };
        }
        return null;
      })
      .filter(Boolean) as PointRecord[];
  }, [data, locationFieldKeys, moduleConfig, statusColorLookup, optionLabelLookup]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const [[minLat, minLng], [maxLat, maxLng]] = IRAN_BOUNDS;
    const useRemoteStyle = Boolean(MAP_STYLE_URL);
    const rasterFallbackStyle = buildRasterStyle();
    let fallbackApplied = false;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle() as any,
      transformRequest: buildMapTransformRequest() as any,
      center: [IRAN_CENTER[1], IRAN_CENTER[0]],
      zoom: 5,
      minZoom: 4,
      maxZoom: mapMaxZoom,
      maxBounds: [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      attributionControl: {},
    });

    mapRef.current = map;
    map.on('load', () => map.resize());
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
      }),
      'top-left'
    );
    map.on('error', (event: any) => {
      if (!useRemoteStyle || fallbackApplied) return;
      const message = String(event?.error?.message || event?.error || '').toLowerCase();
      if (!message) return;

      const shouldFallback =
        message.includes('failed to fetch') ||
        message.includes('ajaxerror') ||
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('err_connection') ||
        message.includes('style');

      if (!shouldFallback) return;

      fallbackApplied = true;
      map.setStyle(rasterFallbackStyle as any, { diff: false } as any);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mapMaxZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (!points.length) {
      map.easeTo({ center: [IRAN_CENTER[1], IRAN_CENTER[0]], zoom: 5 });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();

    points.forEach((point) => {
      bounds.extend([point.lng, point.lat]);

      const markerElement = createThemeMapPinElement({
        interactive: true,
        size: 'md',
        color: point.statusColor,
      });
      markerElement.classList.add('kalam-map-pin');
      markerElement.title = point.label;
      markerElement.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPreviewRecordId(point.id);
      };

      const marker = new maplibregl.Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat([point.lng, point.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    map.fitBounds(bounds, {
      padding: 40,
      maxZoom: Math.min(mapMaxZoom, 16),
      duration: 500,
    });
  }, [mapMaxZoom, points]);

  const activePoint = useMemo(
    () => (previewRecordId ? points.find((point) => String(point.id) === String(previewRecordId)) || null : null),
    [points, previewRecordId]
  );

  if (!locationFieldKeys.length) {
    return (
      <div className="h-full min-h-[420px] rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-[#171717] flex items-center justify-center">
        <Empty description="فیلد لوکیشن در این ماژول تعریف نشده است" />
      </div>
    );
  }

  if (!points.length) {
    return (
      <div className="h-full min-h-[420px] rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-[#171717] flex items-center justify-center">
        <Empty description="موقعیت معتبر داخل ایران یافت نشد" />
      </div>
    );
  }

  const hasConfiguredTiles = Boolean(MAP_STYLE_URL || import.meta.env.VITE_MAP_TILE_URL);

  return (
    <div className="kalam-map-root relative h-full min-h-[420px] rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
      {!hasConfiguredTiles && (
        <div className="absolute top-3 right-3 z-[1000] text-[11px] px-2 py-1 rounded bg-yellow-100 text-yellow-900 border border-yellow-300">
          لطفا `VITE_MAP_STYLE_URL` را روی style.json سرور نقشه تنظیم کنید
        </div>
      )}
      <div ref={mapContainerRef} className="kalam-map-container h-full w-full rounded-2xl" />

      {previewRecordId && (
        <RelatedRecordPopover
          mode="modal"
          moduleId={moduleId}
          recordId={previewRecordId}
          label={activePoint?.label || previewRecordId}
          open={!!previewRecordId}
          overlayZIndex={6200}
          onOpenChange={(next) => {
            if (!next) setPreviewRecordId(null);
          }}
          onNavigate={(path) => {
            setPreviewRecordId(null);
            navigate(path);
          }}
        />
      )}
    </div>
  );
};

export default MapView;
