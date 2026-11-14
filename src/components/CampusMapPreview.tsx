import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import {
  Compass,
  ArrowRight,
  MapPin,
  Car,
  Clock,
  AlertCircle
} from 'lucide-react';
import { createResilientTileLayer, ResilientTileLayerHandle } from '../utils/mapConfig.ts';
import { useTheme } from '../context/ThemeContext.tsx';

interface VerifiedCampusCorridor {
  id: string;
  name: string;
  pickupName: string;
  destName: string;
  pickupCoords: [number, number];
  destCoords: [number, number];
  estDistanceKm: number;
  estDurationMin: number;
  color: string;
}

const VERIFIED_CORRIDORS: VerifiedCampusCorridor[] = [
  {
    id: 'corridor-metro',
    name: 'Campus ⇄ Metro Transit Link',
    pickupName: 'Campus Transit Hub',
    destName: 'Metro Transit Station',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.8069, 90.3687],
    estDistanceKm: 14.8,
    estDurationMin: 30,
    color: '#515FC5'
  },
  {
    id: 'corridor-academic',
    name: 'Campus ⇄ Academic Hub Connector',
    pickupName: 'Campus Transit Hub',
    destName: 'City Academic Zone',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.7538, 90.377],
    estDistanceKm: 22.5,
    estDurationMin: 45,
    color: '#8175D5'
  },
  {
    id: 'corridor-express',
    name: 'Campus ⇄ City Express Line',
    pickupName: 'Campus Transit Hub',
    destName: 'Urban Transit Center',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.8742, 90.398],
    estDistanceKm: 12.2,
    estDurationMin: 25,
    color: '#344269'
  },
  {
    id: 'corridor-shuttle',
    name: 'Campus ⇄ Residential Shuttle',
    pickupName: 'Campus Transit Hub',
    destName: 'Residential Transit Hub',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.8583, 90.2667],
    estDistanceKm: 7.5,
    estDurationMin: 18,
    color: '#67D5DF'
  }
];

