// "Paste receipt": accepts either
//  1. a ready answer from your AI app (Gemini / ChatGPT / Claude), made with the
//     prompt TillTrack copies for you — imported exactly, or
//  2. plain text copied from Google Lens or any text-reading app — arranged by
//     TillTrack (and tidied by your AI key in the background, if you have one).
import { buildPrompt, parseReceiptJson } from './ai';
import type { DraftReceipt } from './db';
import { toISODate } from './stats';

export function promptForOtherApp(currency: string, today: string = toISODate(new Date())): string {
  return (
    buildPrompt(currency, today) +
    '\n\nI am attaching a photo of the receipt. Reply with the JSON only, in one code block, so I can copy it into my receipt app.'
  );
}

export type PasteResult =
  | { kind: 'ready'; draft: DraftReceipt; warnings: string[] }
  | { kind: 'text'; rows: string[] }
  | { kind: 'empty' };

export function interpretPaste(text: string, currency: string, today: string = toISODate(new Date())): PasteResult {
  const t = text.trim();
  if (!t) return { kind: 'empty' };
  // Looks like the ready format (JSON with an items list)?
  if (/"items"\s*:/.test(t) && t.includes('{')) {
    try {
      const { draft, warnings } = parseReceiptJson(t, currency, today);
      return { kind: 'ready', draft: { ...draft, source: 'scan' }, warnings };
    } catch {
      // Not valid after all; treat it as plain text below.
    }
  }
  const rows = t
    .replace(/\r/g, '')
    .split('\n')
    .map((r) => r.replace(/\t+/g, '    ').trimEnd())
    .filter((r) => r.trim() && !/^```/.test(r.trim()));
  return { kind: 'text', rows };
}
