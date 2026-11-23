export function isValidDiuStudentId(studentId: string): boolean {
  if (!studentId) return false;
  return /^\d{3}-\d{2}-\d{3}$/.test(studentId.trim());
}

export function isValidDiuEmail(email: string, allowedDomain = 'diu.edu.bd'): boolean {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) return false;
  return cleanEmail.endsWith(`@${allowedDomain}`) || cleanEmail.endsWith(`.${allowedDomain}`);
}

export function isValidBdPhone(phone: string): boolean {
  if (!phone) return false;
  const phoneRegex = /^(?:\+?88)?01[3-9]\d{8}$/;
  return phoneRegex.test(phone.trim().replace(/[\s-]/g, ''));
}

export function isValidRideCoordinate(lat: unknown, lng: unknown): boolean {
  const nLat = typeof lat === 'number' ? lat : Number(lat);
  const nLng = typeof lng === 'number' ? lng : Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) return false;
  // MapPicker emits (0, 0) when a user explicitly clears a point
  if (nLat === 0 && nLng === 0) return false;
  return true;
}

export function isValidRideFare(fare: unknown): boolean {
  if (fare === '' || fare === null || fare === undefined) return false;
  const numFare = typeof fare === 'number' ? fare : Number(fare);
  return Number.isFinite(numFare) && numFare >= 0 && numFare <= 50000;
}

export function getSafeRedirectPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (/[\x00-\x1f\x7f\\]/.test(trimmed)) return fallback;
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;

  try {
    const decoded = decodeURIComponent(trimmed);
    if (/[\x00-\x1f\x7f\\]/.test(decoded) || !decoded.startsWith('/') || decoded.startsWith('//')) {
      return fallback;
    }
    const parsed = new URL(trimmed, 'https://diu-portal.invalid');
    if (parsed.origin !== 'https://diu-portal.invalid') return fallback;
    if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
