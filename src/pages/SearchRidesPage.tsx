import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import {
  Search,
  Filter,
  MapPin,
  Calendar,
  RotateCcw,
  Map as MapIcon,
  AlertCircle
} from 'lucide-react';
import axios from 'axios';
import api from '../services/api.ts';
import { Ride } from '../types/index.ts';
import RideCard from '../components/RideCard.tsx';
import Skeleton from '../components/Skeleton.tsx';
import EmptyState from '../components/EmptyState.tsx';
import { createResilientTileLayer, ResilientTileLayerHandle } from '../utils/mapConfig.ts';
import { useTheme } from '../context/ThemeContext.tsx';

export const SearchRidesPage: React.FC = () => {
  const { isDark } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter states
  const [pickup, setPickup] = useState(searchParams.get('pickup') || '');
  const [destination, setDestination] = useState(searchParams.get('destination') || '');
  const [date, setDate] = useState(searchParams.get('date') || '');
  const [maxFare, setMaxFare] = useState(searchParams.get('max_fare') || '');
  const [minSeats, setMinSeats] = useState(searchParams.get('min_seats') || '');
  const [vehicleType, setVehicleType] = useState(searchParams.get('vehicle_type') || '');

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);
  const [viewMode, setViewMode] = useState<'split' | 'list' | 'map'>('split');
  const [tileError, setTileError] = useState(false);

  // Leaflet map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<ResilientTileLayerHandle | null>(null);

  const fetchRides = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (pickup.trim()) params.pickup = pickup.trim();
      if (destination.trim()) params.destination = destination.trim();
      if (date) {
        params.date = date;
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
        if (match) {
          const y = Number(match[1]);
          const m = Number(match[2]);
          const d = Number(match[3]);
          params.date_start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
          params.date_end = new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString();
        }
      }
      if (maxFare) params.max_fare = maxFare;
      if (minSeats) params.min_seats = minSeats;
      if (vehicleType) params.vehicle_type = vehicleType;

      const res = await api.get('/rides', { params });
      if (res.data?.success) {
        setRides(res.data.rides || []);
      }
    } catch (err) {
      console.warn('Search rides error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRides();
  }, [searchParams]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newParams = new URLSearchParams();
    if (pickup) newParams.set('pickup', pickup);
    if (destination) newParams.set('destination', destination);
    if (date) newParams.set('date', date);
    if (maxFare) newParams.set('max_fare', maxFare);
    if (minSeats) newParams.set('min_seats', minSeats);
    if (vehicleType) newParams.set('vehicle_type', vehicleType);
    setSearchParams(newParams);
  };

  const handleReset = () => {
    setPickup('');
    setDestination('');
    setDate('');
    setMaxFare('');
    setMinSeats('');
    setVehicleType('');
    setSearchParams({});
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (viewMode === 'list') {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 100);
      return;
    }

    const map = L.map(mapContainerRef.current, {
      center: [23.8768, 90.3202],
      zoom: 12
    });

    tileLayerRef.current = createResilientTileLayer(map, isDark, (hasError) => {
      setTileError(hasError);
    });

    markersLayerRef.current = L.layerGroup().addTo(map);
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
  }, [viewMode]);

  useEffect(() => {
    if (tileLayerRef.current) {
      tileLayerRef.current.setDark(isDark);
    }
  }, [isDark]);

  // Update markers and OSRM routes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;

    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    const diuColor = isDark ? '#818CF8' : '#515FC5';

    // Default state when no rides exist
    if (rides.length === 0) {
      const diuIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="background-color: ${diuColor}; width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">
            <span style="transform: rotate(45deg); color: white; font-weight: 800; font-size: 11px;">DIU</span>
          </div>
        `,
        iconSize: [34, 34],
        iconAnchor: [17, 34],
        popupAnchor: [0, -30]
      });

      const createCampusPopupEl = () => {
        const div = document.createElement('div');
        const strong = document.createElement('strong');
        strong.textContent = 'DIU Campus Hub';
        div.appendChild(strong);
        div.appendChild(document.createElement('br'));
        const span1 = document.createElement('span');
        span1.style.fontSize = '11px';
        span1.style.color = '#626E86';
        span1.textContent = 'Main Departure Area';
        div.appendChild(span1);
        return div;
      };

      L.marker([23.8768, 90.3202], { icon: diuIcon })
        .bindPopup(createCampusPopupEl())
        .addTo(markersLayer);

      map.setView([23.8768, 90.3202], 12);
      return;
    }

    const bounds = L.latLngBounds([]);

    const createRidePopupEl = (title: string, value: string, extra?: string) => {
      const div = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = title + ':';
      div.appendChild(strong);
      div.appendChild(document.createElement('br'));
      div.appendChild(document.createTextNode(value));
      if (extra) {
        div.appendChild(document.createElement('br'));
        div.appendChild(document.createTextNode(extra));
      }
      return div;
    };

    rides.forEach((r) => {
      const pLat = Number(r.pickup_lat);
      const pLng = Number(r.pickup_lng);
      const dLat = Number(r.dest_lat);
      const dLng = Number(r.dest_lng);

      if (isNaN(pLat) || isNaN(pLng) || isNaN(dLat) || isNaN(dLng)) return;

      const isSelected = selectedRide?.id === r.id;

      const pickupIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="background-color: ${isSelected ? (isDark ? '#818CF8' : '#515FC5') : '#515FC5'}; width: ${isSelected ? '32px' : '26px'}; height: ${isSelected ? '32px' : '26px'}; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.35); z-index: ${isSelected ? 1000 : 100};">
            <span style="transform: rotate(45deg); color: white; font-weight: bold; font-size: ${isSelected ? '12px' : '10px'};">P</span>
          </div>
        `,
        iconSize: isSelected ? [32, 32] : [26, 26],
        iconAnchor: isSelected ? [16, 32] : [13, 26],
        popupAnchor: [0, -26]
      });

      const destIcon = L.divIcon({
        className: 'custom-map-marker',
        html: `
          <div style="background-color: ${isSelected ? '#8175D5' : '#344269'}; width: ${isSelected ? '32px' : '26px'}; height: ${isSelected ? '32px' : '26px'}; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 8px rgba(0,0,0,0.35); z-index: ${isSelected ? 1000 : 100};">
            <span style="transform: rotate(45deg); color: white; font-weight: bold; font-size: ${isSelected ? '12px' : '10px'};">D</span>
          </div>
        `,
        iconSize: isSelected ? [32, 32] : [26, 26],
        iconAnchor: isSelected ? [16, 32] : [13, 26],
        popupAnchor: [0, -26]
      });

      const pMarker = L.marker([pLat, pLng], { icon: pickupIcon })
        .bindPopup(createRidePopupEl('Pickup', r.pickup_name, `৳${r.fare} | Driver: ${r.driver_name}`));

      const dMarker = L.marker([dLat, dLng], { icon: destIcon })
        .bindPopup(createRidePopupEl('Destination', r.dest_name));

      pMarker.on('click', () => setSelectedRide(r));
      dMarker.on('click', () => setSelectedRide(r));

      markersLayer.addLayer(pMarker);
      markersLayer.addLayer(dMarker);

      bounds.extend([pLat, pLng]);
      bounds.extend([dLat, dLng]);

      // Draw OSRM route for selected ride
      if (isSelected) {
        axios
          .get(`https://router.project-osrm.org/route/v1/driving/${pLng},${pLat};${dLng},${dLat}?overview=full&geometries=geojson`)
          .then((res: { data: { routes: any[] } }) => {
            if (res.data?.routes?.[0]) {
              const route = res.data.routes[0];
              const coords: [number, number][] = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
              const line = L.polyline(coords, {
                color: isDark ? '#818CF8' : '#4F5FC9',
                weight: 5,
                opacity: 0.95
              });
              line.on('click', () => setSelectedRide(r));
              markersLayer.addLayer(line);
            }
          })
          .catch(() => {
            const line = L.polyline([[pLat, pLng], [dLat, dLng]], {
              color: isDark ? '#818CF8' : '#4F5FC9',
              weight: 4,
              opacity: 0.85
            });
            markersLayer.addLayer(line);
          });
      } else {
        const line = L.polyline([[pLat, pLng], [dLat, dLng]], {
          color: isDark ? '#34445D' : '#DCE2EC',
          weight: 3,
          opacity: 0.6,
          dashArray: '6, 6'
        });
        line.on('click', () => setSelectedRide(r));
        markersLayer.addLayer(line);
      }
    });

    if (rides.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [rides, selectedRide, isDark]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedRide) return;
    
    const pLat = Number(selectedRide.pickup_lat);
    const pLng = Number(selectedRide.pickup_lng);
    const dLat = Number(selectedRide.dest_lat);
    const dLng = Number(selectedRide.dest_lng);

    if (!isNaN(pLat) && !isNaN(pLng) && !isNaN(dLat) && !isNaN(dLng)) {
      const bounds = L.latLngBounds([[pLat, pLng], [dLat, dLng]]);
      map.fitBounds(bounds, { 
        padding: [60, 60], 
        maxZoom: 15,
        animate: true,
        duration: 1.0
      });
    }
  }, [selectedRide]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Search Header & View Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#253149] dark:text-[#F1F5FC] tracking-tight">Find Rides</h1>
          <p className="text-xs text-[#66738A] dark:text-[#B4C0D3] font-medium">Verified campus carpool & bike rides.</p>
        </div>
        
        <div className="flex bg-[#E9EDF5] dark:bg-[#172338] p-1 rounded-xl shadow-xs border border-[#DCE2EC] dark:border-[#34445D]">
          {(['split', 'list', 'map'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-5 py-1.5 text-xs font-bold rounded-lg capitalize transition-all cursor-pointer ${
                viewMode === mode
                  ? 'bg-[#FFFFFF] dark:bg-[#243750] text-[#253149] dark:text-[#F1F5FC] shadow-sm ring-1 ring-[#DCE2EC] dark:ring-[#34445D]'
                  : 'text-[#66738A] hover:text-[#253149] dark:text-[#B4C0D3] dark:hover:text-[#F1F5FC]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#FFFFFF] dark:bg-[#1B2940] p-5 rounded-2xl border border-[#DCE2EC] dark:border-[#34445D] shadow-sm">
        <form onSubmit={handleFilterSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-end">
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold text-[#66738A] dark:text-[#B4C0D3] uppercase tracking-widest mb-1.5 ml-1">Pickup</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
              <input
                type="text"
                placeholder="Where from?"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                className="w-full text-sm pl-9 pr-3 py-2.5 bg-[#F8F9FD] dark:bg-[#243750] text-[#253149] dark:text-[#F1F5FC] border border-[#DCE2EC] dark:border-[#34445D] rounded-xl focus:ring-2 focus:ring-[#4F5FC9]/20 focus:border-[#4F5FC9] outline-hidden transition-all"
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold text-[#66738A] dark:text-[#B4C0D3] uppercase tracking-widest mb-1.5 ml-1">Destination</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
              <input
                type="text"
                placeholder="Where to?"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full text-sm pl-9 pr-3 py-2.5 bg-[#F8F9FD] dark:bg-[#243750] text-[#253149] dark:text-[#F1F5FC] border border-[#DCE2EC] dark:border-[#34445D] rounded-xl focus:ring-2 focus:ring-[#4F5FC9]/20 focus:border-[#4F5FC9] outline-hidden transition-all"
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold text-[#66738A] dark:text-[#B4C0D3] uppercase tracking-widest mb-1.5 ml-1">Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-sm pl-9 pr-3 py-2.5 bg-[#F8F9FD] dark:bg-[#243750] text-[#253149] dark:text-[#F1F5FC] border border-[#DCE2EC] dark:border-[#34445D] rounded-xl focus:ring-2 focus:ring-[#4F5FC9]/20 focus:border-[#4F5FC9] outline-hidden transition-all font-mono"
              />
            </div>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-[10px] font-bold text-[#66738A] dark:text-[#B4C0D3] uppercase tracking-widest mb-1.5 ml-1">Max Fare</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-[#4F5FC9] dark:text-[#818CF8] font-bold">৳</span>
              <input
                type="number"
                min="0"
                placeholder="Any"
                value={maxFare}
                onChange={(e) => setMaxFare(e.target.value)}
                className="w-full text-sm pl-7 pr-3 py-2.5 bg-[#F8F9FD] dark:bg-[#243750] text-[#253149] dark:text-[#F1F5FC] border border-[#DCE2EC] dark:border-[#34445D] rounded-xl focus:ring-2 focus:ring-[#4F5FC9]/20 focus:border-[#4F5FC9] outline-hidden transition-all font-mono tabular-nums"
              />
            </div>
          </div>
          <div className="lg:col-span-1">
            <label className="block text-[10px] font-bold text-[#66738A] dark:text-[#B4C0D3] uppercase tracking-widest mb-1.5 ml-1">Seats</label>
            <input
              type="number"
              min="1"
              max="8"
              placeholder="1+"
              value={minSeats}
              onChange={(e) => setMinSeats(e.target.value)}
              className="w-full text-sm px-3 py-2.5 bg-[#F8F9FD] dark:bg-[#243750] text-[#253149] dark:text-[#F1F5FC] border border-[#DCE2EC] dark:border-[#34445D] rounded-xl focus:ring-2 focus:ring-[#4F5FC9]/20 focus:border-[#4F5FC9] outline-hidden transition-all font-mono tabular-nums"
            />
          </div>
          <div className="lg:col-span-1">
            <label className="block text-[10px] font-bold text-[#66738A] dark:text-[#B4C0D3] uppercase tracking-widest mb-1.5 ml-1">Vehicle</label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="w-full text-sm px-2.5 py-2.5 bg-[#F8F9FD] dark:bg-[#243750] text-[#253149] dark:text-[#F1F5FC] border border-[#DCE2EC] dark:border-[#34445D] rounded-xl focus:ring-2 focus:ring-[#4F5FC9]/20 focus:border-[#4F5FC9] outline-hidden transition-all appearance-none"
            >
              <option value="">Any</option>
              <option value="car">Car</option>
              <option value="bike">Bike</option>
            </select>
          </div>
          <div className="lg:col-span-2 flex gap-2">
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-[#4F5FC9] hover:bg-[#404EB2] dark:bg-[#818CF8] dark:hover:bg-[#6B79F2] text-white dark:text-[#111827] rounded-xl text-xs font-bold shadow-md shadow-[#4F5FC9]/20 transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
            </button>
            {(pickup || destination || date || maxFare || minSeats || vehicleType) && (
              <button
                type="button"
                onClick={handleReset}
                title="Reset filters"
                className="px-3 py-2.5 border border-[#DCE2EC] dark:border-[#34445D] text-[#66738A] dark:text-[#B4C0D3] hover:bg-[#EEF0FA] dark:hover:bg-[#243750] rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Main Content Layout - Map Dominant */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Ride Cards, Skeletons, or Empty State (4 cols in split mode) */}
        {viewMode !== 'map' && (
          <div className={`${viewMode === 'split' ? 'lg:col-span-4 max-h-[760px] overflow-y-auto pr-1' : 'lg:col-span-12'} space-y-4`}>
            {loading ? (
              <div className="space-y-4">
                <Skeleton type="card" count={3} />
              </div>
            ) : rides.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No rides found"
                description="Try broadening your search or clearing date and fare filters."
                action={
                  <button
                    onClick={handleReset}
                    className="px-6 py-2 bg-[#4F5FC9] hover:bg-[#404EB2] dark:bg-[#818CF8] dark:hover:bg-[#6B79F2] text-white dark:text-[#111827] text-sm font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    Clear Filters
                  </button>
                }
              />
            ) : (
              <>
                <div className="flex items-center justify-between px-1 sticky top-0 bg-[#F1F3F8] dark:bg-[#111827] py-2 z-10">
                  <span className="text-xs font-bold text-[#66738A] dark:text-[#B4C0D3] uppercase tracking-wider">
                    {rides.length} rides available
                  </span>
                  <span className="text-[10px] text-[#66738A] dark:text-[#B4C0D3]">Click card to focus map</span>
                </div>
                {rides.map((ride) => (
                  <div
                    key={ride.id}
                    onMouseEnter={() => setSelectedRide(ride)}
                    onClick={() => setSelectedRide(ride)}
                    className={`transition-all rounded-2xl cursor-pointer ${
                      selectedRide?.id === ride.id ? 'ring-2 ring-[#4F5FC9] dark:ring-[#818CF8] ring-offset-2 dark:ring-offset-[#111827] shadow-md' : ''
                    }`}
                  >
                    <RideCard ride={ride} />
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Right Column: Dominant Full-Canvas Interactive Leaflet Map (8 cols in split mode) */}
        {viewMode !== 'list' && (
          <div
            className={`${
              viewMode === 'split' ? 'lg:col-span-8 sticky top-24' : 'lg:col-span-12'
            } rounded-2xl border border-[#DCE2EC] dark:border-[#34445D] shadow-sm overflow-hidden bg-[#FFFFFF] dark:bg-[#1B2940] p-2.5 space-y-2`}
          >
            <div className="flex items-center justify-between px-2 pt-1">
              <span className="text-xs font-bold text-[#253149] dark:text-[#F1F5FC] flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-[#4F5FC9] dark:text-[#818CF8]" />
                Live Campus Corridor Map
              </span>
              <span className="text-[10px] font-medium text-[#66738A] dark:text-[#B4C0D3]">
                {rides.length === 0 ? 'Campus Hub' : 'Interactive Route View'}
              </span>
            </div>
            <div className="relative rounded-xl overflow-hidden border border-[#DCE2EC] dark:border-[#34445D] shadow-inner">
              <div
                ref={mapContainerRef}
                style={{ height: viewMode === 'split' ? '720px' : '800px', width: '100%' }}
              />
              {tileError && (
                <div className="absolute bottom-3 left-3 right-3 z-[400] bg-amber-50/95 dark:bg-amber-950/95 backdrop-blur-sm border border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-[10px] px-3 py-2 rounded-lg shadow-lg flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Map tiles unavailable. Markers remain active.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchRidesPage;
