// Hands a freshly scanned receipt from the Scan tab to the review screen.
import type { DraftReceipt } from './db';

let pending: { draft: DraftReceipt; warnings: string[]; modelInfo: string | null } | null = null;

export function setPendingDraft(draft: DraftReceipt, warnings: string[] = [], modelInfo: string | null = null) {
  pending = { draft, warnings, modelInfo };
}

export function takePendingDraft() {
  const p = pending;
  pending = null;
  return p;
}
