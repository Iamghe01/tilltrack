// Fixed category list. The AI is told to pick from exactly these names,
// so the charts stay consistent from receipt to receipt.
export const CATEGORIES = [
  'Groceries',
  'Fruits & Vegetables',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Bakery',
  'Beverages',
  'Snacks & Sweets',
  'Frozen',
  'Household & Cleaning',
  'Personal Care',
  'Health & Pharmacy',
  'Baby & Kids',
  'Pet',
  'Electronics',
  'Clothing',
  'Dining Out',
  'Fuel & Transport',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

// Warm palette that sits well on the cream background.
const COLORS: Record<string, string> = {
  Groceries: '#C8342B',
  'Fruits & Vegetables': '#5E8C3A',
  'Meat & Seafood': '#A0522D',
  'Dairy & Eggs': '#D9A441',
  Bakery: '#B9773F',
  Beverages: '#3F7CAC',
  'Snacks & Sweets': '#D8667A',
  Frozen: '#6FA8C9',
  'Household & Cleaning': '#7A6FAE',
  'Personal Care': '#B76BA3',
  'Health & Pharmacy': '#2E9C8A',
  'Baby & Kids': '#E39A5B',
  Pet: '#8C7B5E',
  Electronics: '#4A5568',
  Clothing: '#9B4F6E',
  'Dining Out': '#E0613A',
  'Fuel & Transport': '#55606E',
  Other: '#9A8F80',
};

export function categoryColor(name: string): string {
  return COLORS[name] ?? COLORS.Other;
}

export function normalizeCategory(raw: unknown): Category {
  if (typeof raw !== 'string') return 'Other';
  const s = raw.trim().toLowerCase();
  const exact = CATEGORIES.find((c) => c.toLowerCase() === s);
  if (exact) return exact;
  // Loose matching for near-misses like "Produce" or "Drinks".
  const aliases: [RegExp, Category][] = [
    [/produce|fruit|vegetable|veg/, 'Fruits & Vegetables'],
    [/meat|chicken|beef|fish|seafood|poultry/, 'Meat & Seafood'],
    [/dairy|milk|egg|cheese|yogh?urt/, 'Dairy & Eggs'],
    [/bread|bakery|pastr/, 'Bakery'],
    [/drink|beverage|juice|water|soda|coffee|tea/, 'Beverages'],
    [/snack|sweet|candy|chocolate|chips/, 'Snacks & Sweets'],
    [/frozen/, 'Frozen'],
    [/household|clean|detergent|kitchen|home/, 'Household & Cleaning'],
    [/personal|beauty|cosmetic|toiletr|hygiene/, 'Personal Care'],
    [/health|pharm|medic|vitamin/, 'Health & Pharmacy'],
    [/baby|kid|diaper|toy/, 'Baby & Kids'],
    [/pet|cat|dog/, 'Pet'],
    [/electr|phone|cable|battery/, 'Electronics'],
    [/cloth|apparel|shoe|fashion/, 'Clothing'],
    [/restaurant|dining|cafe|food court|takeaway/, 'Dining Out'],
    [/fuel|petrol|gas|transport|taxi|parking/, 'Fuel & Transport'],
    [/grocer|pantry|rice|pasta|oil|spice|canned/, 'Groceries'],
  ];
  for (const [re, cat] of aliases) if (re.test(s)) return cat;
  return 'Other';
}
