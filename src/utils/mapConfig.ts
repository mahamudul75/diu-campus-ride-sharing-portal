/**
 * OpenStreetMap Germany Mirror Tile Configuration (100% Free, No API Key Required)
 */
import L from 'leaflet';

export interface TileProviderConfig {
  url: string;
  attribution: string;
  subdomains?: string[];
  maxZoom?: number;
  minZoom?: number;
}

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export const FREE_TILE_CONFIG: TileProviderConfig = {
  url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',
  attribution: TILE_ATTRIBUTION,
  subdomains: ['a', 'b', 'c'],
  maxZoom: 19,
  minZoom: 3
};

export const LIGHT_TILE_CONFIG = FREE_TILE_CONFIG;
export const DARK_TILE_CONFIG = FREE_TILE_CONFIG;

export interface ResilientTileLayerHandle {
  setDark: (isDark: boolean) => void;
  remove: () => void;
}

export function createResilientTileLayer(
  map: L.Map,
  isDark = false,
  onStatusChange?: (hasError: boolean, providerName: string) => void
): ResilientTileLayerHandle {
  let activeLayer: L.TileLayer | null = null;
  let currentIsDark = isDark;
  let isRemoved = false;

  const applyTileTheme = (dark: boolean) => {
    if (isRemoved) return;
    currentIsDark = dark;

    if (activeLayer) {
      if (map.hasLayer(activeLayer)) {
        map.removeLayer(activeLayer);
      }
      activeLayer = null;
    }

    const config = FREE_TILE_CONFIG;

    try {
      const newLayer = L.tileLayer(config.url, {
        attribution: config.attribution,
        subdomains: config.subdomains || ['a', 'b', 'c'],
        maxZoom: config.maxZoom ?? 19,
        minZoom: config.minZoom ?? 3,
        keepBuffer: 2,
        updateWhenIdle: true,
        updateWhenZooming: false
      });

      newLayer.on('tileerror', () => {
        onStatusChange?.(true, 'OSM Germany');
      });

      newLayer.on('tileload', () => {
        onStatusChange?.(false, 'OSM Germany');
      });

      activeLayer = newLayer;
      activeLayer.addTo(map);

      const tilePane = map.getPane('tilePane');
      if (tilePane) {
        if (dark) {
          tilePane.style.filter = 'brightness(0.75) invert(1) contrast(1.1) hue-rotate(200deg)';
        } else {
          tilePane.style.filter = 'none';
        }
      }
    } catch (err) {
      console.warn('Tile layer creation failed:', err);
      onStatusChange?.(true, 'OSM Germany');
    }
  };

  applyTileTheme(isDark);

  return {
    setDark: (dark: boolean) => {
      if (dark !== currentIsDark && !isRemoved) {
        applyTileTheme(dark);
      }
    },
    remove: () => {
      if (activeLayer) {
        if (map.hasLayer(activeLayer)) {
          map.removeLayer(activeLayer);
        }
        activeLayer = null;
      }
      isRemoved = true;
    }
  };
}