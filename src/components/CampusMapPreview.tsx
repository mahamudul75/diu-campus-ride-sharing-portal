import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Compass,
  MapPin,
  Car,
  AlertCircle,
  RotateCcw,
  Check
} from 'lucide-react';
import { createResilientTileLayer, ResilientTileLayerHandle } from '../utils/mapConfig.ts';
import { useTheme } from '../context/ThemeContext.tsx';

interface CampusRideRoute {
  id: string;
  name: string;
  pickupName: string;
  destName: string;
  pickupCoords: [number, number];
  destCoords: [number, number];
  color: string;
}

const POPULAR_CAMPUS_ROUTES: CampusRideRoute[] = [
  {
    id: 'route-dhanmondi',
    name: 'Daffodil Smart City ↔ Dhanmondi',
    pickupName: 'Daffodil Smart City',
    destName: 'Dhanmondi',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.7538, 90.377],
    color: '#6366F1'
  },
  {
    id: 'route-mirpur-1',
    name: 'Daffodil Smart City ↔ Mirpur 1',
    pickupName: 'Daffodil Smart City',
    destName: 'Mirpur 1',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.7956, 90.3537],
    color: '#818CF8'
  },
  {
    id: 'route-mirpur-10',
    name: 'Daffodil Smart City ↔ Mirpur 10',
    pickupName: 'Daffodil Smart City',
    destName: 'Mirpur 10',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.8069, 90.3687],
    color: '#A5B4FC'
  },
  {
    id: 'route-uttara',
    name: 'Daffodil Smart City ↔ Uttara',
    pickupName: 'Daffodil Smart City',
    destName: 'Uttara',
    pickupCoords: [23.8768, 90.3202],
    destCoords: [23.8742, 90.398],
    color: '#38BDF8'
  }
];

