import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { priceTrend, statusPill } from '../../components/itemBits';
import { Card, Empty, H1, Ionicons, Screen, Segmented, styles } from '../../components/ui';
import { categoryColor } from '../../lib/categories';
import { gapText, money, qty } from '../../lib/format';
import { summarizeItems, type RebuyStatus } from '../../lib/stats';
import { theme } from '../../lib/theme';
import { useAllData } from '../../lib/useData';

type Sort = 'recent' | 'spent' | 'often' | 'rebuy';

export default function Items() {
  const { items, settings, loaded } = useAllData();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [cat, setCat] = useState<string | null>(null);
  const cur = settings.currency;

  const summaries = useMemo(() => summarizeItems(items), [items]);
  const cats = useMemo(() => [...new Set(summaries.map((s) => s.category))].sort(), [summaries]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let l = summaries.filter((s) => (!cat || s.category === cat) && (!needle || s.name.toLowerCase().includes(needle)));
    const rank: Record<RebuyStatus, number> = { overdue: 0, due: 1, soon: 2, ok: 3, once: 4 };
    l = [...l].sort((a, b) => {
      if (sort === 'spent') return b.totalSpent - a.totalSpent;
      if (sort === 'often') return b.timesBought - a.timesBought;
      if (sort === 'rebuy') return rank[a.status] - rank[b.status] || b.daysSinceLast - a.daysSinceLast;
      return a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0;
    });
    return l;
  }, [summaries, q, sort, cat]);

  if (loaded && !summaries.length) {
    return (
      <Screen>
        <H1>Items</H1>
        <Empty icon="basket-outline" title="No items yet" text="Once you scan receipts, every product you buy is tracked here, with how often you buy it and how its price changes." />
      </Screen>
    );
  }

  return (
    <Screen>
      <H1 sub={`${summaries.length} different products`}>Items</H1>
      <View style={[styles.input, styles.row, { gap: 8, paddingVertical: 4, marginBottom: 10 }]}>
        <Ionicons name="search" size={18} color={theme.inkFaint} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search items" placeholderTextColor={theme.inkFaint} style={{ flex: 1, color: theme.ink, paddingVertical: 8 }} />
      </View>
      <Segmented
        value={sort}
        onChange={setSort}
        options={[
          { value: 'recent', label: 'Recent' },
          { value: 'rebuy', label: 'Rebuy' },
          { value: 'often', label: 'Often' },
          { value: 'spent', label: 'Spent' },
        ]}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 10 }} contentContainerStyle={{ gap: 6 }}>
        {[null, ...cats].map((c) => {
          const active = cat === c;
          return (
            <Pressable
              key={c ?? 'all'}
              onPress={() => setCat(c)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 99,
                backgroundColor: active ? theme.ink : theme.card,
                borderWidth: 1,
                borderColor: active ? theme.ink : theme.border,
              }}
            >
              <Text style={{ color: active ? '#fff' : theme.inkSoft, fontWeight: '700', fontSize: 13 }}>{c ?? 'All'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {list.map((s) => {
        const t = priceTrend(s);
        return (
          <Card key={s.key} onPress={() => router.push({ pathname: '/item/[key]', params: { key: s.key } })}>
            <View style={[styles.row, { justifyContent: 'space-between', gap: 8 }]}>
              <View style={[styles.row, { gap: 8, flex: 1 }]}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: categoryColor(s.category) }} />
                <Text style={[styles.body, { fontWeight: '700', flex: 1 }]} numberOfLines={1}>{s.name}</Text>
              </View>
              {statusPill(s.status)}
            </View>
            <View style={[styles.row, { marginTop: 10, gap: 6 }]}>
              <Cell label="Bought" value={`${s.timesBought}×`} />
              <Cell label="Qty" value={qty(s.totalQuantity, s.unit).replace('×', '')} />
              <Cell label="Every" value={s.avgGapDays != null ? gapText(Math.round(s.avgGapDays)) : '—'} />
              <Cell label="Last" value={s.daysSinceLast === 0 ? 'today' : `${s.daysSinceLast} d ago`} />
            </View>
            <View style={[styles.row, { justifyContent: 'space-between', marginTop: 8 }]}>
              <Text style={styles.muted}>
                Last price {money(s.lastPrice, cur)}
                {t ? (
                  <Text style={{ color: t.up ? theme.accent : theme.good, fontWeight: '700' }}>
                    {'  '}
                    {t.up ? '▲' : '▼'} {Math.abs(t.pct).toFixed(0)}%
                  </Text>
                ) : null}
              </Text>
              <Text style={[styles.muted, { fontWeight: '700' }]}>{money(s.totalSpent, cur)} total</Text>
            </View>
          </Card>
        );
      })}
      {!list.length ? <Text style={[styles.muted, { textAlign: 'center', marginTop: 20 }]}>No items match.</Text> : null}
    </Screen>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.cardAlt, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 }}>
      <Text style={{ fontSize: 10, color: theme.inkSoft, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 14, color: theme.ink, fontWeight: '800' }} numberOfLines={1}>{value}</Text>
    </View>
  );
}
