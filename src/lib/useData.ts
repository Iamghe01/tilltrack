import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { allItemRows, allReceiptRows, typeOverrides } from './db';
import { itemType } from './itemTypes';
import { DEFAULT_SETTINGS, loadSettings, type Settings } from './settings';
import type { ItemRow, ReceiptRow } from './stats';

/** Reloads every time the screen comes into focus, so the tabs stay in sync after a scan or an edit. */
export function useAllData() {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ receipts: ReceiptRow[]; items: ItemRow[]; settings: Settings; overrides: Map<string, string>; loaded: boolean }>({
    receipts: [],
    items: [],
    settings: DEFAULT_SETTINGS,
    overrides: new Map(),
    loaded: false,
  });

  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const [receipts, items, settings, overrides] = await Promise.all([allReceiptRows(db), allItemRows(db), loadSettings(db), typeOverrides(db)]);
        if (alive) setState({ receipts, items, settings, overrides, loaded: true });
      })();
      return () => {
        alive = false;
      };
    }, [db, tick]),
  );

  const typeOf = useCallback((name: string, category: string) => itemType(name, category, state.overrides), [state.overrides]);
  return { ...state, reload, typeOf };
}
