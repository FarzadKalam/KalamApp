export const MAP_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || '';

export const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MAP_TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; OpenMapTiles &copy; OpenStreetMap contributors';

const parsedMaxZoom = Number(import.meta.env.VITE_MAP_MAX_ZOOM || 14);
export const MAP_MAX_ZOOM = Number.isFinite(parsedMaxZoom) ? parsedMaxZoom : 14;

const getStyleOrigin = () => {
  if (!MAP_STYLE_URL) return '';
  try {
    return new URL(MAP_STYLE_URL).origin;
  } catch {
    return '';
  }
};

const MAP_STYLE_ORIGIN = getStyleOrigin();
const isLocalStyleHost = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1';

const rewriteLocalStyleResourceUrl = (rawUrl: string) => {
  if (!MAP_STYLE_ORIGIN) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    if (!isLocalStyleHost(parsed.hostname)) return rawUrl;
    return `${MAP_STYLE_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return rawUrl;
  }
};

const rewriteRetinaSpriteUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    parsed.pathname = parsed.pathname.replace(/\/sprite@\dx(\.png|\.json)$/i, '/sprite$1');
    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

export const buildRasterStyle = () => {
  return {
    version: 8,
    sources: {
      'raster-tiles': {
        type: 'raster',
        tiles: [MAP_TILE_URL],
        tileSize: 256,
        attribution: MAP_TILE_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'raster-layer',
        type: 'raster',
        source: 'raster-tiles',
      },
    ],
  };
};

export const buildMapStyle = () => {
  if (MAP_STYLE_URL) {
    return MAP_STYLE_URL;
  }

  return buildRasterStyle();
};

export const buildMapTransformRequest = () => {
  if (!MAP_STYLE_ORIGIN) return undefined;

  return (url: string) => {
    const rewrittenUrl = rewriteRetinaSpriteUrl(rewriteLocalStyleResourceUrl(url));
    if (rewrittenUrl === url) {
      return { url };
    }
    return { url: rewrittenUrl };
  };
};
