// Build 3: weighed items, VAT and the calendar-free date helpers.
import assert from 'node:assert/strict';
import { recalcLine } from '../src/lib/lineMath';
import { parseRowsLocally } from '../src/lib/localParse';
import { parseReceiptJson } from '../src/lib/ai';
import { vatFromInclusive, vatInRange, periodRange, type ReceiptRow } from '../src/lib/stats';

let passed = 0;
const test = (n: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', n); };

test('weight × price per kg = line total (your apple example)', () => {
  const l = recalcLine({ qty: '0.65', unitPrice: '10', total: '' }, 'unitPrice');
  assert.equal(l.total, '6.5');
});
test('price per kg and total → weight', () => {
  const l = recalcLine({ qty: '', unitPrice: '10', total: '6.5' }, 'total');
  assert.equal(l.qty, '0.65');
});
test('weight and total → price per kg', () => {
  const l = recalcLine({ qty: '0.845', unitPrice: '', total: '4.18' }, 'total');
  assert.equal(l.unitPrice, '4.95');
});
test('pieces: changing quantity keeps the price each', () => {
  const l = recalcLine({ qty: '3', unitPrice: '6.5', total: '13' }, 'qty');
  assert.equal(l.total, '19.5');
});

test('VAT inside a price: 105 at 5% contains 5', () => {
  assert.equal(vatFromInclusive(105, 5), 5);
  assert.equal(vatFromInclusive(70.01, 5), 3.33);
});
test('VAT paid in a month adds up recorded VAT', () => {
  const rows: ReceiptRow[] = [
    { id: 1, store: 'A', date: '2026-11-02', total: 105, tax: 5, vat_included: 1 },
    { id: 2, store: 'B', date: '2026-11-10', total: 21, tax: 1, vat_included: 1 },
    { id: 3, store: 'C', date: '2026-10-30', total: 50, tax: 2.38, vat_included: 1 },
  ];
  const v = vatInRange(rows, periodRange('month', 0, new Date(2026, 10, 22)));
  assert.equal(v.vat, 6);
  assert.equal(v.receipts, 2);
});

test('AI result: VAT-inclusive receipt is recognised from the numbers', () => {
  const { draft } = parseReceiptJson(JSON.stringify({
    date: '2026-11-20', items: [{ name: 'Milk', total_price: 6.5 }, { name: 'Bread', total_price: 3.5 }],
    tax: 0.48, total: 10,
  }), 'AED', '2026-11-22');
  assert.equal(draft.vat_included, true);
});
test('AI result: VAT added on top is recognised', () => {
  const { draft } = parseReceiptJson(JSON.stringify({
    date: '2026-11-20', items: [{ name: 'Milk', total_price: 10 }], tax: 0.5, total: 10.5,
  }), 'AED', '2026-11-22');
  assert.equal(draft.vat_included, false);
});
test('AI result: pieces for weighed goods are kept', () => {
  const { draft } = parseReceiptJson(JSON.stringify({
    date: '2026-11-20', items: [{ name: 'Apples', quantity: 0.65, unit: 'kg', unit_price: 10, total_price: 6.5, pieces: 2 }], total: 6.5, vat_included: true,
  }), 'AED', '2026-11-22');
  assert.equal(draft.items[0].pieces, 2);
  assert.equal(draft.items[0].unit, 'kg');
});
test('offline: "VAT included" text marks the receipt VAT-inclusive', () => {
  const { draft } = parseRowsLocally(['LULU', 'MILK    6.50', 'BREAD    3.50', 'TOTAL    10.00', 'VAT 5% INCLUDED    0.48'], 'AED', new Map(), '2026-11-22');
  assert.equal(draft.vat_included, true);
  assert.equal(draft.tax, 0.48);
  assert.equal(draft.total, 10);
});

import { guessCategory } from '../src/lib/guessCategory';
test('plurals are recognised (apples, bananas, onions)', () => {
  assert.equal(guessCategory('Apples Royal Gala'), 'Fruits & Vegetables');
  assert.equal(guessCategory('Red Onions 1kg'), 'Fruits & Vegetables');
  assert.equal(guessCategory('Eggs Large 30'), 'Dairy & Eggs');
});

console.log(`\n${passed} build-3 tests passed`);
