// Wrapper around the app's own native text reader (modules/receipt-ocr).
// requireOptionalNativeModule returns null where the native code isn't
// present (web preview, tests), so the rest of the app falls back gracefully.
import { requireOptionalNativeModule } from 'expo-modules-core';
import { buildRows, type OcrLine } from './rows';

interface ReceiptOcrModule {
  recognize(uri: string): Promise<{ width: number; height: number; lines: OcrLine[] }>;
}

const native = requireOptionalNativeModule<ReceiptOcrModule>('ReceiptOcr');

export const ocrAvailable = native != null;

export async function readReceiptText(uri: string): Promise<{ rows: string[]; lineCount: number }> {
  if (!native) return { rows: [], lineCount: 0 };
  const res = await native.recognize(uri);
  return { rows: buildRows(res.lines ?? []), lineCount: res.lines?.length ?? 0 };
}
