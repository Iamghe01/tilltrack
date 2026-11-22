// Hands a freshly scanned receipt from the Scan tab to the review screen.
import type { DraftReceipt } from './db';
import type { BackgroundCheck } from './scanPipeline';

export interface PendingDraft {
  draft: DraftReceipt;
  warnings: string[];
  modelInfo: string | null;
  background?: Promise<BackgroundCheck>;
}

let pending: PendingDraft | null = null;

export function setPendingDraft(draft: DraftReceipt, warnings: string[] = [], modelInfo: string | null = null, background?: Promise<BackgroundCheck>) {
  pending = { draft, warnings, modelInfo, background };
}

export function takePendingDraft() {
  const p = pending;
  pending = null;
  return p;
}
