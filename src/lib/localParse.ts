// Offline receipt parser. It runs on the text rows from the on-device reader
// and needs no internet and no AI. It's used when the AI is slow, busy or
// offline, and always gives you a draft to correct instead of an error.

import { guessCategory } from './guessCategory';
import type { DraftItem, DraftReceipt } from './db';
import { round2, toISODate } from './stats';

const SKIP = new RegExp(
  [
    'sub ?total', '\\btotal\\b', 'vat', '\\btax\\b', 'change', 'cash', 'card', 'visa', 'master', 'mada', 'balance',
    'tender', 'amount due', 'net amount', 'points', 'loyalty', 'saving', 'you saved', '\\btel\\b', 'phone', 'trn',
    'invoice', 'receipt', 'cashier', 'counter', 'terminal', 'approval', 'auth', 'thank', 'welcome', 'www', '\\.com',
    'items? sold', 'no\\. of items', 'rounding', 'paid', 'payment', 'emirates', 'p\\.?o\\.? box', 'customer',
  ].join('|'),
  'i',
);

const PRICE_AT_END = /(-?\d{1,6}(?:[.,]\d{3})*[.,]\d{2})\s*(?:[A-Z]{1,2}|\*)?\s*$/;
const QTY_TIMES = /(\d+(?:[.,]\d+)?)\s*(?:x|X|×|@|\*)\s*(\d+(?:[.,]\d{1,3}))/;
// "0.845 kg @ 4.95" (weighed goods) or a bare 3-decimal weight like "0.845 kg".
// A pack size such as "2.5KG" inside a product name is left alone.
const WEIGHT_AT = /(\d+[.,]\d{1,3})\s*kg\s*(?:@|x|×|\*)\s*(\d+(?:[.,]\d{1,3}))/i;
const WEIGHT = /(\d+[.,]\d{3})\s*kg\b/i;

function toNum(s: string): number {
  // "1,234.50" or "1.234,50" or "12,50"
  const t = s.trim();
  if (/^\-?\d{1,3}(,\d{3})+\.\d{2}$/.test(t)) return Number(t.replace(/,/g, ''));
  if (/^\-?\d{1,3}(\.\d{3})+,\d{2}$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  return Number(t.replace(',', '.'));
}

export function findDate(rows: string[], today: string): string | null {
  for (const r of rows) {
    let m = r.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (m) return valid(+m[1], +m[2], +m[3], today);
    m = r.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (m) {
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      // Day first (UAE and most of the world); fall back to month first if needed.
      return valid(y, +m[2], +m[1], today) ?? valid(y, +m[1], +m[2], today);
    }
    m = r.match(/\b(\d{1,2})[\s-]?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s-]?(\d{2,4})\b/i);
    if (m) {
      const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
      const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      return valid(y, mon, +m[1], today);
    }
  }
  return null;
}

function valid(y: number, m: number, d: number, today: string): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  const iso = toISODate(dt);
  return iso <= today ? iso : null;
}

