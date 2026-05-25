import React, { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { IRAN_BOUNDS, IRAN_CENTER, type LocationLatLng } from '../../utils/location';
import {
  buildMapStyle,
  buildMapTransformRequest,
  buildRasterStyle,
  MAP_MAX_ZOOM,
  MAP_STYLE_URL,
  sanitizeMapStyle,
} from '../../utils/mapConfig';
import { attachMissingMapImageFallback, ensureMapLibreRTLTextPlugin } from '../../utils/maplibreRuntime';
import { createThemeMapPinElement } from '../../utils/mapPin';

type LocationPickerMapProps = {
  value: LocationLatLng | null;
  onChange: (value: LocationLatLng) => void;
};

const LocationPickerMap: React.FC<LocationPickerMapProps> = ({ value, onChange }) => {
  const mapContainerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const markerRef = React.useRef<maplibregl.Marker | null>(null);
  const mapMaxZoom = Math.max(MAP_MAX_ZOOM, 18);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const [[minLat, minLng], [maxLat, maxLng]] = IRAN_BOUNDS;
    const center: [number, number] = value ? [value.lng, value.lat] : [IRAN_CENTER[1], IRAN_CENTER[0]];
    const useRemoteStyle = Boolean(MAP_STYLE_URL);
    const rasterFallbackStyle = buildRasterStyle();
    let fallbackApplied = false;

    ensureMapLibreRTLTextPlugin();

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: (useRemoteStyle ? rasterFallbackStyle : buildMapStyle()) as any,
      transformRequest: buildMapTransformRequest() as any,
      center,
      zoom: value ? 12 : 5,
      minZoom: 4,
      maxZoom: mapMaxZoom,
      maxBounds: [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      attributionControl: {},
    });

    mapRef.current = map;
    map.on('load', () => {
      map.resize();
      window.requestAnimationFrame(() => map.resize());
      window.setTimeout(() => map.resize(), 220);
    });
    attachMissingMapImageFallback(map);
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
    if (useRemoteStyle) {
      map.setStyle(MAP_STYLE_URL, { diff: false, transformStyle: sanitizeMapStyle } as any);
    }
    map.on('click', (event) => {
      onChange({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [mapMaxZoom, onChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const lngLat: [number, number] = [value.lng, value.lat];
    map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 11), duration: 400 });

    if (!markerRef.current) {
      const markerElement = createThemeMapPinElement({ interactive: false, size: 'md' });
      markerRef.current = new maplibregl.Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat(lngLat)
        .addTo(map);
      return;
    }

    markerRef.current.setLngLat(lngLat);
  }, [value]);

  return <div ref={mapContainerRef} style={{ width: '100%', height: 360, borderRadius: 12 }} />;
};

export default LocationPickerMap;
