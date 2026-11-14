/**
 * Geographic distance & campus route estimation utilities
 */

const EARTH_RADIUS_KM = 6371;

export function calculateHaversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightKm = EARTH_RADIUS_KM * c;
  // Road factor ~1.28 for Dhaka/Ashulia road networks
  return Number((straightKm * 1.28).toFixed(1));
}

export function estimateDurationMinutes(distanceKm: number, vehicleType: 'bike' | 'car'): number {
  // Average Dhaka/Ashulia campus corridor speeds: bikes ~28 km/h, cars ~22 km/h
  const avgSpeedKmh = vehicleType === 'bike' ? 28 : 22;
  const minutes = Math.round((distanceKm / avgSpeedKmh) * 60);
  return Math.max(5, minutes);
}