export const CampusMapPreview: React.FC = () => {
  const { isDark } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<ResilientTileLayerHandle | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeRouteId, setActiveRouteId] = useState<string>('route-dhanmondi');
  const [tileError, setTileError] = useState(false);

  const activeRoute =
    POPULAR_CAMPUS_ROUTES.find((r) => r.id === activeRouteId) || POPULAR_CAMPUS_ROUTES[0];

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

    L.control.zoom({ position: 'topright' }).addTo(map);

    tileLayerRef.current = createResilientTileLayer(map, isDark, (hasError) => {
      setTileError(hasError);
    });

    layersGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        mapInstanceRef.current?.invalidateSize();
      });
      resizeObserver.observe(mapContainerRef.current);
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      resizeObserver?.disconnect();
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

  // Render markers and polyline for selected route
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layersGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const diuCoords: [number, number] = activeRoute.pickupCoords;
    const destCoords: [number, number] = activeRoute.destCoords;

    const diuColor = isDark ? '#818CF8' : '#515FC5';

    // Custom DIU Campus Marker
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
        <div style="background-color: ${activeRoute.color}; width: 30px; height: 30px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35); z-index: 450;">
          <span style="transform: rotate(45deg); color: white; font-weight: bold; font-size: 11px;">D</span>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28]
    });

    L.marker(diuCoords, { icon: diuIcon })
      .bindPopup(
        `<strong>${activeRoute.pickupName}</strong><br/><span style="font-size: 11px; color: #626E86;">Birulia, Savar, Dhaka</span>`
      )
      .addTo(group);

    L.marker(destCoords, { icon: destIcon })
      .bindPopup(
        `<strong>${activeRoute.destName}</strong><br/><span style="font-size: 11px; color: #626E86;">${activeRoute.name}</span>`
      )
      .addTo(group);

    L.polyline([diuCoords, destCoords], {
      color: diuColor,
      weight: 4,
      opacity: 0.85,
      dashArray: '8, 8'
    }).addTo(group);

    const bounds = L.latLngBounds([diuCoords, destCoords]);
    map.fitBounds(bounds, {
      paddingTopLeft: [48, 72],
      paddingBottomRight: [48, 48],
      maxZoom: 13
    });
  }, [activeRouteId, activeRoute, isDark]);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="rounded-3xl bg-[#FFFFFF] dark:bg-[#0F172A] border border-[#DCE2EC] dark:border-[#1E293B] shadow-lg shadow-slate-900/5 dark:shadow-black/35 overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[460px_1fr] xl:grid-cols-[490px_1fr] items-stretch divide-y lg:divide-y-0 lg:divide-x divide-[#DCE2EC] dark:divide-[#1E293B]">
          {/* Left Panel: Mobility Destination Grid */}
          <div className="bg-[#FFFFFF] dark:bg-[#0F172A] flex flex-col justify-between">
            <div>
              {/* Header */}
              <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[#0F172A] dark:text-[#F8FAFC] tracking-tight">
                    Popular Campus Routes
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">
                    Explore popular destinations from campus
                  </p>
                </div>
                <div
                  className="w-9 h-9 rounded-xl bg-[#EEF0FA] dark:bg-[#1E293B] text-[#4F5FC9] dark:text-[#818CF8] flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <Compass className="w-4 h-4" />
                </div>
              </div>

              {/* 2x3 Route Grid */}
              <div
                className="px-5 sm:px-6 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                role="listbox"
                aria-label="Popular Campus Routes"
              >
                {POPULAR_CAMPUS_ROUTES.map((route) => {
                  const isSelected = route.id === activeRouteId;
                  return (
                    <button
                      key={route.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-label={route.name}
                      onClick={() => setActiveRouteId(route.id)}
                      className={`group text-left p-3 sm:p-3.5 rounded-2xl transition-all duration-150 cursor-pointer flex flex-col justify-between min-h-[76px] ${
                        isSelected
                          ? 'bg-[#EEF0FA] dark:bg-[#1C2847] ring-1 ring-inset ring-[#4F5FC9]/35 dark:ring-[#818CF8]/40 shadow-xs'
                          : 'bg-[#F4F6FA] dark:bg-[#151F33] hover:bg-[#EAEFF7] dark:hover:bg-[#1A263E]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="inline-flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0 transition-transform duration-150"
                            style={{
                              backgroundColor: isSelected
                                ? route.color
                                : isDark
                                ? '#64748B'
                                : '#94A3B8'
                            }}
                          />
                          <span
                            className={`text-[11px] font-medium truncate ${
                              isSelected
                                ? 'text-[#4F5FC9] dark:text-[#A5B4FC]'
                                : 'text-[#64748B] dark:text-[#94A3B8]'
                            }`}
                          >
                            Daffodil Smart City ↔
                          </span>
                        </span>

                        <span
                          className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all duration-150 ${
                            isSelected
                              ? 'bg-[#4F5FC9] dark:bg-[#818CF8] text-white dark:text-[#0F172A]'
                              : 'bg-[#E2E8F0] dark:bg-[#1E293B] text-transparent group-hover:bg-[#CBD5E1] dark:group-hover:bg-[#293548]'
                          }`}
                          aria-hidden="true"
                        >
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      </div>

                      <span
                        className={`text-sm font-bold tracking-tight mt-2 block leading-snug ${
                          isSelected
                            ? 'text-[#0F172A] dark:text-[#FFFFFF]'
                            : 'text-[#1E293B] dark:text-[#E2E8F0]'
                        }`}
                      >
                        {route.destName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Integrated Campus Information Footer */}
            <div className="bg-[#F8FAFC] dark:bg-[#0B1220]/80 border-t border-[#E2E8F0] dark:border-[#1E293B] px-5 sm:px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] dark:bg-[#151F33] border border-[#E2E8F0]/80 dark:border-[#1E293B] flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#7C8BA1]">
                      Campus Hub
                    </p>
                    <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] mt-0.5 truncate">
                      Daffodil Smart City
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#FFFFFF] dark:bg-[#151F33] border border-[#E2E8F0]/80 dark:border-[#1E293B] flex items-center justify-center shrink-0">
                    <Car className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#7C8BA1]">
                      Ride Type
                    </p>
                    <p className="text-xs font-semibold text-[#0F172A] dark:text-[#F1F5F9] mt-0.5 truncate">
                      Student Ride Sharing
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Interactive Map Canvas */}
          <div className="relative z-0 isolate bg-[#E8ECF4] dark:bg-[#0B1220] min-h-[340px] sm:min-h-[400px] lg:min-h-[430px]">
            <div
              ref={mapContainerRef}
              className="w-full h-full min-h-[340px] sm:min-h-[400px] lg:min-h-[430px] [&_.leaflet-top.leaflet-right]:mt-2.5 [&_.leaflet-top.leaflet-right]:mr-2.5 [&_.leaflet-control-zoom]:!border [&_.leaflet-control-zoom]:!border-[#DCE2EC] dark:[&_.leaflet-control-zoom]:!border-[#1E293B] [&_.leaflet-control-zoom]:!rounded-xl [&_.leaflet-control-zoom]:!overflow-hidden [&_.leaflet-control-zoom]:!shadow-md [&_.leaflet-control-zoom_a]:!bg-[#FFFFFF]/95 dark:[&_.leaflet-control-zoom_a]:!bg-[#0F172A]/95 [&_.leaflet-control-zoom_a]:!text-[#0F172A] dark:[&_.leaflet-control-zoom_a]:!text-[#E2E8F0] [&_.leaflet-control-zoom_a]:!border-[#DCE2EC] dark:[&_.leaflet-control-zoom_a]:!border-[#1E293B] [&_.leaflet-control-zoom_a]:!w-8 [&_.leaflet-control-zoom_a]:!h-8 [&_.leaflet-control-zoom_a]:!leading-8 hover:[&_.leaflet-control-zoom_a]:!bg-[#EEF0FA] dark:hover:[&_.leaflet-control-zoom_a]:!bg-[#1C2847] [&_.leaflet-control-attribution]:!bg-[#FFFFFF]/85 dark:[&_.leaflet-control-attribution]:!bg-[#0F172A]/85 [&_.leaflet-control-attribution]:!text-[#475569] dark:[&_.leaflet-control-attribution]:!text-[#94A3B8] [&_.leaflet-control-attribution]:!text-[10px] [&_.leaflet-control-attribution]:!px-2.5 [&_.leaflet-control-attribution]:!py-0.5 [&_.leaflet-control-attribution]:!rounded-tl-lg [&_.leaflet-control-attribution_a]:!text-[#4F5FC9] dark:[&_.leaflet-control-attribution_a]:!text-[#818CF8]"
              style={{ width: '100%' }}
            />

            {/* Compact Floating Route HUD */}
            <div className="absolute top-3.5 left-3.5 z-[400] max-w-[calc(100%-5.25rem)] bg-[#FFFFFF]/92 dark:bg-[#0F172A]/92 backdrop-blur-md px-3.5 py-2 rounded-xl border border-[#DCE2EC]/90 dark:border-[#1E293B] shadow-md flex items-center gap-2.5 pointer-events-none">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: activeRoute.color }}
              />
              <span className="text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] leading-snug">
                {activeRoute.name}
              </span>
            </div>

            {tileError && (
              <div className="absolute bottom-8 left-3.5 right-3.5 sm:right-auto sm:max-w-md z-[400] bg-amber-50/95 dark:bg-amber-950/95 backdrop-blur-sm border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-[11px] px-3 py-2 rounded-xl shadow-md flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="truncate">Map tiles unavailable. Route coordinates remain active.</span>
                </div>
                <button
                  type="button"
                  onClick={() => tileLayerRef.current?.retry()}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                >
                  <RotateCcw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CampusMapPreview;
