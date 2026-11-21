import type { SQLiteDatabase } from 'expo-sqlite';
import { normalizeKey, round2, type ItemRow, type ReceiptRow } from './stats';

export const DB_NAME = 'tilltrack.db';

export interface Receipt {
  id: number;
  store: string | null;
  date: string; // YYYY-MM-DD
  time: string | null; // HH:MM
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  total: number;
  currency: string;
  payment_method: string | null;
  image_uri: string | null;
  note: string | null;
  source: 'scan' | 'manual';
  created_at: string;
}

export interface ReceiptItem {
  id: number;
  receipt_id: number;
  name: string;
  item_key: string;
  category: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  total_price: number;
}

/** Item before it is saved (from the AI or from the editor). */
export interface DraftItem {
  name: string;
  category: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  total_price: number;
}

export interface DraftReceipt {
  store: string | null;
  date: string;
  time: string | null;
  subtotal: number | null;
  tax: number | null;
  discount: number | null;
  total: number;
  currency: string;
  payment_method: string | null;
  image_uri: string | null;
  note: string | null;
  source: 'scan' | 'manual';
  items: DraftItem[];
}

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store TEXT,
      date TEXT NOT NULL,
      time TEXT,
      subtotal REAL,
      tax REAL,
      discount REAL,
      total REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'AED',
      payment_method TEXT,
      image_uri TEXT,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'scan',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      item_key TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT,
      unit_price REAL,
      total_price REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
    CREATE INDEX IF NOT EXISTS idx_items_key ON items(item_key);
    CREATE INDEX IF NOT EXISTS idx_items_receipt ON items(receipt_id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

// ---------- receipts ----------

export async function saveReceipt(db: SQLiteDatabase, draft: DraftReceipt, existingId?: number): Promise<number> {
  let id = existingId ?? 0;
  await db.withTransactionAsync(async () => {
    const vals = [
      draft.store?.trim() || null,
      draft.date,
      draft.time,
      draft.subtotal,
      draft.tax,
      draft.discount,
      round2(draft.total),
      draft.currency,
      draft.payment_method,
      draft.image_uri,
      draft.note,
    ];
    if (existingId) {
      await db.runAsync(
        `UPDATE receipts SET store=?, date=?, time=?, subtotal=?, tax=?, discount=?, total=?, currency=?,
         payment_method=?, image_uri=?, note=? WHERE id=?`,
        [...vals, existingId],
      );
      await db.runAsync('DELETE FROM items WHERE receipt_id=?', [existingId]);
    } else {
      const res = await db.runAsync(
        `INSERT INTO receipts (store, date, time, subtotal, tax, discount, total, currency, payment_method,
         image_uri, note, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [...vals, draft.source],
      );
      id = res.lastInsertRowId;
    }
    for (const it of draft.items) {
      const name = it.name.trim();
      if (!name) continue;
      await db.runAsync(
        `INSERT INTO items (receipt_id, name, item_key, category, quantity, unit, unit_price, total_price)
         VALUES (?,?,?,?,?,?,?,?)`,
        [id, name, normalizeKey(name), it.category, it.quantity, it.unit, it.unit_price, round2(it.total_price)],
      );
    }
  });
  return id;
}

export async function deleteReceipt(db: SQLiteDatabase, id: number) {
  await db.runAsync('DELETE FROM receipts WHERE id=?', [id]);
}

export async function getReceipt(db: SQLiteDatabase, id: number) {
  const receipt = await db.getFirstAsync<Receipt>('SELECT * FROM receipts WHERE id=?', [id]);
  if (!receipt) return null;
  const items = await db.getAllAsync<ReceiptItem>('SELECT * FROM items WHERE receipt_id=? ORDER BY id', [id]);
  return { receipt, items };
}

export async function listReceipts(db: SQLiteDatabase) {
  return db.getAllAsync<Receipt & { item_count: number }>(
    `SELECT r.*, (SELECT COUNT(*) FROM items i WHERE i.receipt_id=r.id) AS item_count
     FROM receipts r ORDER BY r.date DESC, r.id DESC`,
  );
}

/** Look for a receipt that is probably the same one scanned twice. */
export async function findDuplicate(db: SQLiteDatabase, draft: DraftReceipt) {
  return db.getFirstAsync<Receipt>(
    `SELECT * FROM receipts WHERE date=? AND ABS(total-?) < 0.01 AND IFNULL(LOWER(store),'')=IFNULL(LOWER(?),'') LIMIT 1`,
    [draft.date, draft.total, draft.store?.trim() || null],
  );
}

// ---------- rows for statistics ----------

export async function allReceiptRows(db: SQLiteDatabase): Promise<ReceiptRow[]> {
  return db.getAllAsync<ReceiptRow>('SELECT id, store, date, total FROM receipts');
}

export async function allItemRows(db: SQLiteDatabase): Promise<ItemRow[]> {
  return db.getAllAsync<ItemRow>(
    `SELECT i.id, i.receipt_id, i.name, i.item_key, i.category, i.quantity, i.unit, i.unit_price, i.total_price,
            r.date, r.store
     FROM items i JOIN receipts r ON r.id = i.receipt_id`,
  );
}

export async function renameItemKey(db: SQLiteDatabase, fromKey: string, newName: string) {
  const name = newName.trim();
  if (!name) return;
  await db.runAsync('UPDATE items SET name=?, item_key=? WHERE item_key=?', [name, normalizeKey(name), fromKey]);
}

export async function setItemKeyCategory(db: SQLiteDatabase, key: string, category: string) {
  await db.runAsync('UPDATE items SET category=? WHERE item_key=?', [category, key]);
}

export async function clearAll(db: SQLiteDatabase) {
  await db.execAsync('DELETE FROM items; DELETE FROM receipts;');
}

// ---------- CSV ----------

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportCsv(db: SQLiteDatabase): Promise<string> {
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT r.date, r.time, r.store, i.name AS item, i.category, i.quantity, i.unit, i.unit_price, i.total_price,
            r.total AS receipt_total, r.tax AS receipt_tax, r.currency, r.payment_method, r.id AS receipt_id
     FROM items i JOIN receipts r ON r.id=i.receipt_id ORDER BY r.date, r.id, i.id`,
  );
  const header = [
    'date', 'time', 'store', 'item', 'category', 'quantity', 'unit', 'unit_price', 'total_price',
    'receipt_total', 'receipt_tax', 'currency', 'payment_method', 'receipt_id',
  ];
  return [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n');
}

// ---------- sample data ----------

export async function loadSampleData(db: SQLiteDatabase, receipts: DraftReceipt[]) {
  for (const r of receipts) await saveReceipt(db, r);
}

export async function removeSampleData(db: SQLiteDatabase, note: string) {
  await db.runAsync('DELETE FROM receipts WHERE note = ?', [note]);
}

export async function countSampleReceipts(db: SQLiteDatabase, note: string) {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM receipts WHERE note = ?', [note]);
  return r?.n ?? 0;
}
