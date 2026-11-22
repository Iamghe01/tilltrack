import type { SQLiteDatabase } from 'expo-sqlite';

export type Provider = 'gemini' | 'freellmapi';
/** auto: read text on the phone, AI tidies it up. offline: phone only. photo: send the whole photo to the AI. */
export type ScanMode = 'auto' | 'offline' | 'photo';

export interface Settings {
  provider: Provider; // which AI reads the receipts
  scanMode: ScanMode;
  geminiKey: string; // Google AI Studio key, used when provider = gemini
  geminiModel: string; // "gemini-flash-latest" always points at the current Flash model
  baseUrl: string; // FreeLLMAPI base, e.g. http://192.168.1.20:3001/v1
  apiKey: string; // freellmapi-... unified key
  model: string; // "auto" lets the router pick a vision model
  currency: string;
  monthlyBudget: number; // 0 = no budget
  vatRate: number; // percent, 5 in the UAE
  pricesIncludeVat: number; // 1 = shelf prices already include VAT (UAE norm), 0 = VAT added at the till
  weekStartsOn: number; // 0 Sun, 1 Mon, 6 Sat
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'gemini',
  scanMode: 'auto',
  geminiKey: '',
  geminiModel: 'gemini-flash-latest',
  baseUrl: 'http://192.168.1.100:3001/v1',
  apiKey: '',
  model: 'auto',
  currency: 'AED',
  monthlyBudget: 0,
  vatRate: 5,
  pricesIncludeVat: 1,
  weekStartsOn: 1,
};

export async function loadSettings(db: SQLiteDatabase): Promise<Settings> {
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (!(key in s)) continue;
    const k = key as keyof Settings;
    if (typeof DEFAULT_SETTINGS[k] === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) (s as unknown as Record<string, unknown>)[k] = n;
    } else {
      (s as unknown as Record<string, unknown>)[k] = value;
    }
  }
  return s;
}

export async function saveSettings(db: SQLiteDatabase, s: Settings) {
  await db.withTransactionAsync(async () => {
    for (const [k, v] of Object.entries(s)) {
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [k, String(v)]);
    }
  });
}
