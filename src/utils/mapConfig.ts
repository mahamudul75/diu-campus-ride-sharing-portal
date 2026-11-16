/**
 * OpenStreetMap Tile Configuration with OSM Germany Secondary Fallback (No Paid APIs)
 */
import L from 'leaflet';

export interface TileProviderConfig {
  name: string;
  url: string;
  attribution: string;
  subdomains?: string[];
  maxZoom?: number;
  minZoom?: number;
  darkNative?: boolean;
}

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

export const TILE_PROVIDERS: TileProviderConfig[] = [
  {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    minZoom: 3
  },
  {
    name: 'OSM Germany',
    url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    subdomains: ['a', 'b', 'c'],
    maxZoom: 18,
    minZoom: 3
  }
];

export const FREE_TILE_CONFIG = TILE_PROVIDERS[0];
export const LIGHT_TILE_CONFIG = TILE_PROVIDERS[0];
export const DARK_TILE_CONFIG = TILE_PROVIDERS[0];

export interface ResilientTileLayerHandle {
  setDark: (isDark: boolean) => void;
  retry: () => void;
  remove: () => void;
}

const MAX_CONSECUTIVE_ERRORS_BEFORE_FALLBACK = 2;
const MAX_TOTAL_ERRORS_BEFORE_FALLBACK = 4;
const SAMPLE_CANVAS_SIZE = 64;

let sharedInspectionCanvas: HTMLCanvasElement | null = null;

function getInspectionContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!sharedInspectionCanvas) {
    sharedInspectionCanvas = document.createElement('canvas');
    sharedInspectionCanvas.width = SAMPLE_CANVAS_SIZE;
    sharedInspectionCanvas.height = SAMPLE_CANVAS_SIZE;
  }
  return sharedInspectionCanvas.getContext('2d', { willReadFrequently: true });
}

/**
 * Verifies that a loaded tile element represents an actual rendered map tile
 * rather than a broken image, empty transparent canvas, or OSM's white/yellow
 * "Access denied" policy notice PNG served with HTTP 200.
 */
function isValidMapTileImage(tile: HTMLImageElement | undefined): boolean {
  if (!tile || !tile.complete || tile.naturalWidth === 0 || tile.naturalHeight === 0) {
    return false;
  }

  const ctx = getInspectionContext();
  if (!ctx) {
    return true;
  }

  try {
    ctx.clearRect(0, 0, SAMPLE_CANVAS_SIZE, SAMPLE_CANVAS_SIZE);
    ctx.drawImage(tile, 0, 0, SAMPLE_CANVAS_SIZE, SAMPLE_CANVAS_SIZE);
    const { data } = ctx.getImageData(0, 0, SAMPLE_CANVAS_SIZE, SAMPLE_CANVAS_SIZE);
    const totalPixels = SAMPLE_CANVAS_SIZE * SAMPLE_CANVAS_SIZE;

    let pureWhitePixels = 0;
    let yellowWarningPixels = 0;
    let darkMonochromePixels = 0;
    let transparentPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a === 0) {
        transparentPixels += 1;
        continue;
      }

      if (r >= 252 && g >= 252 && b >= 252) {
        pureWhitePixels += 1;
      } else if (r >= 240 && g >= 240 && b <= 35) {
        yellowWarningPixels += 1;
      } else if (r <= 25 && g <= 25 && b <= 25) {
        darkMonochromePixels += 1;
      }
    }

    // Empty completely transparent tile
    if (transparentPixels === totalPixels) {
      return false;
    }

    // OSM block notice PNG uses a pure #FFFFFF background (>= 60%) with #FFFF00 border/accent
    // and black text, whereas real OSM Carto land tiles use warm #F2EFE9 or ocean #AAD3DF.
    const whiteRatio = pureWhitePixels / totalPixels;
    if (whiteRatio >= 0.6 && yellowWarningPixels >= 6) {
      return false;
    }

    // Also guard against monochrome pure-white + pure-black error/block tiles
    const monochromeErrorRatio = (pureWhitePixels + darkMonochromePixels) / totalPixels;
    if (whiteRatio >= 0.7 && monochromeErrorRatio >= 0.96 && darkMonochromePixels >= 15) {
      return false;
    }

    return true;
  } catch {
    // If CORS prevents pixel inspection on a tile, fall back to dimension check alone
    return tile.naturalWidth > 0 && tile.naturalHeight > 0;
  }
}

