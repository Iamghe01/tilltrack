// Realistic demo receipts, so you can try the app (and preview the screens)
// before scanning anything. Every sample receipt carries SAMPLE_NOTE, so it
// can be removed again in one tap.
import type { DraftItem, DraftReceipt } from './db';
import { addDays, round2, toISODate } from './stats';

export const SAMPLE_NOTE = 'Sample data';

interface Product {
  name: string;
  category: string;
  price: number;
  every: number; // typical days between purchases
  unit?: string;
  qty?: [number, number];
}

const GROCERY: Product[] = [
  { name: 'Almarai Full Fat Milk 1L', category: 'Dairy & Eggs', price: 6.5, every: 4, qty: [1, 3] },
  { name: 'Al Ain Water 1.5L x6', category: 'Beverages', price: 9.5, every: 7, qty: [1, 2] },
  { name: 'Eggs Large 30 pcs', category: 'Dairy & Eggs', price: 21.75, every: 12 },
  { name: 'Arabic Bread Pack', category: 'Bakery', price: 3.5, every: 3, qty: [1, 2] },
  { name: 'Bananas', category: 'Fruits & Vegetables', price: 5.95, every: 6, unit: 'kg', qty: [1, 2] },
  { name: 'Tomatoes', category: 'Fruits & Vegetables', price: 4.5, every: 5, unit: 'kg', qty: [1, 2] },
  { name: 'Chicken Breast Fillet 1kg', category: 'Meat & Seafood', price: 29.0, every: 8 },
  { name: 'India Gate Basmati Rice 5kg', category: 'Groceries', price: 42.0, every: 35 },
  { name: 'Lurpak Butter 200g', category: 'Dairy & Eggs', price: 14.25, every: 20 },
  { name: 'Nescafe Gold 200g', category: 'Beverages', price: 38.5, every: 30 },
  { name: 'Fairy Dishwashing Liquid 1L', category: 'Household & Cleaning', price: 12.75, every: 28 },
  { name: 'Tide Detergent 2.5kg', category: 'Household & Cleaning', price: 46.0, every: 40 },
  { name: 'Colgate Toothpaste 120ml', category: 'Personal Care', price: 9.0, every: 45 },
  { name: 'Lays Chips Salt 160g', category: 'Snacks & Sweets', price: 7.5, every: 9 },
  { name: 'Greek Yoghurt 500g', category: 'Dairy & Eggs', price: 11.5, every: 7 },
  { name: 'Frozen Mixed Vegetables 1kg', category: 'Frozen', price: 13.0, every: 21 },
];

const STORES = ['Carrefour', 'Lulu Hypermarket', 'Union Coop', 'Spinneys'];

/** Small deterministic random generator, so the sample looks the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function buildSampleReceipts(today: Date = new Date(), days = 120): DraftReceipt[] {
  const rand = rng(42);
  const start = addDays(toISODate(today), -days);
  const nextDue = new Map<string, number>();
  GROCERY.forEach((p) => nextDue.set(p.name, Math.floor(rand() * p.every)));

  const receipts: DraftReceipt[] = [];
  for (let d = 0; d <= days; d++) {
    const date = addDays(start, d);
    // A grocery trip roughly every 3 to 4 days.
    if (d % 3 === 0 || rand() < 0.1) {
      const items: DraftItem[] = [];
      for (const p of GROCERY) {
        if ((nextDue.get(p.name) ?? 0) > d) continue;
        // Real gaps wobble around the typical value.
        nextDue.set(p.name, d + Math.max(1, Math.round(p.every * (0.75 + rand() * 0.5))));
        const [lo, hi] = p.qty ?? [1, 1];
        const qty = p.unit === 'kg' ? round2(0.6 + rand() * 1.2) : lo + Math.floor(rand() * (hi - lo + 1));
        // Prices drift a little over time.
        const unitPrice = round2(p.price * (0.92 + rand() * 0.16));
        items.push({ name: p.name, category: p.category, quantity: qty, unit: p.unit ?? null, unit_price: unitPrice, total_price: round2(unitPrice * qty) });
      }
      if (items.length) {
        const subtotal = round2(items.reduce((s, i) => s + i.total_price, 0));
        const tax = round2(subtotal * 0.05);
        receipts.push(
          base(date, STORES[Math.floor(rand() * STORES.length)], items, subtotal, tax, `${10 + Math.floor(rand() * 11)}:${String(Math.floor(rand() * 60)).padStart(2, '0')}`),
        );
      }
    }
    // Fuel about every 9 days.
    if (d % 9 === 4) {
      const litres = round2(38 + rand() * 12);
      const price = 2.58;
      const total = round2(litres * price);
      receipts.push(base(date, 'ENOC', [{ name: 'Special 95 Petrol', category: 'Fuel & Transport', quantity: litres, unit: 'L', unit_price: price, total_price: total }], total, 0, '08:15'));
    }
    // Eating out on some weekends.
    const dow = new Date(`${date}T12:00:00`).getDay();
    if ((dow === 5 || dow === 6) && rand() < 0.45) {
      const items: DraftItem[] = [
        { name: 'Chicken Shawarma Plate', category: 'Dining Out', quantity: 2, unit: null, unit_price: 24, total_price: 48 },
        { name: 'Fresh Orange Juice', category: 'Dining Out', quantity: 2, unit: null, unit_price: 12, total_price: 24 },
      ];
      receipts.push(base(date, 'Al Mallah Cafeteria', items, 72, 3.6, '20:40'));
    }
  }
  return receipts;
}

function base(date: string, store: string, items: DraftItem[], subtotal: number, tax: number, time: string): DraftReceipt {
  return {
    store,
    date,
    time,
    subtotal,
    tax,
    discount: null,
    total: round2(subtotal + tax),
    currency: 'AED',
    payment_method: 'card',
    image_uri: null,
    note: SAMPLE_NOTE,
    source: 'manual',
    items,
  };
}
