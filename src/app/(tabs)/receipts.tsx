import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import { Button, Card, Empty, H1, Ionicons, Screen, SectionTitle, styles } from '../../components/ui';
import { listReceipts, type Receipt } from '../../lib/db';
import { money, prettyDate } from '../../lib/format';
import { parseISODate } from '../../lib/stats';
import { theme } from '../../lib/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Receipts() {
  const db = useSQLiteContext();
  const [rows, setRows] = useState<(Receipt & { item_count: number })[]>([]);
  const [q, setQ] = useState('');

  useFocusEffect(
    useCallback(() => {
      listReceipts(db).then(setRows);
    }, [db]),
  );

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? rows.filter((r) => (r.store ?? '').toLowerCase().includes(needle) || r.date.includes(needle)) : rows;
    const map = new Map<string, { label: string; total: number; rows: typeof rows }>();
    for (const r of filtered) {
      const d = parseISODate(r.date);
      const k = r.date.slice(0, 7);
      const g = map.get(k) ?? { label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, total: 0, rows: [] };
      g.total += r.total;
      g.rows.push(r);
      map.set(k, g);
    }
    return [...map.values()];
  }, [rows, q]);

  if (!rows.length) {
    return (
      <Screen>
        <H1>Receipts</H1>
        <Empty
          icon="receipt-outline"
          title="No receipts yet"
          text="Receipts you scan or enter show up here, grouped by month."
          action={<Button title="Scan a receipt" icon="scan" onPress={() => router.navigate('/scan')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1 sub={`${rows.length} saved`}>Receipts</H1>
      <View style={[styles.input, styles.row, { gap: 8, paddingVertical: 4 }]}>
        <Ionicons name="search" size={18} color={theme.inkFaint} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search by store or date" placeholderTextColor={theme.inkFaint} style={{ flex: 1, color: theme.ink, paddingVertical: 8 }} />
      </View>
      {groups.map((g) => (
        <View key={g.label}>
          <SectionTitle right={<Text style={[styles.muted, { fontWeight: '700' }]}>{money(g.total, g.rows[0].currency)}</Text>}>{g.label}</SectionTitle>
          {g.rows.map((r) => (
            <Card key={r.id} onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: String(r.id) } })} style={[styles.row, { gap: 12 }]}>
              {r.image_uri ? (
                <Image source={{ uri: r.image_uri }} style={{ width: 42, height: 56, borderRadius: 6, backgroundColor: theme.cardAlt }} />
              ) : (
                <View style={{ width: 42, height: 56, borderRadius: 6, backgroundColor: theme.cardAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="create-outline" size={18} color={theme.inkFaint} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.body, { fontWeight: '700' }]} numberOfLines={1}>{r.store || 'Unknown store'}</Text>
                <Text style={styles.muted}>
                  {prettyDate(r.date, true)}
                  {r.time ? ` · ${r.time}` : ''} · {r.item_count} items
                </Text>
              </View>
              <Text style={[styles.body, { fontWeight: '800' }]}>{money(r.total, r.currency)}</Text>
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}
