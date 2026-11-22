import { router } from 'expo-router';
import type { SQLiteDatabase } from 'expo-sqlite';
import { setPendingDraft } from './draft';
import { loadSettings } from './settings';
import { toISODate } from './stats';

/** Opens an empty "Add purchase" screen. */
export async function startManual(db: SQLiteDatabase) {
  const settings = await loadSettings(db);
  setPendingDraft({
    vat_included: settings.pricesIncludeVat !== 0,
    store: null,
    date: toISODate(new Date()),
    time: null,
    subtotal: null,
    tax: null,
    discount: null,
    total: 0,
    currency: settings.currency,
    payment_method: null,
    image_uri: null,
    note: null,
    source: 'manual',
    items: [],
  });
  router.push({ pathname: '/receipt/[id]', params: { id: 'new' } });
}
