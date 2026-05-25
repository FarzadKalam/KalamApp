import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl from 'maplibre-gl';

const RTL_TEXT_PLUGIN_URL = '/vendor/mapbox-gl-rtl-text.js';

let rtlTextPluginPromise: Promise<void> | null = null;

export const ensureMapLibreRTLTextPlugin = (): void => {
  if (typeof window === 'undefined') return;
  if (
    typeof maplibregl.getRTLTextPluginStatus !== 'function' ||
    typeof maplibregl.setRTLTextPlugin !== 'function'
  ) {
    return;
  }

  const status = maplibregl.getRTLTextPluginStatus();
  if (status === 'loaded' || status === 'loading' || status === 'deferred') return;

  if (!rtlTextPluginPromise) {
    rtlTextPluginPromise = maplibregl.setRTLTextPlugin(RTL_TEXT_PLUGIN_URL, true).catch((error) => {
      rtlTextPluginPromise = null;
      console.warn('MapLibre RTL text plugin failed to load.', error);
    });
  }
};

export const attachMissingMapImageFallback = (map: maplibregl.Map): void => {
  const transparentPixel = {
    width: 1,
    height: 1,
    data: new Uint8Array([0, 0, 0, 0]),
  };

  map.on('styleimagemissing', (event: any) => {
    const imageId = String(event?.id || '').trim();
    if (!imageId || map.hasImage(imageId)) return;

    try {
      map.addImage(imageId, transparentPixel as any, { pixelRatio: 1 });
    } catch {
      // The style may request the same image from multiple buckets at once.
    }
  });
};
