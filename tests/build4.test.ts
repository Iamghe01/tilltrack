// Build 4: paste import and Google Lens column pairing.
import assert from 'node:assert/strict';
import { pairColumns, parseRowsLocally } from '../src/lib/localParse';
import { interpretPaste, promptForOtherApp } from '../src/lib/pasteImport';

let passed = 0;
const test = (n: string, fn: () => void) => { fn(); passed++; console.log('  ok  ', n); };

test('Lens-style columns (names, then prices) are paired back up', () => {
  const lens = ['CARREFOUR', 'ALMARAI MILK 1L', 'ARABIC BREAD', 'CHICKEN BREAST 1KG', '6.50', '3.50', '29.00', 'TOTAL', '39.00'];
  const rows = pairColumns(lens);
  assert.ok(rows.includes('ALMARAI MILK 1L    6.50'), rows.join(' | '));
  assert.ok(rows.includes('CHICKEN BREAST 1KG    29.00'));
  const { draft } = parseRowsLocally(lens, 'AED', new Map(), '2026-11-22');
  assert.deepEqual(draft.items.map((i) => i.total_price), [6.5, 3.5, 29]);
  assert.equal(draft.total, 39);
});

test('normal rows are left alone', () => {
  const rows = ['MILK    6.50', 'BREAD    3.50'];
  assert.deepEqual(pairColumns(rows), rows);
});

test('a ready answer from an AI app is imported exactly', () => {
  const answer = 'Here you go!\n```json\n' + JSON.stringify({
    store: 'Lulu', date: '2026-11-20', currency: 'AED', vat_included: true, tax: 0.79,
    items: [{ name: 'Beef Mince 500g', category: 'Meat & Seafood', quantity: 1, unit_price: 16.5, total_price: 16.5 }],
    total: 16.5,
  }) + '\n```';
  const r = interpretPaste(answer, 'AED', '2026-11-22');
  assert.equal(r.kind, 'ready');
  if (r.kind === 'ready') {
    assert.equal(r.draft.store, 'Lulu');
    assert.equal(r.draft.items[0].name, 'Beef Mince 500g');
    assert.equal(r.draft.vat_included, true);
  }
});

test('plain text becomes rows to arrange', () => {
  const r = interpretPaste('LULU\r\nMILK\t6.50\n\nBREAD 3.50\n', 'AED');
  assert.equal(r.kind, 'text');
  if (r.kind === 'text') assert.deepEqual(r.rows, ['LULU', 'MILK    6.50', 'BREAD 3.50']);
});

test('the prompt for other apps asks for JSON in one code block', () => {
  const p = promptForOtherApp('AED', '2026-11-22');
  assert.match(p, /Return ONLY one JSON object/);
  assert.match(p, /one code block/);
  assert.match(p, /vat_included/);
});

import { itemType } from '../src/lib/itemTypes';
import { periodRange, typeBreakdown, type ItemRow } from '../src/lib/stats';

test('meat types: chicken, beef, fish, seafood, pork', () => {
  const t = (n: string) => itemType(n, 'Meat & Seafood');
  assert.equal(t('Chicken Breast Fillet 1kg'), 'Chicken');
  assert.equal(t('Australian Beef Mince 500g'), 'Beef');
  assert.equal(t('Fresh Hammour Fish'), 'Fish');
  assert.equal(t('Jumbo Shrimps 500g'), 'Seafood');
  assert.equal(t('Pork Belly'), 'Pork');
  assert.equal(t('Turkey Slices'), 'Sausages & Deli');
  assert.equal(t('Something Odd'), 'Other');
});
test('your own choice of type wins', () => {
  assert.equal(itemType('Something Odd', 'Meat & Seafood', new Map([['something odd', 'Lamb & Mutton']])), 'Lamb & Mutton');
});
test('October meat breakdown with kg, times and last-month comparison', () => {
  const mk = (id: number, name: string, date: string, total: number, qty: number, unit: string | null): ItemRow => ({
    id, receipt_id: id, name, item_key: name.toLowerCase(), category: 'Meat & Seafood', quantity: qty, unit, unit_price: null, total_price: total, date, store: null,
  });
  const rows = [
    mk(1, 'Chicken Breast', '2026-10-03', 29, 1, null),
    mk(2, 'Chicken Breast', '2026-10-17', 31, 1, null),
    mk(3, 'Beef Steak', '2026-10-10', 42.5, 0.85, 'kg'),
    mk(4, 'Hammour Fish', '2026-10-12', 38, 1.2, 'kg'),
    mk(5, 'Chicken Breast', '2026-09-20', 28, 1, null),
  ];
  const oct = periodRange('month', 0, new Date(2026, 9, 15));
  const sep = periodRange('month', -1, new Date(2026, 9, 15));
  const b = typeBreakdown(rows, 'Meat & Seafood', oct, sep, (n, c) => itemType(n, c));
  assert.deepEqual(b.map((x) => [x.type, x.total]), [['Chicken', 60], ['Beef', 42.5], ['Fish', 38]]);
  assert.equal(b[0].times, 2);
  assert.equal(b[0].pcs, 2);
  assert.equal(b[0].prevTotal, 28);
  assert.equal(b[1].kg, 0.85);
});

console.log(`\n${passed} build-4 tests passed`);
