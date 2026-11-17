import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, MapPin, AlertCircle, Navigation, Car, Clock, X, RotateCcw } from 'lucide-react';
import axios from 'axios';
import { createResilientTileLayer, ResilientTileLayerHandle } from '../utils/mapConfig.ts';
import { useTheme } from '../context/ThemeContext.tsx';
import { useToast } from '../context/ToastContext.tsx';

export interface LocationPoint {
  name: string;
  lat: number;
  lng: number;
}

interface MapPickerProps {
  initialPickup?: LocationPoint;
  initialDest?: LocationPoint;
  onPickupChange: (point: LocationPoint) => void;
  onDestChange: (point: LocationPoint) => void;
  height?: string;
}

const DIU_PRESETS: { label: string; point: LocationPoint }[] = [
  {
    label: 'DIU Smart City (Ashulia)',
    point: { name: 'DIU Daffodil Smart City (Ashulia Campus)', lat: 23.8768, lng: 90.3202 }
  },
  {
    label: 'DIU Dhanmondi 27',
    point: { name: 'DIU Dhanmondi 27 (Sobhanbag)', lat: 23.7538, lng: 90.377 }
  },
  {
    label: 'Mirpur 10',
    point: { name: 'Mirpur 10 Circle, Dhaka', lat: 23.8069, lng: 90.3687 }
  },
  {
    label: 'Uttara House Building',
    point: { name: 'Uttara Sector 11, Dhaka', lat: 23.8742, lng: 90.398 }
  },
  {
    label: 'Mohakhali',
    point: { name: 'Mohakhali Wireless Gate, Dhaka', lat: 23.7776, lng: 90.4054 }
  },
  {
    label: 'Savar Thana',
    point: { name: 'Savar Thana Stand, Savar', lat: 23.8583, lng: 90.2667 }
  }
];

