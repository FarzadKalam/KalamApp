export const MAP_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || '';

export const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  '';

export const MAP_TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '';

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
const EMPTY_SPRITE_JSON_DATA_URI = 'data:application/json;charset=utf-8,%7B%7D';
const EMPTY_SPRITE_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==';

const buildEmptyStyle = () => ({
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': '#eef2f7',
      },
    },
  ],
});

const toAbsoluteStyleResourceUrl = (rawUrl: string) => {
  if (!rawUrl) return rawUrl;
  if (!MAP_STYLE_ORIGIN) return rawUrl;
  try {
    return new URL(rawUrl, `${MAP_STYLE_ORIGIN}/`).toString();
  } catch {
    return rawUrl;
  }
};

const rewriteLocalStyleResourceUrl = (rawUrl: string) => {
  if (!MAP_STYLE_ORIGIN) return rawUrl;
  try {
    const parsed = new URL(toAbsoluteStyleResourceUrl(rawUrl));
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
  if (!MAP_TILE_URL) {
    return buildEmptyStyle();
  }

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
    const absoluteUrl = toAbsoluteStyleResourceUrl(url);
    const rewrittenUrl = rewriteRetinaSpriteUrl(rewriteLocalStyleResourceUrl(absoluteUrl));

    try {
      const parsed = new URL(rewrittenUrl);
      if (/\/sprite(?:@\dx)?\.json$/i.test(parsed.pathname)) {
        return { url: EMPTY_SPRITE_JSON_DATA_URI };
      }
      if (/\/sprite(?:@\dx)?\.png$/i.test(parsed.pathname)) {
        return { url: EMPTY_SPRITE_PNG_DATA_URI };
      }
    } catch {
      return { url: rewrittenUrl };
    }

    if (rewrittenUrl === url) {
      return { url };
    }
    return { url: rewrittenUrl };
  };
};
