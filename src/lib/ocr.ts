// Wrapper around the app's own native module (modules/receipt-ocr):
// Google's document scanner screen + on-device text reading.
// requireOptionalNativeModule returns null where the native code isn't
// present (web preview, tests), so the rest of the app falls back gracefully.
import { requireOptionalNativeModule } from 'expo-modules-core';
import { buildRows, type OcrLine } from './rows';

interface ReceiptOcrModule {
  recognize(uri: string): Promise<{ width: number; height: number; lines: OcrLine[] }>;
  scanDocument(pageLimit: number, allowGallery: boolean): Promise<string[]>;
}

const native = requireOptionalNativeModule<ReceiptOcrModule>('ReceiptOcr');

export const ocrAvailable = native != null;
export const docScannerAvailable = native != null && typeof native.scanDocument === 'function';

/** Opens Google's document scanner. Returns the scanned page images, or [] if you cancelled. */
export async function scanDocument(pageLimit = 3): Promise<string[]> {
  if (!native) return [];
  return native.scanDocument(pageLimit, true);
}

export async function readReceiptText(uri: string): Promise<{ rows: string[]; lineCount: number }> {
  if (!native) return { rows: [], lineCount: 0 };
  const res = await native.recognize(uri);
  return { rows: buildRows(res.lines ?? []), lineCount: res.lines?.length ?? 0 };
}

/** Reads several pages (a long receipt scanned in parts) and joins them in order. */
export async function readPages(uris: string[]): Promise<string[]> {
  const all: string[] = [];
  for (const u of uris) all.push(...(await readReceiptText(u)).rows);
  return all;
}
