import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertCircle, Car, Clock } from 'lucide-react';
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

  const [tileError, setTileError] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [durationMin, setDurationMin] = useState<number | null>(null);
  const [isRouting, setIsRouting] = useState(false);

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

  useEffect(() => {
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

    // Fetch OSRM Route
    setIsRouting(true);
    axios
      .get(`https://router.project-osrm.org/route/v1/driving/${pLng},${pLat};${dLng},${dLat}?overview=full&geometries=geojson`, {
        timeout: 5000
      })
      .then((res: any) => {
        if (res.data?.routes?.[0]) {
          const route = res.data.routes[0];
          setDistanceKm(Number((route.distance / 1000).toFixed(1)));
          setDurationMin(Math.round(route.duration / 60));

          const coords: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);

          if (polylineRef.current) {
            polylineRef.current.setLatLngs(coords);
          } else {
            polylineRef.current = L.polyline(coords, {
              color: isDark ? '#818CF8' : '#515FC5',
              weight: 6,
              opacity: 0.9,
              lineJoin: 'round'
            }).addTo(map);
          }
          
          if (pickupMarkerRef.current && destMarkerRef.current) {
            const group = L.featureGroup([pickupMarkerRef.current, destMarkerRef.current]);
            map.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 14 });
          }
        }
      })
      .catch(() => {
        const dist = calculateStraightDistance(pLat, pLng, dLat, dLng);
        setDistanceKm(dist);
        setDurationMin(Math.round(dist * 2.5));

        const latlngs: [number, number][] = [[pLat, pLng], [dLat, dLng]];
        if (polylineRef.current) {
          polylineRef.current.setLatLngs(latlngs);
        } else {
          polylineRef.current = L.polyline(latlngs, {
            color: isDark ? '#818CF8' : '#515FC5',
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
        setIsRouting(false);
      });

  }, [pickupLat, pickupLng, pickupName, destLat, destLng, destName, isDark]);

  return (
    <div className={`relative rounded-3xl overflow-hidden border border-[#D4DAE7] dark:border-[#34445E] shadow-sm ${className}`}>
      <div ref={mapContainerRef} style={{ height, width: '100%' }} />

      {/* Info Badge */}
      {(distanceKm !== null || isRouting) && (
        <div className="absolute top-4 right-4 z-[400] bg-[#FFFFFF]/90 dark:bg-[#1C2A40]/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-[#D4DAE7] dark:border-[#34445E] shadow-lg text-[11px] font-bold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[#515FC5] dark:text-[#818CF8]">
            <Car className="w-3.5 h-3.5" /> {distanceKm || '--'} km
          </span>
          <span className="w-px h-3 bg-[#D4DAE7] dark:bg-[#34445E]"></span>
          <span className="flex items-center gap-1.5 text-[#626E86] dark:text-[#B0BCD0]">
            <Clock className="w-3.5 h-3.5" /> ~{durationMin || '--'} mins
          </span>
          {isRouting && (
            <div className="w-3 h-3 border-2 border-[#515FC5] dark:border-[#818CF8] border-t-transparent rounded-full animate-spin"></div>
          )}
        </div>
      )}

      {tileError && (
        <div className="absolute inset-0 z-30 bg-[#111827]/40 backdrop-blur-[2px] flex items-center justify-center p-6">
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 rounded-2xl shadow-xl max-w-xs text-center space-y-1">
            <AlertCircle className="w-6 h-6 text-amber-600 mx-auto" />
            <p className="text-[10px] font-bold text-amber-900 dark:text-amber-200 uppercase tracking-widest">Connectivity Warning</p>
            <p className="text-[10px] text-amber-700 dark:text-amber-400">Map tiles unavailable. Markers remain active.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;