export const MapPicker: React.FC<MapPickerProps> = ({
  initialPickup,
  initialDest,
  onPickupChange,
  onDestChange,
  height = '520px'
}) => {
  const { isDark } = useTheme();
  const { showToast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<ResilientTileLayerHandle | null>(null);

  const pickupMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);

  const [activeSelection, setActiveSelection] = useState<'pickup' | 'dest'>('pickup');
  const [pickup, setPickup] = useState<LocationPoint | null>(initialPickup || null);
  const [dest, setDest] = useState<LocationPoint | null>(initialDest || null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [isStraightLineFallback, setIsStraightLineFallback] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [tileError, setTileError] = useState(false);

  const activeSelectionRef = useRef(activeSelection);
  const onPickupChangeRef = useRef(onPickupChange);
  const onDestChangeRef = useRef(onDestChange);
  const isDarkRef = useRef(isDark);
  const routeAbortRef = useRef<AbortController | null>(null);
  const routeSeqRef = useRef(0);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchCacheRef = useRef<Map<string, any[]>>(new Map());

  activeSelectionRef.current = activeSelection;
  onPickupChangeRef.current = onPickupChange;
  onDestChangeRef.current = onDestChange;
  isDarkRef.current = isDark;

  const createMarkerIcon = (color: string, label: string) => {
    return L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
          <span style="transform: rotate(45deg); color: white; font-weight: bold; font-size: 13px;">${label}</span>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
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

  const createPopupEl = (title: string, value: string) => {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = title + ':';
    div.appendChild(strong);
    div.appendChild(document.createElement('br'));
    div.appendChild(document.createTextNode(value));
    return div;
  };

  const updateMarkersAndRoute = async (currentPickup: LocationPoint | null, currentDest: LocationPoint | null) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const pickupColor = '#515FC5';
    const destColor = '#8175D5';
    const routeColor = isDark ? '#818CF8' : '#515FC5';

    // Handle Pickup Marker
    if (currentPickup) {
      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.setLatLng([currentPickup.lat, currentPickup.lng]);
        pickupMarkerRef.current.setPopupContent(createPopupEl('Pickup', currentPickup.name));
      } else {
        pickupMarkerRef.current = L.marker([currentPickup.lat, currentPickup.lng], {
          icon: createMarkerIcon(pickupColor, 'P'),
          draggable: true
        })
          .addTo(map)
          .bindPopup(createPopupEl('Pickup', currentPickup.name));

        pickupMarkerRef.current.on('dragend', async (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          let name = `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          if (reverseAbortRef.current) reverseAbortRef.current.abort();
          const ctrl = new AbortController();
          reverseAbortRef.current = ctrl;
          try {
            const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
              params: { lat, lon: lng, format: 'json' },
              timeout: 4000,
              signal: ctrl.signal
            });
            name = res.data?.display_name?.split(',').slice(0, 2).join(',') || name;
          } catch {
            // Keep coordinate fallback label
          }
          if (ctrl.signal.aborted) return;
          const updated = { name, lat, lng };
          setPickup(updated);
          onPickupChangeRef.current(updated);
        });
      }
    } else if (pickupMarkerRef.current) {
      map.removeLayer(pickupMarkerRef.current);
      pickupMarkerRef.current = null;
    }

    // Handle Dest Marker
    if (currentDest) {
      if (destMarkerRef.current) {
        destMarkerRef.current.setLatLng([currentDest.lat, currentDest.lng]);
        destMarkerRef.current.setPopupContent(createPopupEl('Destination', currentDest.name));
      } else {
        destMarkerRef.current = L.marker([currentDest.lat, currentDest.lng], {
          icon: createMarkerIcon(destColor, 'D'),
          draggable: true
        })
          .addTo(map)
          .bindPopup(createPopupEl('Destination', currentDest.name));

        destMarkerRef.current.on('dragend', async (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          let name = `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          if (reverseAbortRef.current) reverseAbortRef.current.abort();
          const ctrl = new AbortController();
          reverseAbortRef.current = ctrl;
          try {
            const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
              params: { lat, lon: lng, format: 'json' },
              timeout: 4000,
              signal: ctrl.signal
            });
            name = res.data?.display_name?.split(',').slice(0, 2).join(',') || name;
          } catch {
            // Keep coordinate fallback label
          }
          if (ctrl.signal.aborted) return;
          const updated = { name, lat, lng };
          setDest(updated);
          onDestChangeRef.current(updated);
        });
      }
    } else if (destMarkerRef.current) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }

    // Clear route if one point is missing
    if (!currentPickup || !currentDest) {
      if (routeAbortRef.current) {
        routeAbortRef.current.abort();
        routeAbortRef.current = null;
      }
      if (polylineRef.current) {
        map.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      setIsStraightLineFallback(false);
      setIsRouting(false);
      return;
    }

    // Cancel any in-flight route lookup before starting a new one
    if (routeAbortRef.current) {
      routeAbortRef.current.abort();
    }
    const routeCtrl = new AbortController();
    routeAbortRef.current = routeCtrl;
    const seq = ++routeSeqRef.current;

    setIsRouting(true);
    try {
      const res = await axios.get(
        `https://router.project-osrm.org/route/v1/driving/${currentPickup.lng},${currentPickup.lat};${currentDest.lng},${currentDest.lat}?overview=full&geometries=geojson&alternatives=true`,
        { timeout: 5000, signal: routeCtrl.signal }
      );
      if (seq !== routeSeqRef.current || routeCtrl.signal.aborted || !mapInstanceRef.current) return;

      const routes: any[] = Array.isArray(res.data?.routes) ? res.data.routes : [];
      if (routes.length > 0) {
        const route = routes.reduce(
          (shortest: any, candidate: any) =>
            Number(candidate.distance) < Number(shortest.distance) ? candidate : shortest,
          routes[0]
        );
        setIsStraightLineFallback(false);
        setRouteDistanceKm(Number((route.distance / 1000).toFixed(1)));
        setRouteDurationMin(Math.max(1, Math.round(route.duration / 60)));

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
          const bounds = L.featureGroup([pickupMarkerRef.current, destMarkerRef.current]).getBounds();
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
        }
      } else {
        throw new Error('No routes returned');
      }
    } catch (err: any) {
      if (axios.isCancel(err) || routeCtrl.signal.aborted || seq !== routeSeqRef.current || !mapInstanceRef.current) {
        return;
      }
      const dist = calculateHaversineKm(currentPickup.lat, currentPickup.lng, currentDest.lat, currentDest.lng);
      setIsStraightLineFallback(true);
      setRouteDistanceKm(dist);
      setRouteDurationMin(null);

      const latlngs: [number, number][] = [
        [currentPickup.lat, currentPickup.lng],
        [currentDest.lat, currentDest.lng]
      ];
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
        const bounds = L.featureGroup([pickupMarkerRef.current, destMarkerRef.current]).getBounds();
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      }
    } finally {
      if (seq === routeSeqRef.current) {
        setIsRouting(false);
      }
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [23.8103, 90.35],
      zoom: 12,
      zoomControl: false
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    tileLayerRef.current = createResilientTileLayer(map, isDarkRef.current, (hasError) => {
      setTileError(hasError);
    });

    mapInstanceRef.current = map;

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const target = activeSelectionRef.current;
      let name = `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      if (reverseAbortRef.current) reverseAbortRef.current.abort();
      const ctrl = new AbortController();
      reverseAbortRef.current = ctrl;

      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
          params: { lat, lon: lng, format: 'json' },
          timeout: 4000,
          signal: ctrl.signal
        });
        name = res.data?.display_name?.split(',').slice(0, 2).join(',') || name;
      } catch {
        // Fallback to coordinate label
      }

      if (ctrl.signal.aborted) return;

      const clickedPoint: LocationPoint = { name, lat, lng };
      if (target === 'pickup') {
        setPickup(clickedPoint);
        onPickupChangeRef.current(clickedPoint);
        setActiveSelection('dest');
      } else {
        setDest(clickedPoint);
        onDestChangeRef.current(clickedPoint);
      }
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        mapInstanceRef.current?.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver?.disconnect();
      routeAbortRef.current?.abort();
      reverseAbortRef.current?.abort();
      searchAbortRef.current?.abort();
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
    if (polylineRef.current) {
      polylineRef.current.setStyle({ color: isDark ? '#818CF8' : '#515FC5' });
    }
  }, [isDark]);

  useEffect(() => {
    updateMarkersAndRoute(pickup, dest);
  }, [pickup, dest]);

  // Debounced search with cache + abort handling
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || trimmed.length < 3) {
      searchAbortRef.current?.abort();
      setSearchResults([]);
      setSearchFeedback(null);
      setIsSearching(false);
      return;
    }

    const cacheKey = trimmed.toLowerCase();
    const cached = searchCacheRef.current.get(cacheKey);
    if (cached) {
      setSearchResults(cached);
      setSearchFeedback(cached.length === 0 ? 'No matching locations found.' : null);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const ctrl = new AbortController();
      searchAbortRef.current = ctrl;
      setIsSearching(true);
      setSearchFeedback(null);
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: `${trimmed}, Bangladesh`, format: 'json', limit: 5 },
          timeout: 4500,
          signal: ctrl.signal
        });
        const items = Array.isArray(res.data) ? res.data : [];
        searchCacheRef.current.set(cacheKey, items);
        setSearchResults(items);
        setSearchFeedback(items.length === 0 ? 'No matching locations found.' : null);
      } catch (err: any) {
        if (axios.isCancel(err) || ctrl.signal.aborted) return;
        setSearchResults([]);
        setSearchFeedback('Location search unavailable — click map or use hotspots.');
      } finally {
        if (!ctrl.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 550);

    return () => {
      clearTimeout(timer);
      searchAbortRef.current?.abort();
    };
  }, [searchQuery]);

  const selectSearchResult = (item: any) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    const newPoint: LocationPoint = {
      name: item.display_name.split(',').slice(0, 3).join(','),
      lat,
      lng
    };

    if (activeSelection === 'pickup') {
      setPickup(newPoint);
      onPickupChange(newPoint);
      setActiveSelection('dest');
    } else {
      setDest(newPoint);
      onDestChange(newPoint);
    }

    setSearchResults([]);
    setSearchQuery('');

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([lat, lng], 14, { animate: true });
    }
  };

  const applyPreset = (presetPoint: LocationPoint) => {
    if (activeSelection === 'pickup') {
      setPickup(presetPoint);
      onPickupChange(presetPoint);
      setActiveSelection('dest');
    } else {
      setDest(presetPoint);
      onDestChange(presetPoint);
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([presetPoint.lat, presetPoint.lng], 14, { animate: true });
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', 'error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let name = `My Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

        if (reverseAbortRef.current) reverseAbortRef.current.abort();
        const ctrl = new AbortController();
        reverseAbortRef.current = ctrl;

        try {
          const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: { lat, lon: lng, format: 'json' },
            timeout: 4000,
            signal: ctrl.signal
          });
          name = res.data?.display_name?.split(',').slice(0, 2).join(',') || name;
        } catch {
          // Keep coordinate fallback label on network error or timeout
        }

        if (ctrl.signal.aborted || !mapInstanceRef.current) return;

        const currPoint: LocationPoint = { name, lat, lng };

        if (activeSelectionRef.current === 'pickup') {
          setPickup(currPoint);
          onPickupChangeRef.current(currPoint);
        } else {
          setDest(currPoint);
          onDestChangeRef.current(currPoint);
        }

        mapInstanceRef.current.flyTo([lat, lng], 15, { animate: true });
      },
      () => showToast('Unable to retrieve your current location. Please select a point on the map.', 'error')
    );
  };

  return (
    <div className="space-y-4">
      {/* Target Selector Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#F5F7FC] dark:bg-[#1C2A40] p-3 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E]">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#626E86] dark:text-[#B0BCD0] mr-1">
            Setting:
          </span>
          <button
            type="button"
            onClick={() => setActiveSelection('pickup')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSelection === 'pickup'
                ? 'bg-[#515FC5] hover:bg-[#434FA8] text-white shadow-md shadow-[#515FC5]/20'
                : 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E]'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" /> Pickup
          </button>
          <button
            type="button"
            onClick={() => setActiveSelection('dest')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSelection === 'dest'
                ? 'bg-[#8175D5] text-white shadow-md shadow-[#8175D5]/20'
                : 'bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E]'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" /> Destination
          </button>

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            title="Use My Current Location"
            className="p-2 bg-white dark:bg-[#24334B] text-[#515FC5] dark:text-[#818CF8] hover:bg-[#DDE2FA]/40 dark:hover:bg-[#172235] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl transition-all cursor-pointer"
          >
            <Navigation className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 w-full max-w-sm">
          <div className="relative">
            <input
              type="text"
              placeholder={`Search ${activeSelection} location...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-10 py-2.5 bg-white dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] border border-[#D4DAE7] dark:border-[#34445E] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#515FC5] dark:focus:ring-[#818CF8] transition-all shadow-xs"
            />
            <Search className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] absolute left-3 top-2.5" />
            {isSearching && (
              <div className="absolute right-3 top-2.5">
                <div className="w-4 h-4 border-2 border-[#515FC5] dark:border-[#818CF8] border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>

          {(searchResults.length > 0 || searchFeedback) && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#1C2A40] border border-[#D4DAE7] dark:border-[#34445E] rounded-2xl shadow-xl z-50 overflow-hidden divide-y divide-[#D4DAE7]/50 dark:divide-[#34445E]">
              {searchResults.length > 0 ? (
                searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectSearchResult(item)}
                    className="w-full text-left px-4 py-3 hover:bg-[#DDE2FA]/30 dark:hover:bg-[#24334B] transition-colors flex items-start gap-3 cursor-pointer group"
                  >
                    <MapPin className="w-4 h-4 text-[#626E86] dark:text-[#B0BCD0] group-hover:text-[#515FC5] dark:group-hover:text-[#818CF8] mt-0.5 shrink-0" />
                    <span className="text-xs text-[#222B42] dark:text-[#F1F4FC] line-clamp-2 leading-snug">{item.display_name}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-xs text-[#626E86] dark:text-[#B0BCD0]">
                  {searchFeedback}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative z-0 isolate rounded-3xl overflow-hidden border border-[#D4DAE7] dark:border-[#34445E] shadow-sm bg-[#E8ECF4] dark:bg-[#111827]">
        <div ref={mapContainerRef} style={{ height, width: '100%' }} className="z-10" />

        {/* Overlay Badges */}
        <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap gap-2 pointer-events-none">
          {/* Route Stats */}
          {routeDistanceKm !== null && (
            <div className="pointer-events-auto bg-white/95 dark:bg-[#1C2A40]/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-lg text-[11px] font-bold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-[#515FC5] dark:text-[#818CF8]">
                <Car className="w-3.5 h-3.5" /> {isStraightLineFallback ? `${routeDistanceKm} km (direct)` : `${routeDistanceKm} km`}
              </span>
              <span className="w-px h-3 bg-[#D4DAE7] dark:bg-[#34445E]"></span>
              <span className="flex items-center gap-1.5 text-[#626E86] dark:text-[#B0BCD0]">
                <Clock className="w-3.5 h-3.5" />
                {isStraightLineFallback ? 'Road ETA unavailable' : `~${routeDurationMin} mins`}
              </span>
              {isRouting && (
                <div className="w-3 h-3 border-2 border-[#515FC5] dark:border-[#818CF8] border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          )}

          {/* Hotspots Dropdown / Chips */}
          <div className="pointer-events-auto ml-auto bg-white/95 dark:bg-[#1C2A40]/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-md flex items-center gap-2 overflow-x-auto max-w-[200px] sm:max-w-none no-scrollbar">
            <span className="text-[10px] font-black text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-tighter whitespace-nowrap">Hotspots:</span>
            {DIU_PRESETS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyPreset(p.point)}
                className="px-2.5 py-1 bg-[#E8ECF4] dark:bg-[#24334B] text-[#222B42] dark:text-[#F1F4FC] hover:bg-[#515FC5] hover:text-white border border-[#D4DAE7] dark:border-[#34445E] rounded-lg transition-all text-[10px] font-bold whitespace-nowrap cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Locations Info Cards (Bottom) */}
        <div className="absolute bottom-4 left-4 right-4 z-20 grid grid-cols-1 sm:grid-cols-2 gap-3 pointer-events-none">
          {pickup && (
            <div className="pointer-events-auto bg-white/95 dark:bg-[#1C2A40]/95 backdrop-blur-md p-3.5 rounded-2xl border border-[#515FC5]/40 dark:border-[#818CF8]/40 shadow-xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#DDE2FA]/50 dark:bg-[#24334B] flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-[#515FC5] dark:text-[#818CF8]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-[#515FC5] dark:text-[#818CF8] uppercase tracking-widest">Pickup</span>
                  <button 
                    type="button" 
                    aria-label="Clear pickup location"
                    onClick={() => { setPickup(null); onPickupChange({name: '', lat: 0, lng: 0}); }}
                    className="text-[#626E86] hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] truncate mt-0.5">{pickup.name}</p>
                <p className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] font-mono mt-0.5">{pickup.lat.toFixed(5)}, {pickup.lng.toFixed(5)}</p>
              </div>
            </div>
          )}

          {dest && (
            <div className="pointer-events-auto bg-white/95 dark:bg-[#1C2A40]/95 backdrop-blur-md p-3.5 rounded-2xl border border-[#8175D5]/40 dark:border-[#A78BFA]/40 shadow-xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#DDE2FA]/50 dark:bg-[#24334B] flex items-center justify-center shrink-0">
                <Navigation className="w-4 h-4 text-[#8175D5] dark:text-[#A78BFA]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-[#8175D5] dark:text-[#A78BFA] uppercase tracking-widest">Destination</span>
                  <button 
                    type="button" 
                    aria-label="Clear destination location"
                    onClick={() => { setDest(null); onDestChange({name: '', lat: 0, lng: 0}); }}
                    className="text-[#626E86] hover:text-rose-500 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs font-bold text-[#222B42] dark:text-[#F1F4FC] truncate mt-0.5">{dest.name}</p>
                <p className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] font-mono mt-0.5">{dest.lat.toFixed(5)}, {dest.lng.toFixed(5)}</p>
              </div>
            </div>
          )}
        </div>

        {tileError && (
          <div className="absolute bottom-3 left-3 right-3 z-30 bg-amber-50/95 dark:bg-amber-950/95 backdrop-blur-sm border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-[11px] px-3 py-2 rounded-xl shadow-lg flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="truncate">Map tiles unavailable right now. Markers and presets remain interactive.</span>
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
    </div>
  );
};

export default MapPicker;