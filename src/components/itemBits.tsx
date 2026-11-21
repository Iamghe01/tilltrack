import type { ItemSummary, RebuyStatus } from '../lib/stats';
import { theme } from '../lib/theme';
import { Pill } from './ui';

export function statusPill(s: RebuyStatus) {
  switch (s) {
    case 'overdue':
      return <Pill text="Overdue" color={theme.accent} bg={theme.accentSoft} />;
    case 'due':
      return <Pill text="Due now" color={theme.accent} bg={theme.accentSoft} />;
    case 'soon':
      return <Pill text="Soon" color={theme.warn} bg={theme.warnSoft} />;
    case 'ok':
      return <Pill text="Stocked" color={theme.good} bg={theme.goodSoft} />;
    default:
      return <Pill text="Bought once" />;
  }
}

/** Change from the previous purchase price to the latest one. */
export function priceTrend(s: ItemSummary) {
  if (s.lastPrice == null || s.previousPrice == null || s.previousPrice === 0) return null;
  const pct = ((s.lastPrice - s.previousPrice) / s.previousPrice) * 100;
  if (Math.abs(pct) < 1) return null;
  return { pct, up: pct > 0 };
}
