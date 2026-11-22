// Pure date and statistics helpers. No React Native imports here, so the
// file can be unit-tested with plain Node (see tests/stats.test.ts).

export type Period = 'week' | 'month' | 'year';

export interface ItemRow {
  id: number;
  receipt_id: number;
  name: string;
  item_key: string;
  category: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  total_price: number;
  date: string; // YYYY-MM-DD, from the receipt
  store: string | null;
}

export interface ReceiptRow {
  id: number;
  store: string | null;
  date: string;
  total: number;
  tax?: number | null;
  vat_included?: number | null;
}

// ---------- dates ----------

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Whole days from a to b (b - a), immune to DST shifts. */
export function daysBetween(a: string, b: string): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  const ua = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const ub = Date.UTC(db.getFullYear(), db.getMonth(), db.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function addDays(s: string, n: number): string {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export interface Range {
  start: string; // inclusive
  end: string; // inclusive
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Range for a period. offset 0 = current, -1 = previous, and so on.
 * weekStartsOn: 0 = Sunday, 1 = Monday, 6 = Saturday.
 */
export function periodRange(period: Period, offset: number, today: Date = new Date(), weekStartsOn = 1): Range {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (period === 'week') {
    const diff = (t.getDay() - weekStartsOn + 7) % 7;
    const start = new Date(t);
    start.setDate(t.getDate() - diff + offset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const label = `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]}`;
    return { start: toISODate(start), end: toISODate(end), label };
  }
  if (period === 'month') {
    const start = new Date(t.getFullYear(), t.getMonth() + offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { start: toISODate(start), end: toISODate(end), label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}` };
  }
  const y = t.getFullYear() + offset;
  return { start: `${y}-01-01`, end: `${y}-12-31`, label: String(y) };
}

export function shortLabel(period: Period, r: Range): string {
  const s = parseISODate(r.start);
  if (period === 'week') return `${s.getDate()}/${s.getMonth() + 1}`;
  if (period === 'month') return MONTHS[s.getMonth()];
  return String(s.getFullYear());
}

export function inRange(date: string, r: Range): boolean {
  return date >= r.start && date <= r.end;
}

// ---------- spending ----------

export interface CategoryTotal {
  category: string;
  total: number;
  quantity: number;
}

export function spendInRange(receipts: ReceiptRow[], r: Range): number {
  return round2(receipts.filter((x) => inRange(x.date, r)).reduce((s, x) => s + x.total, 0));
}

export function categoryTotals(items: ItemRow[], r: Range): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  for (const it of items) {
    if (!inRange(it.date, r)) continue;
    const cur = map.get(it.category) ?? { category: it.category, total: 0, quantity: 0 };
    cur.total += it.total_price;
    cur.quantity += it.quantity;
    map.set(it.category, cur);
  }
  return [...map.values()]
    .map((c) => ({ ...c, total: round2(c.total), quantity: round2(c.quantity) }))
    .filter((c) => c.total !== 0)
    .sort((a, b) => b.total - a.total);
}

export function trend(receipts: ReceiptRow[], period: Period, count: number, today = new Date(), weekStartsOn = 1) {
  const out: { label: string; total: number; range: Range }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const r = periodRange(period, -i, today, weekStartsOn);
    out.push({ label: shortLabel(period, r), total: spendInRange(receipts, r), range: r });
  }
  return out;
}

export function storeTotals(receipts: ReceiptRow[], r: Range) {
  const map = new Map<string, { store: string; total: number; visits: number }>();
  for (const x of receipts) {
    if (!inRange(x.date, r)) continue;
    const name = (x.store || 'Unknown store').trim();
    const cur = map.get(name) ?? { store: name, total: 0, visits: 0 };
    cur.total += x.total;
    cur.visits += 1;
    map.set(name, cur);
  }
  return [...map.values()].map((s) => ({ ...s, total: round2(s.total) })).sort((a, b) => b.total - a.total);
}

// ---------- items and repurchase gaps ----------

export interface PurchaseEvent {
  date: string;
  quantity: number;
  unitPrice: number | null;
  total: number;
  store: string | null;
  receiptId: number;
  gapDays: number | null; // days since the previous purchase of this item
}

export type RebuyStatus = 'once' | 'ok' | 'soon' | 'due' | 'overdue';

export interface ItemSummary {
  key: string;
  name: string; // most recent display name
  category: string;
  unit: string | null;
  timesBought: number;
  totalQuantity: number;
  totalSpent: number;
  lastPrice: number | null;
  previousPrice: number | null;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  firstDate: string;
  lastDate: string;
  avgGapDays: number | null;
  minGapDays: number | null;
  maxGapDays: number | null;
  daysSinceLast: number;
  nextExpected: string | null;
  status: RebuyStatus;
  events: PurchaseEvent[]; // oldest first
}

export function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function unitPriceOf(it: ItemRow): number | null {
  if (it.unit_price != null && it.unit_price > 0) return it.unit_price;
  if (it.quantity > 0 && it.total_price > 0) return round2(it.total_price / it.quantity);
  return null;
}

export function rebuyStatus(timesBought: number, avgGap: number | null, daysSince: number): RebuyStatus {
  if (timesBought < 2 || avgGap == null || avgGap <= 0) return 'once';
  const ratio = daysSince / avgGap;
  if (ratio >= 1.5) return 'overdue';
  if (ratio >= 1) return 'due';
  if (ratio >= 0.75) return 'soon';
  return 'ok';
}

export function summarizeItems(items: ItemRow[], today: string = toISODate(new Date())): ItemSummary[] {
  const groups = new Map<string, ItemRow[]>();
  for (const it of items) {
    if (it.total_price < 0) continue; // discount lines are not products
    const arr = groups.get(it.item_key) ?? [];
    arr.push(it);
    groups.set(it.item_key, arr);
  }

  const out: ItemSummary[] = [];
  for (const [key, rows] of groups) {
    rows.sort((a, b) => (a.date === b.date ? a.receipt_id - b.receipt_id : a.date < b.date ? -1 : 1));

    // Merge lines of the same item on the same receipt into one purchase.
    const events: PurchaseEvent[] = [];
    for (const r of rows) {
      const last = events[events.length - 1];
      if (last && last.receiptId === r.receipt_id) {
        last.quantity = round2(last.quantity + r.quantity);
        last.total = round2(last.total + r.total_price);
        last.unitPrice = last.quantity > 0 ? round2(last.total / last.quantity) : last.unitPrice;
        continue;
      }
      events.push({
        date: r.date,
        quantity: r.quantity,
        unitPrice: unitPriceOf(r),
        total: r.total_price,
        store: r.store,
        receiptId: r.receipt_id,
        gapDays: null,
      });
    }

    // Gaps between purchases on different days. Two receipts on the same day
    // count as one trip for the gap maths.
    const gaps: number[] = [];
    let prevDate: string | null = null;
    for (const e of events) {
      if (prevDate != null) {
        const g = daysBetween(prevDate, e.date);
        e.gapDays = g;
        if (g > 0) gaps.push(g);
      }
      if (prevDate == null || e.date !== prevDate) prevDate = e.date;
    }

    const prices = events.map((e) => e.unitPrice).filter((p): p is number => p != null);
    const lastDate = events[events.length - 1].date;
    const avgGap = gaps.length ? round1(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
    const daysSince = Math.max(0, daysBetween(lastDate, today));
    const latest = rows[rows.length - 1];

    out.push({
      key,
      name: latest.name,
      category: latest.category,
      unit: latest.unit,
      timesBought: events.length,
      totalQuantity: round2(events.reduce((s, e) => s + e.quantity, 0)),
      totalSpent: round2(events.reduce((s, e) => s + e.total, 0)),
      lastPrice: prices.length ? prices[prices.length - 1] : null,
      previousPrice: prices.length > 1 ? prices[prices.length - 2] : null,
      avgPrice: prices.length ? round2(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      firstDate: events[0].date,
      lastDate,
      avgGapDays: avgGap,
      minGapDays: gaps.length ? Math.min(...gaps) : null,
      maxGapDays: gaps.length ? Math.max(...gaps) : null,
      daysSinceLast: daysSince,
      nextExpected: avgGap != null ? addDays(lastDate, Math.round(avgGap)) : null,
      status: rebuyStatus(events.length, avgGap, daysSince),
      events,
    });
  }
  return out;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * For a period that is still running, cut the previous period to the same
 * number of days, so 1–22 Nov is compared with 1–22 Oct rather than all of October.
 */
export function comparableRange(current: Range, previous: Range, today: string = toISODate(new Date())): { range: Range; partial: boolean } {
  if (!(today >= current.start && today <= current.end)) return { range: previous, partial: false };
  const elapsed = daysBetween(current.start, today);
  const end = addDays(previous.start, elapsed);
  return { range: { ...previous, end: end < previous.end ? end : previous.end }, partial: true };
}

/** VAT recorded on receipts in a range (whether it was included in prices or added on top). */
export function vatInRange(receipts: ReceiptRow[], r: Range): { vat: number; receipts: number } {
  let vat = 0;
  let n = 0;
  for (const x of receipts) {
    if (!inRange(x.date, r) || !x.tax) continue;
    vat += x.tax;
    n++;
  }
  return { vat: round2(vat), receipts: n };
}

/** VAT contained in a VAT-inclusive amount, e.g. 105 at 5% contains 5. */
export function vatFromInclusive(amount: number, ratePct: number): number {
  return ratePct > 0 ? round2((amount * ratePct) / (100 + ratePct)) : 0;
}