export function createResilientTileLayer(
  map: L.Map,
  isDark = false,
  onStatusChange?: (hasError: boolean, providerName: string) => void
): ResilientTileLayerHandle {
  let activeLayer: L.TileLayer | null = null;
  let currentIsDark = isDark;
  let providerIndex = 0;
  let consecutiveErrors = 0;
  let totalErrors = 0;
  let verifiedLoads = 0;
  let isRemoved = false;

  const getProvider = (index: number): TileProviderConfig => {
    return TILE_PROVIDERS[index] || TILE_PROVIDERS[0];
  };

  const applyPaneFilter = (provider: TileProviderConfig, dark: boolean) => {
    const tilePane = map.getPane('tilePane');
    if (!tilePane) return;
    if (dark && !provider.darkNative) {
      tilePane.style.filter = 'brightness(0.75) invert(1) contrast(1.1) hue-rotate(200deg)';
    } else {
      tilePane.style.filter = 'none';
    }
  };

  const handleTileFailure = (config: TileProviderConfig) => {
    consecutiveErrors += 1;
    totalErrors += 1;

    const shouldEscalate =
      consecutiveErrors >= MAX_CONSECUTIVE_ERRORS_BEFORE_FALLBACK ||
      totalErrors >= MAX_TOTAL_ERRORS_BEFORE_FALLBACK ||
      (verifiedLoads === 0 && totalErrors >= 2);

    if (shouldEscalate) {
      if (providerIndex + 1 < TILE_PROVIDERS.length) {
        mountProvider(providerIndex + 1, currentIsDark);
      } else {
        onStatusChange?.(true, config.name);
      }
    }
  };

  const mountProvider = (index: number, dark: boolean) => {
    if (isRemoved) return;
    currentIsDark = dark;
    providerIndex = index;
    consecutiveErrors = 0;
    totalErrors = 0;
    verifiedLoads = 0;

    if (activeLayer) {
      if (map.hasLayer(activeLayer)) {
        map.removeLayer(activeLayer);
      }
      activeLayer = null;
    }

    const config = getProvider(index);

    try {
      const options: L.TileLayerOptions = {
        attribution: config.attribution,
        maxZoom: config.maxZoom ?? 19,
        minZoom: config.minZoom ?? 3,
        crossOrigin: 'anonymous',
        keepBuffer: 2,
        updateWhenIdle: true,
        updateWhenZooming: false
      };
      if (config.subdomains && config.subdomains.length > 0) {
        options.subdomains = config.subdomains;
      }

      const newLayer = L.tileLayer(config.url, options);

      newLayer.on('tileload', (event: L.TileEvent) => {
        if (isRemoved || activeLayer !== newLayer) return;

        if (!isValidMapTileImage(event.tile)) {
          handleTileFailure(config);
          return;
        }

        consecutiveErrors = 0;
        verifiedLoads += 1;
        if (verifiedLoads >= 2 || totalErrors === 0) {
          onStatusChange?.(false, config.name);
        }
      });

      newLayer.on('tileerror', () => {
        if (isRemoved || activeLayer !== newLayer) return;
        handleTileFailure(config);
      });

      activeLayer = newLayer;
      activeLayer.addTo(map);
      applyPaneFilter(config, dark);
    } catch (err) {
      console.warn(`Tile layer (${config.name}) creation failed:`, err);
      if (providerIndex + 1 < TILE_PROVIDERS.length) {
        mountProvider(providerIndex + 1, dark);
      } else {
        onStatusChange?.(true, config.name);
      }
    }
  };

  mountProvider(0, isDark);

  return {
    setDark: (dark: boolean) => {
      if (dark !== currentIsDark && !isRemoved) {
        currentIsDark = dark;
        applyPaneFilter(getProvider(providerIndex), dark);
      }
    },
    retry: () => {
      if (isRemoved) return;
      onStatusChange?.(false, TILE_PROVIDERS[0].name);
      mountProvider(0, currentIsDark);
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