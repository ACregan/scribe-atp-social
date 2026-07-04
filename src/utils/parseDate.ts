const RELATIVE_RE = /^-(\d+)d$/;
const MAX_RANGE_SECONDS = 90 * 24 * 60 * 60;

export function parseDate(value: string, fallback: number): number {
  const rel = RELATIVE_RE.exec(value);
  if (rel) {
    const days = parseInt(rel[1], 10);
    return Math.floor(Date.now() / 1000) - days * 86400;
  }
  // Plain integer — treat as Unix timestamp in seconds
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  const ts = Date.parse(value);
  if (!isNaN(ts)) return Math.floor(ts / 1000);
  return fallback;
}

export function validateDateRange(from: number, to: number): string | null {
  if (from >= to) return '`from` must be before `to`';
  if (to - from > MAX_RANGE_SECONDS) return 'Date range may not exceed 90 days';
  return null;
}
