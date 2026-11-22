// The full scan: photo → text on the phone → AI tidy-up → draft.
// Every path ends in a draft you can edit, unless there is truly no text.
import type { SQLiteDatabase } from 'expo-sqlite';
import { AiError, extractReceipt, hasAiKey, type ExtractionResult } from './ai';
import { knownItems, logScan, type DraftReceipt } from './db';
import { parseRowsLocally } from './localParse';
import { ocrAvailable, readReceiptText } from './ocr';
import type { Settings } from './settings';

export type ScanStage = 'preparing' | 'reading' | 'ai' | 'photo-ai';

export interface ScanOutcome {
  draft: DraftReceipt;
  warnings: string[];
  info: string; // shown on the review screen, e.g. "Read on your phone, tidied by Gemini in 4.2 s"
}

export async function runScan(
  db: SQLiteDatabase,
  settings: Settings,
  image: { uri: string; base64: string },
  onStage: (s: ScanStage) => void,
  signal?: AbortSignal,
): Promise<ScanOutcome> {
  const t0 = Date.now();
  const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
  const known = await knownItems(db);
  const history = new Map(known.map((k) => [k.item_key, k.category]));
  const knownNames = known.slice(0, 80).map((k) => k.name);

  // 1. Read the text on the phone (about a second, works offline).
  let rows: string[] = [];
  if (settings.scanMode !== 'photo' && ocrAvailable) {
    onStage('reading');
    try {
      rows = (await readReceiptText(image.uri)).rows;
    } catch {
      rows = [];
    }
  }
  const enoughText = rows.length >= 3;
  const local = enoughText ? parseRowsLocally(rows, settings.currency, history) : null;

  const finish = async (mode: string, r: ScanOutcome, ok = true, message: string | null = null) => {
    await logScan(db, { mode, ms: Date.now() - t0, ok, items: r.draft.items.length, message }).catch(() => {});
    return r;
  };

  // 2a. Phone-only mode, or no AI key: use the offline result.
  if (local && (settings.scanMode === 'offline' || !hasAiKey(settings))) {
    if (local.draft.items.length) {
      return finish('offline', { ...local, info: `Read on your phone in ${secs()} s` });
    }
  }

  // 2b. Text + AI (fast): the AI only has to tidy up text, not look at a photo.
  if (local && hasAiKey(settings) && settings.scanMode !== 'offline') {
    onStage('ai');
    try {
      const ai = await extractReceipt(settings, { kind: 'text', rows, knownNames }, { timeoutMs: 35000, signal });
      return finish('text+ai', { draft: ai.draft, warnings: ai.warnings, info: `Read on your phone, tidied by ${label(ai)} in ${secs()} s` });
    } catch (e) {
      const why = e instanceof AiError ? e.message : String(e);
      if (signal?.aborted) throw e;
      if (local.draft.items.length) {
        return finish(
          'offline-fallback',
          { ...local, warnings: [`The AI couldn't help this time (${why}), so the receipt was read on your phone instead.`, ...local.warnings], info: `Read on your phone in ${secs()} s` },
          true,
          why,
        );
      }
      // Fall through to the photo, which can work when the text was too messy.
    }
  }

  // 3. Photo + AI (slow fallback): poor text, phone reader unavailable, or "photo" mode.
  if (!hasAiKey(settings)) {
    await logScan(db, { mode: 'none', ms: Date.now() - t0, ok: false, items: 0, message: 'no text and no key' }).catch(() => {});
    throw new AiError(
      ocrAvailable ? "Couldn't find receipt text in that photo." : 'Add your free Gemini key to scan.',
      ocrAvailable ? 'Fill the frame with the receipt, use good light and hold the phone steady. Or add a Gemini key in Settings for tougher receipts.' : 'Open Settings and paste your key.',
    );
  }
  onStage('photo-ai');
  try {
    const ai = await extractReceipt(settings, { kind: 'image', base64: image.base64 }, { signal });
    return finish('photo+ai', { draft: ai.draft, warnings: ai.warnings, info: `Read from the photo by ${label(ai)} in ${secs()} s` });
  } catch (e) {
    await logScan(db, { mode: 'photo+ai', ms: Date.now() - t0, ok: false, items: 0, message: e instanceof Error ? e.message : String(e) }).catch(() => {});
    throw e;
  }
}

function label(r: ExtractionResult) {
  return r.via === 'Gemini' ? 'Gemini' : `${r.model ?? 'AI'} via FreeLLMAPI`;
}
