// Picks a category for an item name with no AI involved.
// 1. If you've bought this item before, reuse its category.
// 2. Otherwise match keywords in the name.
import type { Category } from './categories';
import { normalizeKey } from './stats';

const RULES: [RegExp, Category][] = [
  // Drinks first, so "mango juice" is a drink, not a fruit.
  [/\b(water|juice|soda|cola|pepsi|coke|7up|sprite|coffee|nescafe|tea|lipton|drink|energy|red bull|laban up)(s|es)?\b/, 'Beverages'],
  [/\b(milk|laban|leben|yog(h)?urt|cheese|labneh|butter|cream|egg|eggs|ghee)(s|es)?\b/, 'Dairy & Eggs'],
  [/\b(chicken|beef|mutton|lamb|meat|mince|fish|salmon|tuna|shrimp|prawn|sausage|kebab|fillet|hammour)(s|es)?\b/, 'Meat & Seafood'],
  [/\b(banana|apple|orange|tomato(es)?|potato(es)?|onion|cucumber|carrot|lettuce|lemon|grape|mango|melon|veg|fruit|garlic|ginger|pepper|capsicum|spinach|coriander|parsley|mint|avocado|berr(y|ies))(s|es)?\b/, 'Fruits & Vegetables'],
  [/\b(bread|bun|croissant|cake|muffin|toast|khubz|samoon|baguette|pastry|donut)(s|es)?\b/, 'Bakery'],
  [/\b(chips|lays|pringles|chocolate|choco|candy|biscuit|cookie|wafer|kitkat|snickers|galaxy|nuts|popcorn|ice cream)(s|es)?\b/, 'Snacks & Sweets'],
  [/\b(frozen|nuggets|fries)(s|es)?\b/, 'Frozen'],
  [/\b(detergent|tide|ariel|persil|fairy|dish|bleach|clorox|tissue|kleenex|foil|cling|garbage|bin bag|cleaner|sponge|softener|downy)(s|es)?\b/, 'Household & Cleaning'],
  [/\b(shampoo|soap|toothpaste|colgate|toothbrush|deodorant|lotion|razor|gillette|sanitary|pads|dove|nivea|conditioner)(s|es)?\b/, 'Personal Care'],
  [/\b(panadol|paracetamol|vitamin|tablet|syrup|bandage|plaster|pharmacy|medicine|capsule)(s|es)?\b/, 'Health & Pharmacy'],
  [/\b(diaper|pampers|baby|wipes|formula|huggies)(s|es)?\b/, 'Baby & Kids'],
  [/\b(cat|dog|pet|whiskas|pedigree|litter)(s|es)?\b/, 'Pet'],
  [/\b(charger|cable|battery|batteries|earphone|headphone|usb|adapter)(s|es)?\b/, 'Electronics'],
  [/\b(shirt|t-shirt|pants|socks|shoes|dress|jeans)(s|es)?\b/, 'Clothing'],
  [/\b(petrol|diesel|fuel|special 95|super 98|e-plus|parking|salik|taxi)(s|es)?\b/, 'Fuel & Transport'],
  [/\b(shawarma|burger|pizza|meal|combo|sandwich|karak|latte|cappuccino)(s|es)?\b/, 'Dining Out'],
  [/\b(rice|basmati|flour|atta|sugar|salt|oil|pasta|spaghetti|noodles|indomie|lentil|dal|beans|chickpeas|sauce|ketchup|mayo|spice|masala|honey|jam|cereal|oats|tomato paste|canned)(s|es)?\b/, 'Groceries'],
];

export function guessCategory(name: string, history: Map<string, string> = new Map()): Category {
  const prev = history.get(normalizeKey(name));
  if (prev) return prev as Category;
  const s = name.toLowerCase();
  for (const [re, cat] of RULES) if (re.test(s)) return cat;
  return 'Groceries';
}
