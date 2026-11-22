// Keeps quantity (or weight), price each (or per kg) and line total in step.
// Fill any two and the third is worked out, e.g. 0.65 kg × 10.00/kg = 6.50.

export interface LineFields {
  qty: string; // pieces, or weight in kg
  unitPrice: string; // price each, or price per kg
  total: string; // line total
}

export type LineField = keyof LineFields;

const num = (s: string) => {
  if (s.trim() === '') return null;
  const n = Number(s.replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function recalcLine<T extends LineFields>(line: T, changed: LineField): T {
  const q = num(line.qty);
  const up = num(line.unitPrice);
  const t = num(line.total);
  const out = { ...line };
  if (changed === 'qty' || changed === 'unitPrice') {
    if (q != null && up != null) out.total = String(r2(q * up));
    else if (changed === 'qty' && q && t != null && up == null) out.unitPrice = String(r2(t / q));
  } else if (changed === 'total' && t != null) {
    if (q == null && up) out.qty = String(r3(t / up)); // know price per kg and total → weight
    else if (q) out.unitPrice = String(r2(t / q));
  }
  return out;
}
