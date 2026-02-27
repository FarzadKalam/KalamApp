import React, { useMemo, useEffect } from 'react';
import { Empty } from 'antd';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { FieldType, ModuleDefinition } from '../../types';
import { getRecordTitle } from '../../utils/recordTitle';
import { formatLocationValue, IRAN_BOUNDS, IRAN_CENTER, isInsideIran, parseLocationValue } from '../../utils/location';
import { MAP_TILE_ATTRIBUTION, MAP_TILE_URL } from '../../utils/mapConfig';

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
};

const FitBoundsToPoints: React.FC<{ points: PointRecord[] }> = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!points.length) {
      map.setView(IRAN_CENTER, 5);
      return;
    }

    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.25), { maxZoom: 13 });
  }, [map, points]);

  return null;
};

const MapView: React.FC<MapViewProps> = ({ data, moduleId, moduleConfig, navigate }) => {
  const locationFieldKeys = useMemo(() => {
    const byType = moduleConfig.fields
      .filter((field) => field.type === FieldType.LOCATION)
      .map((field) => field.key);

    if (byType.length) return byType;

    return moduleConfig.fields
      .filter((field) => field.key === 'location')
      .map((field) => field.key);
  }, [moduleConfig.fields]);

  const points = useMemo<PointRecord[]>(() => {
    if (!locationFieldKeys.length) return [];

    return data
      .map((record: any) => {
        for (const fieldKey of locationFieldKeys) {
          const parsed = parseLocationValue(record?.[fieldKey]);
          if (!parsed) continue;
          if (!isInsideIran(parsed)) continue;

          return {
            id: String(record?.id || ''),
            lat: parsed.lat,
            lng: parsed.lng,
            label: getRecordTitle(record, moduleConfig, { fallback: '-' }),
            rawLocation: formatLocationValue(parsed),
          };
        }
        return null;
      })
      .filter(Boolean) as PointRecord[];
  }, [data, locationFieldKeys, moduleConfig]);

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

  const hasConfiguredTiles = Boolean(import.meta.env.VITE_MAP_TILE_URL);

  return (
    <div className="relative h-full min-h-[420px] rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800">
      {!hasConfiguredTiles && (
        <div className="absolute top-3 right-3 z-[1000] text-[11px] px-2 py-1 rounded bg-yellow-100 text-yellow-900 border border-yellow-300">
          لطفا `VITE_MAP_TILE_URL` را برای tile server داخلی تنظیم کنید
        </div>
      )}
      <MapContainer
        center={IRAN_CENTER}
        zoom={5}
        minZoom={4}
        maxZoom={14}
        maxBounds={IRAN_BOUNDS}
        maxBoundsViscosity={1}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url={MAP_TILE_URL}
          attribution={MAP_TILE_ATTRIBUTION}
          bounds={IRAN_BOUNDS}
          noWrap
          maxNativeZoom={14}
          maxZoom={14}
          detectRetina={false}
        />
        <FitBoundsToPoints points={points} />

        {points.map((point) => (
          <CircleMarker
            key={point.id}
            center={[point.lat, point.lng]}
            radius={7}
            pathOptions={{ color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.9, weight: 2 }}
          >
            <Popup>
              <div className="text-xs space-y-2 min-w-[180px]">
                <div className="font-semibold text-gray-800">{point.label}</div>
                <div className="text-gray-500">{point.rawLocation}</div>
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-leather-600 text-white hover:bg-leather-500"
                  onClick={() => navigate(`/${moduleId}/${point.id}`)}
                >
                  مشاهده رکورد
                </button>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;
