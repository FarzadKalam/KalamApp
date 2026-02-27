export const MAP_STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || '';

export const MAP_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MAP_TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; OpenMapTiles &copy; OpenStreetMap contributors';

const parsedMaxZoom = Number(import.meta.env.VITE_MAP_MAX_ZOOM || 14);
export const MAP_MAX_ZOOM = Number.isFinite(parsedMaxZoom) ? parsedMaxZoom : 14;

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
