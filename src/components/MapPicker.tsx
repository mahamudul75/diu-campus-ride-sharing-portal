import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Search, MapPin, AlertCircle, Navigation, Car, Clock } from 'lucide-react';
import axios from 'axios';
import { createResilientTileLayer, ResilientTileLayerHandle } from '../utils/mapConfig.ts';
import { useTheme } from '../context/ThemeContext.tsx';

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
  height = '380px'
}) => {
  const { isDark } = useTheme();
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
  const [isSearching, setIsSearching] = useState(false);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);
  const [isRouting, setIsRouting] = useState(false);
  const [tileError, setTileError] = useState(false);

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

  const calculateStraightDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Number((R * c * 1.25).toFixed(1));
  };

  const updateMarkersAndRoute = async (currentPickup: LocationPoint | null, currentDest: LocationPoint | null) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Handle Pickup Marker
    if (currentPickup) {
      if (pickupMarkerRef.current) {
        pickupMarkerRef.current.setLatLng([currentPickup.lat, currentPickup.lng]);
        pickupMarkerRef.current.setPopupContent(`<strong>Pickup:</strong><br/>${currentPickup.name}`);
      } else {
        pickupMarkerRef.current = L.marker([currentPickup.lat, currentPickup.lng], {
          icon: createMarkerIcon('#0d9488', 'P'),
          draggable: true
        })
          .addTo(map)
          .bindPopup(`<strong>Pickup:</strong><br/>${currentPickup.name}`);

        pickupMarkerRef.current.on('dragend', async (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          try {
            const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
              params: { lat, lon: lng, format: 'json' }
            });
            const name = res.data?.display_name?.split(',').slice(0, 2).join(',') || `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            const updated = { name, lat, lng };
            setPickup(updated);
            onPickupChange(updated);
          } catch {
            const updated = { name: `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng };
            setPickup(updated);
            onPickupChange(updated);
          }
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
        destMarkerRef.current.setPopupContent(`<strong>Destination:</strong><br/>${currentDest.name}`);
      } else {
        destMarkerRef.current = L.marker([currentDest.lat, currentDest.lng], {
          icon: createMarkerIcon('#f97316', 'D'),
          draggable: true
        })
          .addTo(map)
          .bindPopup(`<strong>Destination:</strong><br/>${currentDest.name}`);

        destMarkerRef.current.on('dragend', async (e: any) => {
          const { lat, lng } = e.target.getLatLng();
          try {
            const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
              params: { lat, lon: lng, format: 'json' }
            });
            const name = res.data?.display_name?.split(',').slice(0, 2).join(',') || `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
            const updated = { name, lat, lng };
            setDest(updated);
            onDestChange(updated);
          } catch {
            const updated = { name: `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng };
            setDest(updated);
            onDestChange(updated);
          }
        });
      }
    } else if (destMarkerRef.current) {
      map.removeLayer(destMarkerRef.current);
      destMarkerRef.current = null;
    }

    // Clear route if one point is missing
    if (!currentPickup || !currentDest) {
      if (polylineRef.current) {
        map.removeLayer(polylineRef.current);
        polylineRef.current = null;
      }
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      return;
    }

    // Update Route
    setIsRouting(true);
    try {
      const res = await axios.get(
        `https://router.project-osrm.org/route/v1/driving/${currentPickup.lng},${currentPickup.lat};${currentDest.lng},${currentDest.lat}?overview=full&geometries=geojson`,
        { timeout: 5000 }
      );
      if (res.data?.routes?.[0]) {
        const route = res.data.routes[0];
        setRouteDistanceKm(Number((route.distance / 1000).toFixed(1)));
        setRouteDurationMin(Math.round(route.duration / 60));

        const coords: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

        if (polylineRef.current) {
          polylineRef.current.setLatLngs(coords);
        } else {
          polylineRef.current = L.polyline(coords, {
            color: '#0d9488',
            weight: 6,
            opacity: 0.9,
            lineJoin: 'round'
          }).addTo(map);
        }

        const bounds = L.featureGroup([pickupMarkerRef.current!, destMarkerRef.current!]).getBounds();
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      }
    } catch (err) {
      console.warn('OSRM Route failed, using straight line fallback.');
      const dist = calculateStraightDistance(currentPickup.lat, currentPickup.lng, currentDest.lat, currentDest.lng);
      setRouteDistanceKm(dist);
      setRouteDurationMin(Math.round(dist * 2.5));

      const latlngs: [number, number][] = [
        [currentPickup.lat, currentPickup.lng],
        [currentDest.lat, currentDest.lng]
      ];
      if (polylineRef.current) {
        polylineRef.current.setLatLngs(latlngs);
      } else {
        polylineRef.current = L.polyline(latlngs, {
          color: '#0d9488',
          weight: 4,
          opacity: 0.7,
          dashArray: '8, 12'
        }).addTo(map);
      }
    } finally {
      setIsRouting(false);
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

    tileLayerRef.current = createResilientTileLayer(map, isDark, (hasError) => {
      setTileError(hasError);
    });

    mapInstanceRef.current = map;

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      let name = `Point (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
          params: { lat, lon: lng, format: 'json' }
        });
        name = res.data?.display_name?.split(',').slice(0, 2).join(',') || name;
      } catch (err) {}

      const clickedPoint: LocationPoint = { name, lat, lng };

      setActiveSelection((curr) => {
        if (curr === 'pickup') {
          setPickup(clickedPoint);
          onPickupChange(clickedPoint);
          return 'dest';
        } else {
          setDest(clickedPoint);
          onDestChange(clickedPoint);
          return curr;
        }
      });
    });

    updateMarkersAndRoute(pickup, dest);

    return () => {
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
    updateMarkersAndRoute(pickup, dest);
  }, [pickup, dest]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: `${searchQuery.trim()}, Bangladesh`, format: 'json', limit: 5 },
          timeout: 4000
        });
        setSearchResults(res.data || []);
      } catch (err) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 600);

    return () => clearTimeout(timer);
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
      alert('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let name = `My Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

        try {
          const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: { lat, lon: lng, format: 'json' }
          });
          name = res.data?.display_name?.split(',').slice(0, 2).join(',') || name;
        } catch (err) {}

        const currPoint: LocationPoint = { name, lat, lng };

        if (activeSelection === 'pickup') {
          setPickup(currPoint);
          onPickupChange(currPoint);
        } else {
          setDest(currPoint);
          onDestChange(currPoint);
        }

        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([lat, lng], 15, { animate: true });
        }
      },
      () => alert('Unable to retrieve current location.')
    );
  };

  return (
    <div className="space-y-4">
      {/* Target Selector Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mr-1">
            Setting:
          </span>
          <button
            type="button"
            onClick={() => setActiveSelection('pickup')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSelection === 'pickup'
                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/20'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" /> Pickup
          </button>
          <button
            type="button"
            onClick={() => setActiveSelection('dest')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeSelection === 'dest'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" /> Destination
          </button>

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            title="Use My Current Location"
            className="p-2 bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950 border border-slate-200 dark:border-slate-700 rounded-xl transition-all cursor-pointer"
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
              className="w-full text-xs pl-9 pr-10 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 transition-all shadow-xs"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            {isSearching && (
              <div className="absolute right-3 top-2.5">
                <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {searchResults.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectSearchResult(item)}
                  className="w-full text-left px-4 py-3 hover:bg-teal-50 dark:hover:bg-teal-950 transition-colors flex items-start gap-3 cursor-pointer group"
                >
                  <MapPin className="w-4 h-4 text-slate-400 group-hover:text-teal-500 mt-0.5 shrink-0" />
                  <span className="text-xs text-slate-700 dark:text-slate-200 line-clamp-2 leading-snug">{item.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-100 dark:bg-slate-950">
        <div ref={mapContainerRef} style={{ height, width: '100%' }} className="z-10" />

        {/* Overlay Badges */}
        <div className="absolute top-4 left-4 right-4 z-20 flex flex-wrap gap-2 pointer-events-none">
          {/* Route Stats */}
          {routeDistanceKm !== null && (
            <div className="pointer-events-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-teal-100 dark:border-teal-900 shadow-lg text-[11px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-teal-700 dark:text-teal-400">
                <Car className="w-3.5 h-3.5" /> {routeDistanceKm} km
              </span>
              <span className="w-px h-3 bg-slate-200 dark:bg-slate-700"></span>
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                <Clock className="w-3.5 h-3.5" /> ~{routeDurationMin} mins
              </span>
              {isRouting && (
                <div className="w-3 h-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
              )}
            </div>
          )}

          {/* Hotspots Dropdown / Chips */}
          <div className="pointer-events-auto ml-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md flex items-center gap-2 overflow-x-auto max-w-[200px] sm:max-w-none no-scrollbar">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter whitespace-nowrap">Hotspots:</span>
            {DIU_PRESETS.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyPreset(p.point)}
                className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-teal-500 hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg transition-all text-[10px] font-bold whitespace-nowrap cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Locations Info Cards (Bottom) */}
        <div className="absolute bottom-4 left-4 right-4 z-20 grid grid-cols-1 sm:grid-cols-2 gap-3 pointer-events-none">
          {pickup && (
            <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 rounded-2xl border border-teal-200 dark:border-teal-800 shadow-xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-900/40 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-teal-700 dark:text-teal-400 uppercase tracking-widest">Pickup</span>
                  <button 
                    type="button" 
                    onClick={() => { setPickup(null); onPickupChange({name: '', lat: 0, lng: 0}); }}
                    className="text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">{pickup.name}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{pickup.lat.toFixed(5)}, {pickup.lng.toFixed(5)}</p>
              </div>
            </div>
          )}

          {dest && (
            <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 rounded-2xl border border-orange-200 dark:border-orange-800 shadow-xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                <Navigation className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-orange-700 dark:text-orange-400 uppercase tracking-widest">Destination</span>
                  <button 
                    type="button" 
                    onClick={() => { setDest(null); onDestChange({name: '', lat: 0, lng: 0}); }}
                    className="text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate mt-0.5">{dest.name}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">{dest.lat.toFixed(5)}, {dest.lng.toFixed(5)}</p>
              </div>
            </div>
          )}
        </div>

        {tileError && (
          <div className="absolute inset-0 z-30 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-6">
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-4 rounded-2xl shadow-2xl max-w-xs text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Map connectivity issue</p>
              <p className="text-[10px] text-amber-700 dark:text-amber-400">Markers and routing are still functioning, but background tiles failed to load.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapPicker;