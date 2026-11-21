import { daysBetween, parseISODate, toISODate } from './stats';

export function money(n: number | null | undefined, currency: string): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}${currency} ${s}`;
}

export function qty(n: number, unit?: string | null): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(n < 1 ? 3 : 2).replace(/0+$/, '').replace(/\.$/, '');
  return unit ? `${s} ${unit}` : `×${s}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function prettyDate(iso: string, withDay = false): string {
  const d = parseISODate(iso);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return withDay ? `${DAYS[d.getDay()]}, ${base}` : base;
}

export function relativeDays(iso: string): string {
  const n = daysBetween(iso, toISODate(new Date()));
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 0) return `in ${-n} days`;
  return `${n} days ago`;
}

export function gapText(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'same day';
  if (days < 14) return `${days} d`;
  if (days < 60) return `${Math.round(days / 7)} wk`;
  return `${Math.round(days / 30)} mo`;
}

/** "Sat 21 Nov" — compact, for lists. */
export function shortDate(iso: string): string {
  const d = parseISODate(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
