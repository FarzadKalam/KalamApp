import React, { useEffect, useMemo, useRef } from 'react';
import { Empty } from 'antd';
import maplibregl from 'maplibre-gl';
import { FieldType, ModuleDefinition } from '../../types';
import { getRecordTitle } from '../../utils/recordTitle';
import { formatLocationValue, IRAN_BOUNDS, IRAN_CENTER, isInsideIran, parseLocationValue } from '../../utils/location';
import { buildMapStyle, buildRasterStyle, MAP_MAX_ZOOM, MAP_STYLE_URL } from '../../utils/mapConfig';
import { createThemeMapPinElement } from '../../utils/mapPin';

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
  popupTitle: string;
  popupRows: Array<{ label: string; value: string }>;
};

const MapView: React.FC<MapViewProps> = ({ data, moduleId, moduleConfig, navigate }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupHostRef = useRef<HTMLDivElement | null>(null);
  const popupPointRef = useRef<PointRecord | null>(null);
  const updatePopupPositionRef = useRef<(() => void) | null>(null);
  const mapMaxZoom = Math.max(MAP_MAX_ZOOM, 18);

  const closeFloatingPopup = () => {
    popupPointRef.current = null;
    if (!popupHostRef.current) return;
    popupHostRef.current.innerHTML = '';
    popupHostRef.current.style.display = 'none';
  };

  const updateFloatingPopupPosition = () => {
    const map = mapRef.current;
    const mapContainer = mapContainerRef.current;
    const popupHost = popupHostRef.current;
    const point = popupPointRef.current;
    if (!map || !mapContainer || !popupHost || !point || !popupHost.firstElementChild) return;

    const mapRect = mapContainer.getBoundingClientRect();
    const projected = map.project([point.lng, point.lat]);
    const popupCard = popupHost.firstElementChild as HTMLElement;
    const popupWidth = popupCard.offsetWidth || 280;
    const popupHeight = popupCard.offsetHeight || 220;
    const viewportPadding = 12;

    let left = mapRect.left + projected.x - popupWidth / 2;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - popupWidth - viewportPadding));

    let top = mapRect.top + projected.y - popupHeight - 22;
    if (top < viewportPadding) {
      top = mapRect.top + projected.y + 20;
    }

    popupHost.style.left = `${Math.round(left)}px`;
    popupHost.style.top = `${Math.round(top)}px`;
  };

  const openFloatingPopup = (point: PointRecord) => {
    const popupHost = popupHostRef.current;
    if (!popupHost) return;

    popupHost.innerHTML = '';

    const popupCard = document.createElement('div');
    popupCard.className = 'kalam-map-floating-popup';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'kalam-map-floating-popup__close';
    closeButton.textContent = '×';
    closeButton.onclick = () => closeFloatingPopup();

    const popupContent = document.createElement('div');
    popupContent.className = 'kalam-map-popup__content';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'kalam-map-popup__title-wrap';

    const title = document.createElement('div');
    title.textContent = point.popupTitle || point.label;
    title.className = 'kalam-map-popup__title';

    const subtitle = document.createElement('div');
    subtitle.textContent = point.label;
    subtitle.className = 'kalam-map-popup__subtitle';

    titleWrap.appendChild(title);
    if (point.popupTitle !== point.label) {
      titleWrap.appendChild(subtitle);
    }

    const detailsBox = document.createElement('div');
    detailsBox.className = 'kalam-map-popup__details';

    point.popupRows.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'kalam-map-popup__row';

      const key = document.createElement('span');
      key.textContent = item.label;
      key.className = 'kalam-map-popup__key';

      const value = document.createElement('span');
      value.textContent = item.value;
      value.className = 'kalam-map-popup__value';

      row.appendChild(key);
      row.appendChild(value);
      detailsBox.appendChild(row);
    });

    const viewLink = document.createElement('a');
    viewLink.href = `/${moduleId}/${point.id}`;
    viewLink.className = 'kalam-map-popup__action';
    viewLink.onclick = (event) => {
      event.preventDefault();
      closeFloatingPopup();
      navigate(`/${moduleId}/${point.id}`);
    };

    const icon = document.createElement('span');
    icon.textContent = '↗';
    icon.className = 'kalam-map-popup__action-icon';

    const text = document.createElement('span');
    text.textContent = 'مشاهده جزئیات';
    text.className = 'kalam-map-popup__action-text';

    viewLink.appendChild(text);
    viewLink.appendChild(icon);

    popupContent.appendChild(titleWrap);
    popupContent.appendChild(detailsBox);
    popupContent.appendChild(viewLink);

    popupCard.appendChild(closeButton);
    popupCard.appendChild(popupContent);
    popupHost.appendChild(popupCard);
    popupHost.style.display = 'block';

    popupPointRef.current = point;
    updatePopupPositionRef.current?.();
    window.requestAnimationFrame(() => updatePopupPositionRef.current?.());
  };

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

  const points = useMemo<PointRecord[]>(() => {
    if (!locationFieldKeys.length) return [];

    const resolveOptionValue = (fieldKey: string, value: any) => {
      if (value === null || value === undefined) return '';
      const normalized = String(value).trim();
      if (!normalized) return '';
      return optionLabelLookup[fieldKey]?.[normalized] || normalized;
    };

    return data
      .map((record: any) => {
        for (const fieldKey of locationFieldKeys) {
          const parsed = parseLocationValue(record?.[fieldKey]);
          if (!parsed) continue;
          if (!isInsideIran(parsed)) continue;
          const rawLocation = formatLocationValue(parsed);
          const baseLabel = getRecordTitle(record, moduleConfig, { fallback: '-' });
          const prefix = resolveOptionValue('prefix', record?.prefix);
          const firstName = String(record?.first_name || '').trim();
          const lastName = String(record?.last_name || '').trim();
          const businessName = String(record?.business_name || '').trim();
          const rank = resolveOptionValue('rank', record?.rank);
          const status = resolveOptionValue('status', record?.status);
          const phone = String(record?.mobile_1 || record?.phone || record?.mobile_2 || '').trim();
          const popupRows: Array<{ label: string; value: string }> = [];

          let popupTitle = baseLabel;
          if (moduleId === 'customers') {
            popupTitle = [prefix, firstName, lastName].filter(Boolean).join(' ') || baseLabel;
            popupRows.push({ label: 'سطح مشتری', value: rank || 'ثبت نشده' });
            popupRows.push({ label: 'وضعیت مشتری', value: status || 'ثبت نشده' });
            popupRows.push({ label: 'پیشوند', value: prefix || 'ثبت نشده' });
            popupRows.push({ label: 'نام', value: firstName || 'ثبت نشده' });
            popupRows.push({ label: 'نام خانوادگی', value: lastName || 'ثبت نشده' });
            popupRows.push({ label: 'نام کسب و کار', value: businessName || 'ثبت نشده' });
            popupRows.push({ label: 'شماره تلفن', value: phone || 'ثبت نشده' });
          } else if (phone) {
            popupRows.push({ label: 'شماره تلفن', value: phone });
          }

          popupRows.push({ label: 'موقعیت', value: rawLocation });

          return {
            id: String(record?.id || ''),
            lat: parsed.lat,
            lng: parsed.lng,
            label: baseLabel,
            rawLocation,
            popupTitle,
            popupRows,
          };
        }
        return null;
      })
      .filter(Boolean) as PointRecord[];
  }, [data, locationFieldKeys, moduleConfig, moduleId, optionLabelLookup]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const [[minLat, minLng], [maxLat, maxLng]] = IRAN_BOUNDS;
    const useRemoteStyle = Boolean(MAP_STYLE_URL);
    const rasterFallbackStyle = buildRasterStyle();
    let fallbackApplied = false;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildMapStyle() as any,
      center: [IRAN_CENTER[1], IRAN_CENTER[0]],
      zoom: 5,
      minZoom: 4,
      maxZoom: mapMaxZoom,
      maxBounds: [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      attributionControl: true,
    });

    mapRef.current = map;
    const popupHost = document.createElement('div');
    popupHost.className = 'kalam-map-floating-popup-host';
    popupHost.style.display = 'none';
    document.body.appendChild(popupHost);
    popupHostRef.current = popupHost;
    updatePopupPositionRef.current = updateFloatingPopupPosition;

    const handleMapClick = () => closeFloatingPopup();
    const handleWindowResize = () => updatePopupPositionRef.current?.();
    const handleWindowScroll = () => updatePopupPositionRef.current?.();
    const handleDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.kalam-map-floating-popup')) return;
      if (target.closest('.kalam-map-pin')) return;
      closeFloatingPopup();
    };

    map.on('load', () => map.resize());
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserHeading: false,
      }),
      'top-left'
    );
    map.on('move', handleWindowResize);
    map.on('resize', handleWindowResize);
    map.on('click', handleMapClick);
    map.on('error', (event: any) => {
      if (!useRemoteStyle || fallbackApplied) return;
      const message = String(event?.error?.message || event?.error || '').toLowerCase();
      if (!message) return;

      const shouldFallback =
        message.includes('failed to fetch') ||
        message.includes('ajaxerror') ||
        message.includes('connection') ||
        message.includes('timeout') ||
        message.includes('err_connection');

      if (!shouldFallback) return;

      fallbackApplied = true;
      map.setStyle(rasterFallbackStyle as any, { diff: false } as any);
    });

    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('scroll', handleWindowScroll, true);
    document.addEventListener('mousedown', handleDocumentMouseDown, true);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('scroll', handleWindowScroll, true);
      document.removeEventListener('mousedown', handleDocumentMouseDown, true);
      map.off('move', handleWindowResize);
      map.off('resize', handleWindowResize);
      map.off('click', handleMapClick);
      closeFloatingPopup();
      popupHostRef.current?.remove();
      popupHostRef.current = null;
      updatePopupPositionRef.current = null;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mapMaxZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    closeFloatingPopup();
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (!points.length) {
      map.easeTo({ center: [IRAN_CENTER[1], IRAN_CENTER[0]], zoom: 5 });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();

    points.forEach((point) => {
      bounds.extend([point.lng, point.lat]);

      const markerElement = createThemeMapPinElement({ interactive: true, size: 'md' });
      markerElement.classList.add('kalam-map-pin');
      markerElement.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFloatingPopup(point);
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
  }, [mapMaxZoom, moduleId, navigate, points]);

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
    </div>
  );
};

export default MapView;
