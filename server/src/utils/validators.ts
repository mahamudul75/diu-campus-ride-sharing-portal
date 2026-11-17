/**
 * DIU Validation utilities
 */

export function isValidStudentId(studentId: string): boolean {
  if (!studentId) return false;
  // DIU Student ID format: 000-00-000 (e.g. 211-15-401)
  const regex = /^\d{3}-\d{2}-\d{3}$/;
  return regex.test(studentId.trim());
}

export function isValidDiuEmail(email: string): boolean {
  if (!email) return false;
  const configuredDomain = process.env.DIU_EMAIL_DOMAIN || 'diu.edu.bd';
  const cleanEmail = email.trim().toLowerCase();
  
  // Standard email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) return false;

  // Must end with configured university domain or subdomains (e.g. @diu.edu.bd, @s.diu.edu.bd)
  return cleanEmail.endsWith(`@${configuredDomain}`) || cleanEmail.endsWith(`.${configuredDomain}`);
}

export function isValidPhone(phone: string): boolean {
  if (!phone) return false;
  // Bangladesh phone number: 013-019 followed by 8 digits, with optional +88
  const phoneRegex = /^(?:\+?88)?01[3-9]\d{8}$/;
  return phoneRegex.test(phone.trim().replace(/[\s-]/g, ''));
}

export function sanitizePhone(phone: string): string {
  const digits = phone.trim().replace(/[^\d+]/g, '');
  if (digits.startsWith('+8801')) return digits.replace('+88', '');
  if (digits.startsWith('8801')) return digits.slice(2);
  return digits;
}

export function isNonEmptyString(val: unknown, minLen = 1, maxLen = 500): val is string {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return trimmed.length >= minLen && trimmed.length <= maxLen;
}

export function isPositiveIntId(val: unknown): number | null {
  if (typeof val === 'number') {
    return Number.isInteger(val) && val > 0 ? val : null;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!/^\d+$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function isValidCoordinate(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const nLat = typeof lat === 'number' || typeof lat === 'string' ? Number(lat) : NaN;
  const nLng = typeof lng === 'number' || typeof lng === 'string' ? Number(lng) : NaN;
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
  if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) return null;
  return { lat: nLat, lng: nLng };
}

export function isTruthyDbFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

export function parsePaginationParams(
  query: Record<string, unknown> | undefined,
  options?: { defaultLimit?: number; maxLimit?: number }
): PaginationParams {
  const defaultLimit = options?.defaultLimit ?? 50;
  const maxLimit = options?.maxLimit ?? 100;

  let limit = defaultLimit;
  if (query && query.limit !== undefined && String(query.limit).trim() !== '') {
    const rawLimit = Number(query.limit);
    if (Number.isInteger(rawLimit) && rawLimit >= 1) {
      limit = Math.min(rawLimit, maxLimit);
    }
  }

  let offset = 0;
  if (query && query.offset !== undefined && String(query.offset).trim() !== '') {
    const rawOffset = Number(query.offset);
    if (Number.isInteger(rawOffset) && rawOffset >= 0) {
      offset = Math.min(rawOffset, 100000);
    }
  } else if (query && query.page !== undefined && String(query.page).trim() !== '') {
    const rawPage = Number(query.page);
    if (Number.isInteger(rawPage) && rawPage >= 1) {
      offset = Math.min((rawPage - 1) * limit, 100000);
    }
  }

  return { limit, offset };
}

