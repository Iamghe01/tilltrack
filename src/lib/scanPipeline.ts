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
  /** When set, the AI is still checking in the background; the review screen shows its result when it arrives. */
  background?: Promise<BackgroundCheck>;
}

export type BackgroundCheck =
  | { ok: true; draft: DraftReceipt; warnings: string[]; info: string }
  | { ok: false; reason: string };

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

  // 2b. Text + AI: open the phone result straight away, and let the AI check it
  // in the background. You never wait for the AI when the phone could read it.
  if (local && hasAiKey(settings) && settings.scanMode !== 'offline') {
    if (local.draft.items.length) {
      const phoneSecs = secs();
      const background: Promise<BackgroundCheck> = extractReceipt(settings, { kind: 'text', rows, knownNames }, { timeoutMs: 45000 })
        .then(async (ai) => {
          await logScan(db, { mode: 'text+ai', ms: Date.now() - t0, ok: true, items: ai.draft.items.length }).catch(() => {});
          return { ok: true as const, draft: ai.draft, warnings: ai.warnings, info: `Checked by ${label(ai)} in ${secs()} s` };
        })
        .catch(async (e) => {
          const why = e instanceof AiError ? e.message : String(e);
          await logScan(db, { mode: 'offline-fallback', ms: Date.now() - t0, ok: true, items: local.draft.items.length, message: why }).catch(() => {});
          return { ok: false as const, reason: why };
        });
      return {
        draft: local.draft,
        warnings: local.warnings.filter((w) => !w.startsWith('Read offline')),
        info: `Read on your phone in ${phoneSecs} s`,
        background,
      };
    }
    // The phone found text but no items: ask the AI and wait (usually a few seconds).
    onStage('ai');
    try {
      const ai = await extractReceipt(settings, { kind: 'text', rows, knownNames }, { timeoutMs: 35000, signal });
      if (ai.draft.items.length) {
        return finish('text+ai', { draft: ai.draft, warnings: ai.warnings, info: `Read on your phone, tidied by ${label(ai)} in ${secs()} s` });
      }
    } catch (e) {
      if (signal?.aborted) throw e;
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
