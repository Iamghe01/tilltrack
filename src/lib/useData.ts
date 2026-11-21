import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { allItemRows, allReceiptRows } from './db';
import { DEFAULT_SETTINGS, loadSettings, type Settings } from './settings';
import type { ItemRow, ReceiptRow } from './stats';

/** Reloads every time the screen comes into focus, so the tabs stay in sync after a scan or an edit. */
export function useAllData() {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ receipts: ReceiptRow[]; items: ItemRow[]; settings: Settings; loaded: boolean }>({
    receipts: [],
    items: [],
    settings: DEFAULT_SETTINGS,
    loaded: false,
  });

  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const [receipts, items, settings] = await Promise.all([allReceiptRows(db), allItemRows(db), loadSettings(db)]);
        if (alive) setState({ receipts, items, settings, loaded: true });
      })();
      return () => {
        alive = false;
      };
    }, [db, tick]),
  );

  return { ...state, reload };
}
