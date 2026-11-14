/**
 * Date/Time utilities for consistent UTC storage in TiDB/MySQL DATETIME columns
 * and unambiguous ISO-8601 UTC serialization across API boundaries.
 */

function isValidCalendarDateTime(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  seconds: number
): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hours < 0 || hours > 23) return false;
  if (minutes < 0 || minutes > 59) return false;
  if (seconds < 0 || seconds > 59) return false;

  const check = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, 0));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/**
 * Parses a departure_time input (Date, ISO-8601 with timezone, or naive YYYY-MM-DD[T ]HH:mm[:ss] interpreted as UTC).
 * Returns null for malformed or calendar-invalid dates.
 */
export function parseRideDateTime(input: unknown): Date | null {
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : new Date(input.getTime());
  }

  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  // 1. Naive MySQL DATETIME or local-less ISO datetime -> treat deterministically as UTC
  const naiveMatch = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?$/.exec(trimmed);
  if (naiveMatch) {
    const year = Number(naiveMatch[1]);
    const month = Number(naiveMatch[2]);
    const day = Number(naiveMatch[3]);
    const hours = Number(naiveMatch[4]);
    const minutes = Number(naiveMatch[5]);
    const seconds = naiveMatch[6] ? Number(naiveMatch[6]) : 0;
    const ms = naiveMatch[7] ? Number(naiveMatch[7].padEnd(3, '0')) : 0;

    if (!isValidCalendarDateTime(year, month, day, hours, minutes, seconds)) {
      return null;
    }

    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, ms));
  }

  // 2. ISO-8601 with explicit Z or numeric offset (+HH:MM, -HH:MM, +HHMM, +HH)
  const tzMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d|[+-](?:[01]\d|2[0-3]))$/i.exec(trimmed);
  if (tzMatch) {
    const year = Number(tzMatch[1]);
    const month = Number(tzMatch[2]);
    const day = Number(tzMatch[3]);
    const hours = Number(tzMatch[4]);
    const minutes = Number(tzMatch[5]);
    const seconds = tzMatch[6] ? Number(tzMatch[6]) : 0;

    if (!isValidCalendarDateTime(year, month, day, hours, minutes, seconds)) {
      return null;
    }

    // Normalize +HH or +HHMM offset to +HH:MM for consistent ES Date parsing
    let normalizedIso = trimmed;
    const tzPart = tzMatch[7];
    if (/^[+-]\d{2}$/.test(tzPart)) {
      normalizedIso = trimmed.slice(0, -tzPart.length) + `${tzPart}:00`;
    } else if (/^[+-]\d{4}$/.test(tzPart)) {
      normalizedIso = trimmed.slice(0, -tzPart.length) + `${tzPart.slice(0, 3)}:${tzPart.slice(3)}`;
    }

    const parsed = new Date(normalizedIso);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

/**
 * Formats a Date into UTC MySQL/TiDB DATETIME literal: 'YYYY-MM-DD HH:mm:ss'.
 */
export function formatDateToMySqlUtc(date: Date): string {
  const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Normalizes a retrieved database DATETIME (Date or string) into canonical ISO-8601 UTC ('...Z').
 */
export function toUtcIsoString(value: unknown): string {
  const parsed = parseRideDateTime(value);
  if (parsed) {
    return parsed.toISOString();
  }
  return typeof value === 'string' ? value : String(value ?? '');
}

/**
 * Converts a local calendar date (YYYY-MM-DD) in an optional IANA timezone into
 * exact UTC start (inclusive) and end (exclusive) Dates, handling DST 23h/25h days accurately.
 */
function zonedMidnightToUtc(year: number, month: number, day: number, timeZone: string): Date | null {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    });

    // Initial guess at UTC midnight
    let guessMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    for (let i = 0; i < 3; i++) {
      const parts = dtf.formatToParts(new Date(guessMs));
      const map: Record<string, number> = {};
      for (const p of parts) {
        if (p.type !== 'literal') map[p.type] = Number(p.value);
      }
      const zonedAsUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second, 0);
      const targetAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
      const diff = targetAsUtc - zonedAsUtc;
      if (diff === 0) break;
      guessMs += diff;
    }
    return new Date(guessMs);
  } catch {
    return null;
  }
}

export interface RideDateRangeBounds {
  startUtcSql: string;
  endUtcSql: string;
}

/**
 * Resolves search date filter into [startUtcSql, endUtcSql) exclusive-end boundaries.
 * Returns null if no date filter is specified, or throws Error('INVALID_DATE_FILTER') on malformed input.
 */
export function resolveRideSearchDateBounds(query: {
  date?: unknown;
  date_start?: unknown;
  date_end?: unknown;
  tz_offset?: unknown;
  time_zone?: unknown;
}): RideDateRangeBounds | null {
  const hasExplicitBounds = query.date_start !== undefined || query.date_end !== undefined;
  if (hasExplicitBounds) {
    const startDate = parseRideDateTime(query.date_start);
    const endDate = parseRideDateTime(query.date_end);
    if (!startDate || !endDate) {
      throw new Error('INVALID_DATE_FILTER');
    }
    const spanMs = endDate.getTime() - startDate.getTime();
    if (spanMs <= 0 || spanMs > 48 * 3600 * 1000) {
      throw new Error('INVALID_DATE_FILTER');
    }
    return {
      startUtcSql: formatDateToMySqlUtc(startDate),
      endUtcSql: formatDateToMySqlUtc(endDate)
    };
  }

  if (query.date === undefined || query.date === null || String(query.date).trim() === '') {
    return null;
  }

  if (typeof query.date !== 'string') {
    throw new Error('INVALID_DATE_FILTER');
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(query.date.trim());
  if (!dateMatch) {
    throw new Error('INVALID_DATE_FILTER');
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (!isValidCalendarDateTime(year, month, day, 0, 0, 0)) {
    throw new Error('INVALID_DATE_FILTER');
  }

  if (typeof query.time_zone === 'string' && query.time_zone.trim()) {
    const startZoned = zonedMidnightToUtc(year, month, day, query.time_zone.trim());
    const nextDayCheck = new Date(Date.UTC(year, month - 1, day + 1));
    const endZoned = zonedMidnightToUtc(
      nextDayCheck.getUTCFullYear(),
      nextDayCheck.getUTCMonth() + 1,
      nextDayCheck.getUTCDate(),
      query.time_zone.trim()
    );
    if (!startZoned || !endZoned || endZoned.getTime() <= startZoned.getTime()) {
      throw new Error('INVALID_DATE_FILTER');
    }
    return {
      startUtcSql: formatDateToMySqlUtc(startZoned),
      endUtcSql: formatDateToMySqlUtc(endZoned)
    };
  }

  let offsetMinutes = 0;
  if (query.tz_offset !== undefined && String(query.tz_offset).trim() !== '') {
    const parsedOffset = Number(query.tz_offset);
    if (!Number.isFinite(parsedOffset) || parsedOffset < -840 || parsedOffset > 840) {
      throw new Error('INVALID_DATE_FILTER');
    }
    offsetMinutes = parsedOffset;
  }

  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) + offsetMinutes * 60 * 1000;
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return {
    startUtcSql: formatDateToMySqlUtc(new Date(startMs)),
    endUtcSql: formatDateToMySqlUtc(new Date(endMs))
  };
}

