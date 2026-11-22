// Rebuild receipt rows from on-device OCR lines.
// ML Kit often returns the item name and its price as separate lines (left and
// right columns). Grouping lines by their vertical position puts them back on
// one row, e.g. "ALMARAI MILK 1L        6.50".

export interface OcrLine {
  text: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function buildRows(lines: OcrLine[]): string[] {
  const clean = lines.filter((l) => l.text.trim() && l.bottom > l.top);
  if (!clean.length) return [];

  const heights = clean.map((l) => l.bottom - l.top).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 10;

  // Correct gentle tilt: estimate the slope from pairs of lines that share a row.
  const slope = estimateSlope(clean, medianH);
  const centre = (l: OcrLine) => (l.top + l.bottom) / 2 - slope * ((l.left + l.right) / 2);

  const sorted = [...clean].sort((a, b) => centre(a) - centre(b));
  const rows: { y: number; items: OcrLine[] }[] = [];
  for (const l of sorted) {
    const y = centre(l);
    const row = rows[rows.length - 1];
    if (row && Math.abs(y - row.y) <= medianH * 0.55) {
      row.items.push(l);
      row.y = (row.y * (row.items.length - 1) + y) / row.items.length;
    } else {
      rows.push({ y, items: [l] });
    }
  }

  return rows.map((r) => {
    const items = r.items.sort((a, b) => a.left - b.left);
    let out = items[0].text.trim();
    for (let i = 1; i < items.length; i++) {
      const gap = items[i].left - items[i - 1].right;
      out += gap > medianH * 1.5 ? '    ' : ' ';
      out += items[i].text.trim();
    }
    return out;
  });
}

function estimateSlope(lines: OcrLine[], medianH: number): number {
  const slopes: number[] = [];
  const byLeft = [...lines].sort((a, b) => a.left - b.left);
  for (const a of byLeft) {
    for (const b of byLeft) {
      if (b.left <= a.right) continue;
      const dx = (b.left + b.right) / 2 - (a.left + a.right) / 2;
      const dy = (b.top + b.bottom) / 2 - (a.top + a.bottom) / 2;
      if (dx > 0 && Math.abs(dy) < medianH * 1.2) slopes.push(dy / dx);
    }
    if (slopes.length > 200) break;
  }
  if (slopes.length < 3) return 0;
  slopes.sort((x, y) => x - y);
  const s = slopes[Math.floor(slopes.length / 2)];
  return Math.abs(s) < 0.15 ? s : 0;
}
