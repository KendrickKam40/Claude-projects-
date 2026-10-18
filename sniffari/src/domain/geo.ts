// Small geography helpers.

const R = 6371;

/** Great-circle distance in kilometres. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 100) * 10} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** Home base used before the phone shares its location: Kellyville. */
export const DEFAULT_CENTRE = { lat: -33.7135, lon: 150.9395 };
