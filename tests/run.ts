// Run with: npm test
import assert from 'node:assert/strict';
import { normalizeCategory } from '../src/lib/categories';
import { extractJsonObject, parseReceiptJson } from '../src/lib/ai';
import {
  categoryTotals,
  comparableRange,
  daysBetween,
  periodRange,
  spendInRange,
  summarizeItems,
  trend,
  type ItemRow,
  type ReceiptRow,
} from '../src/lib/stats';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log('  ok  ', name);
  } catch (e) {
    console.error('  FAIL', name);
    throw e;
  }
}

// Tuesday 17 Nov 2026
const today = new Date(2026, 10, 17);

test('week range starts on Monday by default', () => {
  const r = periodRange('week', 0, today, 1);
  assert.equal(r.start, '2026-11-16');
  assert.equal(r.end, '2026-11-22');
});
test('week range can start on Saturday', () => {
  const r = periodRange('week', 0, today, 6);
  assert.equal(r.start, '2026-11-14');
  assert.equal(r.end, '2026-11-20');
});
test('previous month range', () => {
  const r = periodRange('month', -1, today);
  assert.equal(r.start, '2026-10-01');
  assert.equal(r.end, '2026-10-31');
});
test('February in a leap year', () => {
  const r = periodRange('month', 0, new Date(2028, 1, 10));
  assert.equal(r.end, '2028-02-29');
});
test('month offset crosses a year boundary', () => {
  const r = periodRange('month', -11, today);
  assert.equal(r.start, '2025-12-01');
});
test('daysBetween', () => {
  assert.equal(daysBetween('2026-10-25', '2026-11-01'), 7);
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

const receipts: ReceiptRow[] = [
  { id: 1, store: 'Carrefour', date: '2026-10-01', total: 100 },
  { id: 2, store: 'Lulu', date: '2026-10-08', total: 50.5 },
  { id: 3, store: 'Carrefour', date: '2026-10-15', total: 20 },
  { id: 4, store: 'Carrefour', date: '2026-11-16', total: 30 },
  { id: 5, store: 'Lulu', date: '2026-11-16', total: 12 },
];
const mk = (id: number, receipt_id: number, name: string, date: string, total: number, qty = 1, category = 'Dairy & Eggs'): ItemRow => ({
  id, receipt_id, name, item_key: name.toLowerCase(), category, quantity: qty, unit: null,
  unit_price: total / qty, total_price: total, date, store: null,
});
const items: ItemRow[] = [
  mk(1, 1, 'Milk', '2026-10-01', 6, 1),
  mk(2, 2, 'Milk', '2026-10-08', 13, 2),
  mk(3, 3, 'Milk', '2026-10-15', 6.5, 1),
  mk(4, 4, 'Milk', '2026-11-16', 7, 1),
  mk(5, 5, 'Milk', '2026-11-16', 7, 1), // second receipt, same day
  mk(6, 1, 'Rice', '2026-10-01', 40, 1, 'Groceries'),
  mk(7, 1, 'Discount', '2026-10-01', -5, 1, 'Other'),
];

test('spend in a month', () => {
  assert.equal(spendInRange(receipts, periodRange('month', -1, today)), 170.5);
  assert.equal(spendInRange(receipts, periodRange('month', 0, today)), 42);
});
test('trend gives one bar per period, oldest first', () => {
  const t = trend(receipts, 'month', 3, today);
  assert.deepEqual(t.map((x) => x.total), [0, 170.5, 42]);
});
test('category totals are sorted by spend', () => {
  const c = categoryTotals(items, periodRange('month', -1, today));
  assert.equal(c[0].category, 'Groceries');
  assert.equal(c[0].total, 40);
  assert.equal(c[1].total, 25.5);
});
test('repurchase gaps and status', () => {
  const s = summarizeItems(items, '2026-11-17');
  const milk = s.find((x) => x.key === 'milk')!;
  assert.equal(milk.timesBought, 5);
  // gaps: 7, 7, 32 (the same-day second receipt is ignored)
  assert.equal(milk.avgGapDays, 15.3);
  assert.equal(milk.minGapDays, 7);
  assert.equal(milk.maxGapDays, 32);
  assert.equal(milk.daysSinceLast, 1);
  assert.equal(milk.status, 'ok');
  assert.equal(milk.lastPrice, 7);
  assert.equal(milk.totalQuantity, 6);
  assert.equal(milk.nextExpected, '2026-12-01');
  const rice = s.find((x) => x.key === 'rice')!;
  assert.equal(rice.status, 'once');
  assert.ok(!s.find((x) => x.key === 'discount'), 'discount lines are skipped');
});
test('overdue status', () => {
  const s = summarizeItems(items.filter((i) => i.receipt_id <= 3), '2026-11-17');
  const milk = s.find((x) => x.key === 'milk')!;
  assert.equal(milk.avgGapDays, 7);
  assert.equal(milk.status, 'overdue');
});

test('category normalization', () => {
  assert.equal(normalizeCategory('Produce'), 'Fruits & Vegetables');
  assert.equal(normalizeCategory('dairy & eggs'), 'Dairy & Eggs');
  assert.equal(normalizeCategory('???'), 'Other');
});
test('JSON is pulled out of a fenced, chatty reply', () => {
  const o = extractJsonObject('Sure! Here it is:\n```json\n{"a":1}\n```\nHope that helps') as { a: number };
  assert.equal(o.a, 1);
});
test('receipt parsing cleans numbers and fills gaps', () => {
  const reply = JSON.stringify({
    store: 'Carrefour Mall of the Emirates',
    date: '2026-11-15',
    time: '18:42:10',
    currency: 'aed',
    items: [
      { name: 'Almarai Full Fat Milk 1L', category: 'dairy', quantity: '2', unit_price: '6.50', total_price: null },
      { name: 'Tomatoes', category: 'Produce', quantity: 0.845, unit: 'kg', unit_price: 4.95, total_price: '4.18' },
      { name: '', total_price: 3 },
    ],
    subtotal: 17.18,
    tax: 0.86,
    total: 'AED 18.04',
    payment_method: 'Card',
  });
  const { draft, warnings } = parseReceiptJson(reply, 'AED', '2026-11-17');
  assert.equal(draft.items.length, 2);
  assert.equal(draft.items[0].total_price, 13);
  assert.equal(draft.items[0].category, 'Dairy & Eggs');
  assert.equal(draft.items[1].unit, 'kg');
  assert.equal(draft.total, 18.04);
  assert.equal(draft.time, '18:42');
  assert.equal(draft.currency, 'AED');
  assert.equal(draft.payment_method, 'card');
  assert.equal(warnings.length, 0, warnings.join(' | '));
});
test('future date falls back to today with a warning', () => {
  const { draft, warnings } = parseReceiptJson(
    '{"date":"2026-12-11","items":[{"name":"Bread","total_price":5}],"total":5}', 'AED', '2026-11-17');
  assert.equal(draft.date, '2026-11-17');
  assert.ok(warnings.some((w) => w.includes('date')));
});
test('mismatched total is flagged', () => {
  const { warnings } = parseReceiptJson('{"date":"2026-11-10","items":[{"name":"Bread","total_price":5}],"total":50}', 'AED', '2026-11-17');
  assert.ok(warnings.some((w) => w.includes('add up')));
});
test('not a receipt', () => {
  assert.throws(() => parseReceiptJson('{"error":"not_a_receipt"}', 'AED'), /doesn't look like a receipt/);
});

test('running month is compared with the same days of the previous month', () => {
  const cur = periodRange('month', 0, today);
  const prev = periodRange('month', -1, today);
  const c = comparableRange(cur, prev, '2026-11-17');
  assert.equal(c.partial, true);
  assert.equal(c.range.start, '2026-10-01');
  assert.equal(c.range.end, '2026-10-17');
  // March 31 compared with February is capped at the end of February
  const m = comparableRange(periodRange('month', 0, new Date(2026, 2, 31)), periodRange('month', -1, new Date(2026, 2, 31)), '2026-03-31');
  assert.equal(m.range.end, '2026-02-28');
  // A finished period is compared in full
  const f = comparableRange(prev, periodRange('month', -2, today), '2026-11-17');
  assert.equal(f.partial, false);
});

console.log(`\n${passed} tests passed`);
