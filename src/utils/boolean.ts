export function isDbFlagTrue(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function isDbFlagNotFalse(value: unknown, defaultValue = true): boolean {
  if (value === undefined || value === null) return defaultValue;
  return value === true || value === 1 || value === '1';
}
