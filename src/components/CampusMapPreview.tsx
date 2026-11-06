import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import {
  Compass,
  ArrowRight,
  MapPin,
  Car,
  Clock,
  Layers,
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
    id: 'ashulia-dhanmondi',
    name: 'Ashulia ⇄ Dhanmondi',
    pickupName: 'DIU Daffodil Smart City (Ashulia)',
    destName: 'DIU Dhanmondi 27 (Sobhanbag)',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.7538, 90.377],
    estDistanceKm: 22.5,
    estDurationMin: 45,
    color: '#0d9488'
  },
  {
    id: 'ashulia-mirpur',
    name: 'Ashulia ⇄ Mirpur 10',
    pickupName: 'DIU Daffodil Smart City (Ashulia)',
    destName: 'Mirpur 10 Circle',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.8069, 90.3687],
    estDistanceKm: 14.8,
    estDurationMin: 30,
    color: '#059669'
  },
  {
    id: 'ashulia-uttara',
    name: 'Ashulia ⇄ Uttara',
    pickupName: 'DIU Daffodil Smart City (Ashulia)',
    destName: 'Uttara Sector 11 (House Building)',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.8742, 90.398],
    estDistanceKm: 12.2,
    estDurationMin: 25,
    color: '#2563eb'
  },
  {
    id: 'ashulia-savar',
    name: 'Ashulia ⇄ Savar',
    pickupName: 'DIU Daffodil Smart City (Ashulia)',
    destName: 'Savar Thana Stand',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.8583, 90.2667],
    estDistanceKm: 7.5,
    estDurationMin: 18,
    color: '#ea580c'
  }
];

export const CampusMapPreview: React.FC = () => {
  const { isDark } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<ResilientTileLayerHandle | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeCorridorId, setActiveCorridorId] = useState<string>('ashulia-dhanmondi');
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

    // Custom DIU Campus Hub Marker
    const diuIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `
        <div style="background-color: #0d9488; width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35); z-index: 500;">
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

    const diuMarker = L.marker(diuCoords, { icon: diuIcon })
      .bindPopup(`<strong>DIU Daffodil Smart City</strong><br/><span style="font-size: 11px; color: #64748b;">Ashulia Campus Corridor</span>`)
      .addTo(group);

    const destMarker = L.marker(destCoords, { icon: destIcon })
      .bindPopup(`<strong>${activeCorridor.destName}</strong><br/><span style="font-size: 11px; color: #64748b;">${activeCorridor.name}</span>`)
      .addTo(group);

    // Corridor connection line
    const corridorLine = L.polyline([diuCoords, destCoords], {
      color: activeCorridor.color,
      weight: 4,
      opacity: 0.85,
      dashArray: '8, 8'
    }).addTo(group);

    // Fit bounds smoothly with generous padding
    const bounds = L.latLngBounds([diuCoords, destCoords]);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
  }, [activeCorridorId, activeCorridor]);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            Campus Transit Network
          </span>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Explore Your Campus Routes
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
            Discover convenient routes connecting DIU with popular destinations.
          </p>
        </div>

        <Link
          to="/search"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all self-start md:self-auto cursor-pointer"
        >
          <span>Explore All Routes</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Main Interactive Preview Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden p-3 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Corridor Selection Column (4 cols) */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between px-1 mb-3">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Popular Corridors
                </span>
                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold flex items-center gap-1">
                  <Compass className="w-3 h-3" /> Select Route
                </span>
              </div>

              <div className="space-y-2">
                {VERIFIED_CORRIDORS.map((corridor) => {
                  const isSelected = corridor.id === activeCorridorId;
                  return (
                    <button
                      key={corridor.id}
                      onClick={() => setActiveCorridorId(corridor.id)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-500/40 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-950/40 border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
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
                                ? 'text-teal-950 dark:text-teal-200 font-black'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {corridor.name}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate pl-4.5">
                          {corridor.destName}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                          ~{corridor.estDistanceKm} km
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {corridor.estDurationMin} min
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Corridor Summary Pill */}
            <div className="p-3.5 rounded-2xl bg-slate-950 text-white border border-slate-800 space-y-2 mt-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-teal-400" />
                  Primary Campus Hub
                </span>
                <span className="font-bold text-teal-400">Ashulia Gate 1</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Car className="w-3.5 h-3.5 text-slate-400" />
                  Transit Estimate
                </span>
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-slate-500" />
                  ~{activeCorridor.estDurationMin} mins
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Map Column (8 cols) */}
          <div className="lg:col-span-8 relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 min-h-[340px] sm:min-h-[400px]">
            <div
              ref={mapContainerRef}
              className="w-full h-full min-h-[340px] sm:min-h-[400px]"
              style={{ width: '100%' }}
            />

            {/* Uber-inspired Floating Badge */}
            <div className="absolute top-3 left-3 z-[400] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-md flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                DIU Transit Corridor: <span className="text-teal-600 dark:text-teal-400">{activeCorridor.name}</span>
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