export const CampusMapPreview: React.FC = () => {
  const { isDark } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<ResilientTileLayerHandle | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeCorridorId, setActiveCorridorId] = useState<string>('corridor-metro');
  const [tileError, setTileError] = useState(false);

  const activeCorridor =
    VERIFIED_CORRIDORS.find((c) => c.id === activeCorridorId) || VERIFIED_CORRIDORS[0];

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100);
      return;
    }

    const map = L.map(mapContainerRef.current, {
      center: [23.8768, 90.3202],
      zoom: 11,
      scrollWheelZoom: false,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    tileLayerRef.current = createResilientTileLayer(map, isDark, (hasError) => {
      setTileError(hasError);
    });

    layersGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      if (tileLayerRef.current) {
        tileLayerRef.current.remove();
        tileLayerRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update tile dark mode
  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setDark(isDark);
    }
  }, [isDark]);

  // Render markers and polyline for selected corridor
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const diuCoords: [number, number] = [23.8768, 90.3202];
    const destCoords: [number, number] = activeCorridor.destCoords;

    const diuColor = isDark ? '#818CF8' : '#515FC5';

    // Custom DIU Campus Hub Marker
    const diuIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div style="background-color: ${diuColor}; width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35); z-index: 500;">
          <span style="transform: rotate(45deg); color: white; font-weight: 800; font-size: 11px;">DIU</span>
        </div>
      `,
      iconSize: [34, 34],
      iconAnchor: [17, 34],
      popupAnchor: [0, -32]
    });

    // Custom Destination Marker
    const destIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div style="background-color: ${activeCorridor.color}; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35); z-index: 450;">
          <span style="transform: rotate(45deg); color: white; font-weight: bold; font-size: 11px;">D</span>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28]
    });

    L.marker(diuCoords, { icon: diuIcon })
      .bindPopup(`<strong>${activeCorridor.pickupName}</strong><br/><span style="font-size: 11px; color: #626E86;">Primary Departure Hub</span>`)
      .addTo(group);

    L.marker(destCoords, { icon: destIcon })
      .bindPopup(`<strong>${activeCorridor.destName}</strong><br/><span style="font-size: 11px; color: #626E86;">${activeCorridor.name}</span>`)
      .addTo(group);

    // Corridor connection line
    L.polyline([diuCoords, destCoords], {
      color: isDark ? '#818CF8' : '#515FC5',
      weight: 4,
      opacity: 0.85,
      dashArray: '8, 8'
    }).addTo(group);

    // Fit bounds smoothly with generous padding
    const bounds = L.latLngBounds([diuCoords, destCoords]);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
  }, [activeCorridorId, activeCorridor, isDark]);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Main Interactive Preview Card */}
      <div className="bg-[#F5F7FC] dark:bg-[#1C2A40] rounded-3xl border border-[#D4DAE7] dark:border-[#34445E] shadow-sm overflow-hidden p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Corridor Selection Column (4 cols) */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between px-1 mb-3">
                <span className="text-[11px] font-bold text-[#626E86] dark:text-[#B0BCD0] uppercase tracking-wider">
                  Verified Campus Corridors
                </span>
                <span className="text-[10px] text-[#515FC5] dark:text-[#818CF8] font-semibold flex items-center gap-1">
                  <Compass className="w-3 h-3" /> Select Route
                </span>
              </div>

              <div className="space-y-2.5">
                {VERIFIED_CORRIDORS.map((corridor) => {
                  const isSelected = corridor.id === activeCorridorId;
                  return (
                    <button
                      key={corridor.id}
                      onClick={() => setActiveCorridorId(corridor.id)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-[#DDE2FA] dark:bg-[#818CF8]/15 border-[#515FC5]/40 dark:border-[#818CF8]/40 shadow-xs ring-1 ring-[#515FC5]/20 dark:ring-[#818CF8]/20'
                          : 'bg-[#FFFFFF] dark:bg-[#24334B] border-[#D4DAE7] dark:border-[#34445E] hover:border-[#515FC5]/30 dark:hover:border-[#818CF8]/30'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: corridor.color }}
                          />
                          <span
                            className={`text-xs font-bold truncate ${
                              isSelected
                                ? 'text-[#515FC5] dark:text-[#818CF8] font-black'
                                : 'text-[#222B42] dark:text-[#F1F4FC]'
                            }`}
                          >
                            {corridor.name}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] truncate pl-4.5">
                          {corridor.destName}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-bold text-[#222B42] dark:text-[#F1F4FC] block tabular-nums">
                          ~{corridor.estDistanceKm} km
                        </span>
                        <span className="text-[10px] text-[#626E86] dark:text-[#B0BCD0] tabular-nums">
                          {corridor.estDurationMin} min
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Corridor Summary Card */}
            <div className="p-4 rounded-2xl bg-[#FFFFFF] dark:bg-[#24334B] border border-[#D4DAE7] dark:border-[#34445E] space-y-2 mt-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#626E86] dark:text-[#B0BCD0] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#515FC5] dark:text-[#818CF8]" />
                  Hub Point
                </span>
                <span className="font-bold text-[#515FC5] dark:text-[#818CF8]">Campus Transit Hub</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-[#D4DAE7]/60 dark:border-[#34445E]/60 text-[11px]">
                <span className="text-[#626E86] dark:text-[#B0BCD0] flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-[#626E86] dark:text-[#B0BCD0]" />
                  Estimated Time
                </span>
                <span className="font-semibold text-[#222B42] dark:text-[#F1F4FC] flex items-center gap-1.5 tabular-nums">
                  <Clock className="w-3 h-3 text-[#626E86] dark:text-[#B0BCD0]" />
                  ~{activeCorridor.estDurationMin} mins
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Map Column (8 cols) */}
          <div className="lg:col-span-8 relative rounded-2xl overflow-hidden border border-[#D4DAE7] dark:border-[#34445E] bg-[#E8ECF4] dark:bg-[#111827] min-h-[360px] sm:min-h-[420px]">
            <div
              ref={mapContainerRef}
              className="w-full h-full min-h-[360px] sm:min-h-[420px]"
              style={{ width: '100%' }}
            />

            {/* Floating Route Info Badge */}
            <div className="absolute top-3 left-3 z-[400] bg-[#FFFFFF]/95 dark:bg-[#1C2A40]/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-[#D4DAE7] dark:border-[#34445E] shadow-md flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#515FC5] dark:bg-[#818CF8] animate-pulse"></span>
              <span className="text-[11px] font-bold text-[#222B42] dark:text-[#F1F4FC]">
                Active Transit Route: <span className="text-[#515FC5] dark:text-[#818CF8]">{activeCorridor.name}</span>
              </span>
            </div>

            {tileError && (
              <div className="absolute bottom-3 left-3 right-3 z-[400] bg-amber-50/95 dark:bg-amber-950/95 backdrop-blur-sm border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-[10px] px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Map tiles unavailable. Corridor coordinates active.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CampusMapPreview;
