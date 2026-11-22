// Tests for on-device row rebuilding, the offline parser and category guessing.
import assert from 'node:assert/strict';
import { guessCategory } from '../src/lib/guessCategory';
import { findDate, parseRowsLocally } from '../src/lib/localParse';
import { buildRows, type OcrLine } from '../src/lib/rows';

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log('  ok  ', name);
}

// A receipt as ML Kit returns it: names (left column) and prices (right
// column) as separate lines, with a slight tilt to the right.
function line(text: string, left: number, top: number, width: number, tilt = 0.02): OcrLine {
  const t = top + left * tilt;
  return { text, left, top: t, right: left + width, bottom: t + 22 };
}
const ocr: OcrLine[] = [
  line('CARREFOUR', 300, 40, 260),
  line('Mall of the Emirates, Dubai', 220, 75, 420),
  line('TAX INVOICE', 320, 110, 200),
  line('Date: 15/11/2026 18:42', 60, 150, 380),
  line('ALMARAI FF MILK 1L', 60, 220, 300),
  line('2 x 6.50', 60, 250, 120),
  line('13.00', 820, 250, 90),
  line('TOMATOES', 60, 290, 160),
  line('0.845 kg @ 4.95', 240, 290, 220),
  line('4.18', 830, 290, 80),
  line('ARABIC BREAD', 60, 330, 220),
  line('3.50', 830, 330, 80),
  line('TIDE DETERGENT 2.5KG', 60, 370, 340),
  line('46.00', 820, 370, 90),
  line('SUBTOTAL', 60, 430, 160),
  line('66.68', 820, 430, 90),
  line('VAT 5%', 60, 465, 110),
  line('3.33', 830, 465, 80),
  line('TOTAL', 60, 500, 110),
  line('70.01', 820, 500, 90),
  line('VISA ****4417', 60, 540, 240),
  line('70.01', 820, 540, 90),
];

const rows = buildRows(ocr);

test('names and prices from separate columns are put back on one row', () => {
  assert.ok(rows.some((r) => /^ARABIC BREAD\s+3\.50$/.test(r)), rows.join('\n'));
  assert.ok(rows.some((r) => /^2 x 6\.50\s+13\.00$/.test(r)), rows.join('\n'));
  assert.ok(rows.some((r) => /^TOTAL\s+70\.01$/.test(r)));
});

test('offline parser finds items, quantities, weights, totals and date', () => {
  const { draft, confidence } = parseRowsLocally(rows, 'AED', new Map(), '2026-11-22');
  const names = draft.items.map((i) => i.name);
  assert.deepEqual(names, ['Almarai Ff Milk 1L', 'Tomatoes', 'Arabic Bread', 'Tide Detergent 2.5kg']);
  assert.equal(draft.items[0].quantity, 2);
  assert.equal(draft.items[0].unit_price, 6.5);
  assert.equal(draft.items[0].total_price, 13);
  assert.equal(draft.items[1].unit, 'kg');
  assert.equal(draft.items[1].quantity, 0.85);
  assert.equal(draft.items[1].unit_price, 4.95);
  assert.equal(draft.items[1].total_price, 4.18);
  assert.equal(draft.total, 70.01);
  assert.equal(draft.tax, 3.33);
  assert.equal(draft.date, '2026-11-15');
  assert.equal(draft.time, '18:42');
  assert.equal(draft.store, 'Carrefour');
  assert.equal(draft.payment_method, 'card');
  assert.equal(draft.items[0].category, 'Dairy & Eggs');
  assert.equal(draft.items[3].category, 'Household & Cleaning');
  assert.ok(confidence >= 0.9, String(confidence));
});

test('past categories win over keyword guesses', () => {
  const hist = new Map([['arabic bread', 'Groceries']]);
  assert.equal(guessCategory('Arabic Bread', hist), 'Groceries');
  assert.equal(guessCategory('Lays Chips Salt'), 'Snacks & Sweets');
  assert.equal(guessCategory('Special 95 Petrol'), 'Fuel & Transport');
  assert.equal(guessCategory('Mango Juice 1L'), 'Beverages');
  assert.equal(guessCategory('Mango'), 'Fruits & Vegetables');
});

test('dates: day first, ISO, month names, never in the future', () => {
  assert.equal(findDate(['21-11-26 10:02'], '2026-11-22'), '2026-11-21');
  assert.equal(findDate(['2026/11/20'], '2026-11-22'), '2026-11-20');
  assert.equal(findDate(['20 Nov 2026'], '2026-11-22'), '2026-11-20');
  assert.equal(findDate(['30/12/2026'], '2026-11-22'), null);
});

test('a name on one row and the price on the next are joined', () => {
  const { draft } = parseRowsLocally(['LURPAK BUTTER UNSALTED 200G', '1 x 14.25    14.25', 'TOTAL   14.25'], 'AED', new Map(), '2026-11-22');
  assert.equal(draft.items.length, 1);
  assert.equal(draft.items[0].name, 'Lurpak Butter Unsalted 200g');
  assert.equal(draft.items[0].total_price, 14.25);
});

test('empty input gives an empty draft, not a crash', () => {
  const { draft, confidence } = parseRowsLocally([], 'AED', new Map(), '2026-11-22');
  assert.equal(draft.items.length, 0);
  assert.equal(confidence, 0);
});

console.log(`\n${passed} offline-reading tests passed`);
