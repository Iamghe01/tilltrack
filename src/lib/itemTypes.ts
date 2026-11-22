// Types inside each category, e.g. Meat & Seafood → Chicken, Beef, Pork, Fish…
// Worked out from the item name; you can change any item's type in the app
// (saved as an override for that product).
import { normalizeKey } from './stats';

type Rule = [string, RegExp];

const RULES: Record<string, Rule[]> = {
  'Meat & Seafood': [
    ['Chicken', /chicken|poultry|wings?|drumstick|thigh|breast fillet/],
    ['Beef', /beef|steak|veal|brisket|burger patt/],
    ['Lamb & Mutton', /lamb|mutton|goat/],
    ['Pork', /pork|bacon|ham\b|pepperoni|salami/],
    ['Fish', /fish|salmon|tuna|hammour|sardine|tilapia|cod|hamour|kingfish|sea ?bream|mackerel/],
    ['Seafood', /shrimp|prawn|crab|lobster|squid|calamari|mussel|clam|oyster|octopus|seafood/],
    ['Mince', /mince|minced|kheema|keema/],
    ['Sausages & Deli', /sausage|hot ?dog|deli|mortadella|luncheon|turkey slice/],
  ],
  'Dairy & Eggs': [
    ['Milk', /milk|laban|leben/],
    ['Yoghurt', /yog(h)?urt|labneh|curd/],
    ['Cheese', /cheese|cheddar|mozzarella|feta|halloumi|parmesan/],
    ['Eggs', /eggs?\b/],
    ['Butter & Ghee', /butter|ghee|margarine/],
    ['Cream', /cream(?! cheese)/],
  ],
  'Fruits & Vegetables': [
    ['Bananas', /banana/],
    ['Apples', /apple/],
    ['Citrus', /orange|lemon|lime|mandarin|grapefruit|tangerine/],
    ['Berries & Grapes', /berr|grape/],
    ['Melons', /melon|watermelon/],
    ['Mangoes', /mango/],
    ['Other fruit', /pear|kiwi|pineapple|papaya|pomegranate|date|fig|peach|plum|avocado|guava/],
    ['Tomatoes', /tomato/],
    ['Potatoes & Onions', /potato|onion|garlic|sweet potato/],
    ['Leafy greens & herbs', /lettuce|spinach|cabbage|kale|coriander|parsley|mint|herb|rocket|dill/],
    ['Other vegetables', /cucumber|carrot|pepper|capsicum|zucchini|eggplant|aubergine|broccoli|cauliflower|beans|okra|corn|mushroom|ginger|chilli|veg/],
  ],
  Bakery: [
    ['Bread', /bread|khubz|samoon|toast|baguette|loaf|bun|roll|pita|tortilla|paratha/],
    ['Cakes & Pastries', /cake|croissant|muffin|pastr|donut|danish|cookie/],
  ],
  Beverages: [
    ['Water', /water/],
    ['Juice', /juice|nectar/],
    ['Soft drinks', /cola|coke|pepsi|7up|sprite|fanta|mirinda|soda|soft drink/],
    ['Coffee', /coffee|nescafe|espresso|latte|cappuccino/],
    ['Tea', /\btea\b|lipton|karak/],
    ['Energy & sports', /energy|red bull|monster|gatorade|isotonic/],
    ['Milk drinks', /laban up|milkshake|flavou?red milk/],
  ],
  'Snacks & Sweets': [
    ['Chips', /chips|crisps|lays|pringles|doritos|cheetos/],
    ['Chocolate', /chocolate|choco|kitkat|snickers|galaxy|twix|mars|cadbury|nutella/],
    ['Biscuits', /biscuit|cookie|wafer|cracker|oreo/],
    ['Nuts & dried fruit', /nut|almond|cashew|pistachio|peanut|raisin|dried/],
    ['Ice cream', /ice ?cream/],
    ['Sweets', /candy|sweet|gum|toffee|halwa/],
  ],
  Groceries: [
    ['Rice', /rice|basmati/],
    ['Pasta & noodles', /pasta|spaghetti|macaroni|noodle|indomie|vermicelli/],
    ['Flour & baking', /flour|atta|maida|yeast|baking/],
    ['Oil', /\boil\b|olive|sunflower|corn oil/],
    ['Sugar, salt & spices', /sugar|salt|spice|masala|pepper|cumin|turmeric|chilli powder/],
    ['Sauces & spreads', /sauce|ketchup|mayo|mustard|paste|jam|honey|spread|hummus|tahini/],
    ['Canned & jars', /can(ned)?\b|tin\b|beans|chickpea|corn|tuna can/],
    ['Breakfast', /cereal|oats|cornflakes|granola|muesli/],
    ['Lentils & pulses', /lentil|dal|daal|pulses|moong|chana/],
  ],
  Frozen: [
    ['Frozen meat & fish', /chicken|nugget|fish|shrimp|meat|burger/],
    ['Frozen vegetables', /veg|peas|corn|fries|potato/],
    ['Frozen meals', /pizza|meal|samosa|paratha|spring roll/],
  ],
  'Household & Cleaning': [
    ['Laundry', /detergent|tide|ariel|persil|softener|downy|comfort|laundry/],
    ['Dishwashing', /dish|fairy|finish/],
    ['Cleaners', /clean|bleach|clorox|dettol|harpic|disinfect|wipes/],
    ['Paper & tissue', /tissue|kleenex|towel|toilet roll|napkin/],
    ['Bags, foil & wrap', /bag|foil|cling|wrap/],
  ],
  'Personal Care': [
    ['Hair', /shampoo|conditioner|hair/],
    ['Body & soap', /soap|shower|body wash|lotion|cream/],
    ['Oral care', /tooth|colgate|mouthwash|floss/],
    ['Shaving & deodorant', /razor|gillette|shav|deodorant|deo\b/],
    ['Feminine care', /pads|sanitary|tampon/],
  ],
  'Health & Pharmacy': [
    ['Medicine', /panadol|paracetamol|tablet|syrup|capsule|medicine|ibuprofen/],
    ['Vitamins', /vitamin|supplement|omega/],
    ['First aid', /bandage|plaster|antiseptic/],
  ],
  'Baby & Kids': [
    ['Diapers & wipes', /diaper|pampers|huggies|wipes/],
    ['Baby food & formula', /formula|baby food|cerelac/],
    ['Toys', /toy/],
  ],
  Pet: [
    ['Cat', /cat|whiskas|litter/],
    ['Dog', /dog|pedigree/],
  ],
  'Fuel & Transport': [
    ['Petrol', /petrol|special 95|super 98|e-plus|91|diesel|fuel/],
    ['Parking & tolls', /parking|salik|toll/],
    ['Taxi & transport', /taxi|careem|uber|metro|bus|nol/],
  ],
  'Dining Out': [
    ['Meals', /shawarma|burger|pizza|meal|combo|sandwich|biryani|plate|rice/],
    ['Drinks & coffee', /coffee|latte|cappuccino|karak|juice|tea|shake/],
    ['Desserts', /cake|ice cream|dessert|kunafa/],
  ],
  Electronics: [
    ['Cables & chargers', /cable|charger|adapter|usb/],
    ['Batteries', /batter/],
    ['Audio', /earphone|headphone|speaker|buds/],
  ],
  Clothing: [
    ['Clothes', /shirt|pants|jeans|dress|abaya|kandura|top/],
    ['Shoes', /shoe|sandal|slipper|sneaker/],
  ],
};

export function typesFor(category: string): string[] {
  return [...(RULES[category]?.map(([t]) => t) ?? []), 'Other'];
}

export function itemType(name: string, category: string, overrides?: Map<string, string>): string {
  const key = normalizeKey(name);
  const o = overrides?.get(key);
  if (o) return o;
  const s = name.toLowerCase();
  for (const [t, re] of RULES[category] ?? []) if (re.test(s)) return t;
  return 'Other';
}
