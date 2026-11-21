import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertCircle, Car, Clock, Loader2, LocateFixed, RotateCcw, X } from 'lucide-react';
import axios from 'axios';
import { createResilientTileLayer, ResilientTileLayerHandle } from '../utils/mapConfig.ts';
import { useTheme } from '../context/ThemeContext.tsx';

interface MapViewProps {
  pickupLat: number;
  pickupLng: number;
  pickupName: string;
  destLat: number;
  destLng: number;
  destName: string;
  height?: string;
  className?: string;
}

export const MapView: React.FC<MapViewProps> = ({
  pickupLat,
  pickupLng,
  pickupName,
  destLat,
  destLng,
  destName,
  height = '480px',
  className = ''
}) => {
  const { isDark } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<ResilientTileLayerHandle | null>(null);

  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const userLocationMarkerRef = useRef<L.Marker | null>(null);
  const isMountedRef = useRef(true);
  const locateSeqRef = useRef(0);

  const [tileError, setTileError] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [isStraightLine, setIsStraightLine] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const createCustomIcon = (color: string, label: string) => {
    return L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
          <span style="transform: rotate(45deg); color: white; font-weight: bold; font-size: 11px;">${label}</span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
  };

  const createUserLocationIcon = () => {
    return L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
          <span style="position: absolute; inset: 0; border-radius: 9999px; background-color: rgba(37, 99, 235, 0.25);"></span>
          <span style="position: relative; width: 14px; height: 14px; border-radius: 9999px; background-color: #2563EB; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 8px rgba(37, 99, 235, 0.55);"></span>
        </div>
      `,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  };

  const getGeolocationErrorMessage = (err: GeolocationPositionError) => {
    switch (err.code) {
      case 1:
        return 'Location permission denied. Please allow location access in your browser settings.';
      case 2:
        return 'Your current location is unavailable. Please check your device GPS or network connection.';
      case 3:
        return 'Location request timed out. Please try again.';
      default:
        return 'Unable to detect your current location. Please try again.';
    }
  };

  const handleMyLocation = () => {
    if (isLocating) return;

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    const seq = ++locateSeqRef.current;
    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!isMountedRef.current || seq !== locateSeqRef.current) return;
        setIsLocating(false);

        const map = mapInstanceRef.current;
        if (!map) return;

        const { latitude, longitude } = position.coords;

        if (userLocationMarkerRef.current) {
          userLocationMarkerRef.current.setLatLng([latitude, longitude]);
        } else {
          userLocationMarkerRef.current = L.marker([latitude, longitude], {
            icon: createUserLocationIcon(),
            zIndexOffset: 900
          })
            .addTo(map)
            .bindPopup('Your Location');
        }

        map.flyTo([latitude, longitude], 15, { animate: true });
      },
      (err) => {
        if (!isMountedRef.current || seq !== locateSeqRef.current) return;
        setIsLocating(false);
        setLocationError(getGeolocationErrorMessage(err));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const calculateHaversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c).toFixed(1));
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const pLat = Number(pickupLat) || 23.8768;
    const pLng = Number(pickupLng) || 90.3202;
    const dLat = Number(destLat) || 23.7538;
    const dLng = Number(destLng) || 90.377;

    const map = L.map(mapContainerRef.current, {
      center: [(pLat + dLat) / 2, (pLng + dLng) / 2],
      zoom: 11,
      scrollWheelZoom: false,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    tileLayerRef.current = createResilientTileLayer(map, isDark, (hasError) => {
      setTileError(hasError);
    });

    mapInstanceRef.current = map;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        mapInstanceRef.current?.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      isMountedRef.current = false;
      locateSeqRef.current += 1;
      resizeObserver?.disconnect();
      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.remove();
        userLocationMarkerRef.current = null;
      }
      if (tileLayerRef.current) {
        tileLayerRef.current.remove();
        tileLayerRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setDark(isDark);
    }
  }, [isDark]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const pLat = Number(pickupLat) || 23.8768;
    const pLng = Number(pickupLng) || 90.3202;
    const dLat = Number(destLat) || 23.7538;
    const dLng = Number(destLng) || 90.377;

    const pickupColor = isDark ? '#818CF8' : '#515FC5';
    const destColor = isDark ? '#67D5DF' : '#8175D5';

    const pickupIcon = createCustomIcon(pickupColor, 'P');
    const destIcon = createCustomIcon(destColor, 'D');

    const createPopupEl = (title: string, value: string) => {
      const div = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = title + ':';
      div.appendChild(strong);
      div.appendChild(document.createElement('br'));
      div.appendChild(document.createTextNode(value));
      return div;
    };

    if (pickupMarkerRef.current) {
      pickupMarkerRef.current.setLatLng([pLat, pLng]);
      pickupMarkerRef.current.setPopupContent(createPopupEl('Pickup', pickupName));
    } else {
      pickupMarkerRef.current = L.marker([pLat, pLng], { icon: pickupIcon })
        .addTo(map)
        .bindPopup(createPopupEl('Pickup', pickupName));
    }

    if (destMarkerRef.current) {
      destMarkerRef.current.setLatLng([dLat, dLng]);
      destMarkerRef.current.setPopupContent(createPopupEl('Destination', destName));
    } else {
      destMarkerRef.current = L.marker([dLat, dLng], { icon: destIcon })
        .addTo(map)
        .bindPopup(createPopupEl('Destination', destName));
    }

    // Fetch OSRM Route with cancellation & shortest-distance selection
    const controller = new AbortController();
    let cancelled = false;
    const routeColor = isDark ? '#818CF8' : '#515FC5';

    setIsRouting(true);
    axios
      .get(
        `https://router.project-osrm.org/route/v1/driving/${pLng},${pLat};${dLng},${dLat}?overview=full&geometries=geojson&alternatives=true`,
        { timeout: 5000, signal: controller.signal }
      )
      .then((res: any) => {
        if (cancelled || !mapInstanceRef.current) return;
        const routes: any[] = Array.isArray(res.data?.routes) ? res.data.routes : [];
        if (routes.length === 0) throw new Error('No routes returned');

        const route = routes.reduce(
          (shortest: any, candidate: any) =>
            Number(candidate.distance) < Number(shortest.distance) ? candidate : shortest,
          routes[0]
        );
        setIsStraightLine(false);
        setDistanceKm(Number((route.distance / 1000).toFixed(1)));
        setDurationMin(Math.max(1, Math.round(route.duration / 60)));

        const coords: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

        if (polylineRef.current) {
          polylineRef.current.setLatLngs(coords);
          polylineRef.current.setStyle({
            color: routeColor,
            weight: 6,
            opacity: 0.9,
            dashArray: undefined
          });
        } else {
          polylineRef.current = L.polyline(coords, {
            color: routeColor,
            weight: 6,
            opacity: 0.9,
            lineJoin: 'round'
          }).addTo(map);
        }

        if (pickupMarkerRef.current && destMarkerRef.current) {
          const group = L.featureGroup([pickupMarkerRef.current, destMarkerRef.current]);
          map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 14 });
        }
      })
      .catch((err: any) => {
        if (cancelled || axios.isCancel(err) || controller.signal.aborted || !mapInstanceRef.current) return;
        const dist = calculateHaversineKm(pLat, pLng, dLat, dLng);
        setIsStraightLine(true);
        setDistanceKm(dist);
        setDurationMin(null);

        const latlngs: [number, number][] = [[pLat, pLng], [dLat, dLng]];
        if (polylineRef.current) {
          polylineRef.current.setLatLngs(latlngs);
          polylineRef.current.setStyle({
            color: routeColor,
            weight: 4,
            opacity: 0.7,
            dashArray: '8, 12'
          });
        } else {
          polylineRef.current = L.polyline(latlngs, {
            color: routeColor,
            weight: 4,
            opacity: 0.7,
            dashArray: '8, 12'
          }).addTo(map);
        }

        if (pickupMarkerRef.current && destMarkerRef.current) {
          const group = L.featureGroup([pickupMarkerRef.current, destMarkerRef.current]);
          map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 14 });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsRouting(false);
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };

  }, [pickupLat, pickupLng, pickupName, destLat, destLng, destName, isDark]);

  return (
    <div className={`relative z-0 isolate rounded-3xl overflow-hidden border border-[#D4DAE7] dark:border-[#34445E] shadow-sm ${className}`}>
      <div ref={mapContainerRef} style={{ height, width: '100%' }} />

      {/* My Location Button & Error Notice */}
      <div className="absolute top-4 left-4 z-[400] flex flex-col items-start gap-2 max-w-[calc(100%-2rem)]">
        <button
          type="button"
          onClick={handleMyLocation}
          disabled={isLocating}
          aria-busy={isLocating}
          aria-label="Center map on my location"
          className="px-3 py-2 bg-[#FFFFFF]/95 dark:bg-[#1C2A40]/95 hover:bg-[#EEF0FA] dark:hover:bg-[#243750] disabled:opacity-60 disabled:cursor-not-allowed backdrop-blur-md text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl shadow-lg text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
        >
          {isLocating ? (
            <Loader2 className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8] animate-spin" />
          ) : (
            <LocateFixed className="w-3.5 h-3.5 text-[#2563EB] dark:text-[#60A5FA]" />
          )}
          <span>{isLocating ? 'Locating...' : 'My Location'}</span>
        </button>

        {locationError && (
          <div
            role="alert"
            className="max-w-xs bg-rose-50/95 dark:bg-rose-950/95 backdrop-blur-sm border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-[11px] px-3 py-2 rounded-xl shadow-lg flex items-start gap-2"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-snug flex-1">{locationError}</span>
            <button
              type="button"
              onClick={() => setLocationError(null)}
              aria-label="Dismiss location error"
              className="text-rose-500 hover:text-rose-700 dark:text-rose-300 dark:hover:text-white shrink-0 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Info Badge */}
      {(distanceKm !== null || isRouting) && (
        <div className="absolute top-4 right-4 z-[400] bg-[#FFFFFF]/90 dark:bg-[#1C2A40]/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-lg text-[11px] font-bold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[#515FC5] dark:text-[#818CF8]">
            <Car className="w-3.5 h-3.5" /> {distanceKm !== null ? (isStraightLine ? `${distanceKm} km (direct)` : `${distanceKm} km`) : '-- km'}
          </span>
          <span className="w-px h-3 bg-[#D4DAE7] dark:bg-[#34445E]"></span>
          <span className="flex items-center gap-1.5 text-[#626E86] dark:text-[#B0BCD0]">
            <Clock className="w-3.5 h-3.5" /> {isStraightLine ? 'Road ETA unavailable' : durationMin !== null ? `~${durationMin} mins` : '-- mins'}
          </span>
          {isRouting && (
            <div className="w-3 h-3 border-2 border-[#515FC5] dark:border-[#818CF8] border-t-transparent rounded-full animate-spin"></div>
          )}
        </div>
      )}

      {tileError && (
        <div className="absolute bottom-3 left-3 right-3 z-[400] bg-amber-50/95 dark:bg-amber-950/95 backdrop-blur-sm border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px] px-3 py-2 rounded-xl shadow-lg flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate">Map tiles unavailable. Route markers remain active.</span>
          </div>
          <button
            type="button"
            onClick={() => tileLayerRef.current?.retry()}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default MapView;