function findTime(rows: string[]): string | null {
  for (const r of rows) {
    const m = r.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*(AM|PM)?\b/i);
    if (m) {
      let h = +m[1];
      if (m[3]?.toUpperCase() === 'PM' && h < 12) h += 12;
      if (m[3]?.toUpperCase() === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${m[2]}`;
    }
  }
  return null;
}

function findStore(rows: string[]): string | null {
  for (const r of rows.slice(0, 6)) {
    const t = r.replace(/\s{2,}/g, ' ').trim();
    const letters = (t.match(/[A-Za-z]/g) ?? []).length;
    if (letters >= 3 && letters / t.length > 0.5 && !PRICE_AT_END.test(t) && !/tax invoice|receipt|welcome|trn/i.test(t)) {
      return titleCase(t);
    }
  }
  return null;
}

function findAmount(rows: string[], re: RegExp): number | null {
  let best: number | null = null;
  for (const r of rows) {
    if (!re.test(r)) continue;
    const m = r.match(PRICE_AT_END);
    if (m) {
      const n = toNum(m[1]);
      if (best == null || n > best) best = n;
    }
  }
  return best;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(\d+(?:\.\d+)?)\s?(ml|kg|g|l|ltr|pcs)\b/gi, (_, n: string, u: string) => {
      const unit = u.toLowerCase();
      return n + (unit === 'l' || unit === 'ltr' ? 'L' : unit);
    });
}

export function parseRowsLocally(
  rows: string[],
  currency: string,
  history: Map<string, string> = new Map(),
  today: string = toISODate(new Date()),
): { draft: DraftReceipt; warnings: string[]; confidence: number } {
  const items: DraftItem[] = [];
  let pendingName: string | null = null;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i].replace(/\s{2,}/g, '  ').trim();
    if (!raw) continue;
    if (SKIP.test(raw)) {
      pendingName = null;
      continue;
    }
    const pm = raw.match(PRICE_AT_END);
    if (!pm) {
      // A name on its own line, with the price on the next line (common layout).
      const letters = (raw.match(/[A-Za-z]/g) ?? []).length;
      pendingName = letters >= 3 ? raw : null;
      continue;
    }
    const total = toNum(pm[1]);
    let name = raw.slice(0, pm.index).trim();
    let quantity = 1;
    let unit: string | null = null;
    let unitPrice: number | null = null;

    const wa = name.match(WEIGHT_AT);
    if (wa) {
      quantity = toNum(wa[1]);
      unit = 'kg';
      unitPrice = toNum(wa[2]);
      name = name.replace(wa[0], ' ').trim();
    }
    const qm = wa ? null : name.match(QTY_TIMES);
    if (qm) {
      quantity = toNum(qm[1]);
      unitPrice = toNum(qm[2]);
      name = name.replace(qm[0], ' ').trim();
    }
    const wm = wa ? null : name.match(WEIGHT);
    if (wm) {
      quantity = toNum(wm[1]);
      unit = 'kg';
      name = name.replace(wm[0], ' ').trim();
    }
    // Strip barcodes, item codes and stray numbers at the start or end.
    name = name
      .replace(/^\d{4,}\s*/, '')
      .replace(/[\s@x×*]+$/i, '')
      .replace(/\s+\d+([.,]\d+)?$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if ((name.match(/[A-Za-z]/g) ?? []).length < 2 && pendingName) name = pendingName;
    else if (qm && pendingName && (name.match(/[A-Za-z]/g) ?? []).length < 3) name = pendingName;
    pendingName = null;

    if ((name.match(/[A-Za-z]/g) ?? []).length < 2) continue;
    if (total === 0 || Math.abs(total) > 50000) continue;

    const nice = titleCase(name);
    items.push({
      name: nice,
      category: guessCategory(nice, history),
      quantity: round2(quantity),
      unit,
      unit_price: unitPrice ?? (quantity ? round2(total / quantity) : null),
      total_price: round2(total),
    });
  }

  const itemsSum = round2(items.reduce((s, i) => s + i.total_price, 0));
  const total = findAmount(rows, /\b(grand total|total|net amount|amount due|net total)\b/i) ?? itemsSum;
  const tax = findAmount(rows, /\b(vat|tax)\b/i);
  const date = findDate(rows, today);

  const warnings: string[] = ['Read offline from the photo. Check the item names and prices before saving.'];
  if (!date) warnings.push("The date wasn't clear, so today's date was used.");
  const matches = total > 0 && (Math.abs(total - itemsSum) < 0.05 || (tax != null && Math.abs(total - tax - itemsSum) < 0.05));
  if (!matches && items.length) {
    warnings.push(`The items add up to ${itemsSum.toFixed(2)}, but the total looks like ${total.toFixed(2)}. Some lines may be missing.`);
  }

  // Rough confidence: found items, and they add up to the total.
  const confidence = items.length === 0 ? 0 : matches ? 0.9 : Math.max(0.2, 1 - Math.abs(total - itemsSum) / Math.max(total, 1));

  return {
    draft: {
      store: findStore(rows),
      date: date ?? today,
      time: findTime(rows),
      subtotal: null,
      tax,
      discount: null,
      total: round2(total),
      currency,
      payment_method: rows.some((r) => /visa|master|card|mada/i.test(r)) ? 'card' : rows.some((r) => /\bcash\b/i.test(r)) ? 'cash' : null,
      image_uri: null,
      note: null,
      source: 'scan',
      items,
    },
    warnings,
    confidence,
  };
}
