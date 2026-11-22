import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { MonthPicker, monthStart } from '../../components/MonthPicker';
import { Bar, Card, Empty, H1, Ionicons, Screen, SectionTitle, styles } from '../../components/ui';
import { categoryColor } from '../../lib/categories';
import { money } from '../../lib/format';
import { categoryTotals, comparableRange, periodRange, spendInRange, storeTotals, toISODate } from '../../lib/stats';
import { theme } from '../../lib/theme';
import { useAllData } from '../../lib/useData';

export default function Categories() {
  const { receipts, items, settings, loaded } = useAllData();
  const [month, setMonth] = useState(monthStart());
  const cur = settings.currency;

  const data = useMemo(() => {
    const range = periodRange('month', 0, month);
    const prevFull = periodRange('month', -1, month);
    const prev = comparableRange(range, prevFull).range;
    const cats = categoryTotals(items, range);
    const prevCats = new Map(categoryTotals(items, prev).map((c) => [c.category, c.total]));
    const total = spendInRange(receipts, range);
    const stores = storeTotals(receipts, range).slice(0, 5);
    return { range, cats, prevCats, total, stores };
  }, [items, receipts, month]);

  if (loaded && !items.length) {
    return (
      <Screen>
        <H1>Categories</H1>
        <Empty icon="pie-chart-outline" title="Nothing yet" text="Add a receipt and you'll see what you spend on meat, dairy, drinks and more, month by month." />
      </Screen>
    );
  }

  const max = data.cats[0]?.total || 1;
  const monthKey = toISODate(month);

  return (
    <Screen>
      <H1 sub="Tap a category to see what's inside it">Categories</H1>
      <MonthPicker month={month} onChange={setMonth} />
      <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>
        {money(data.total, cur)} spent in {data.cats.length} {data.cats.length === 1 ? 'category' : 'categories'}
      </Text>

      <View style={{ marginTop: 12 }}>
        {data.cats.length === 0 ? <Text style={[styles.muted, { textAlign: 'center' }]}>No purchases this month.</Text> : null}
        {data.cats.map((c) => {
          const prev = data.prevCats.get(c.category) ?? 0;
          const diff = prev > 0 ? ((c.total - prev) / prev) * 100 : null;
          return (
            <Card key={c.category} onPress={() => router.push({ pathname: '/category/[name]', params: { name: c.category, month: monthKey } })}>
              <View style={[styles.row, { gap: 10 }]}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: categoryColor(c.category) }} />
                <Text style={[styles.body, { fontWeight: '700', flex: 1, fontSize: 16 }]} numberOfLines={1}>
                  {c.category}
                </Text>
                <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink }}>{money(c.total, '')}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.inkFaint} />
              </View>
              <View style={{ marginTop: 8 }}>
                <Bar fraction={c.total / max} color={categoryColor(c.category)} />
              </View>
              <View style={[styles.row, { justifyContent: 'space-between', marginTop: 6 }]}>
                <Text style={styles.hint}>{data.total > 0 ? `${Math.round((c.total / data.total) * 100)}% of the month` : ''}</Text>
                {diff != null && Math.abs(diff) >= 1 ? (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: diff > 0 ? theme.accent : theme.good }}>
                    {diff > 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(0)}% vs last month
                  </Text>
                ) : (
                  <Text style={styles.hint}>{prev === 0 ? 'new this month' : 'same as last month'}</Text>
                )}
              </View>
            </Card>
          );
        })}
      </View>

      {data.stores.length ? (
        <>
          <SectionTitle>Where you shopped</SectionTitle>
          <Card>
            {data.stores.map((s, i) => (
              <View key={s.store} style={[styles.row, { justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.body} numberOfLines={1}>{s.store}</Text>
                  <Text style={styles.hint}>{s.visits} {s.visits === 1 ? 'visit' : 'visits'}</Text>
                </View>
                <Text style={[styles.body, { fontWeight: '700' }]}>{money(s.total, cur)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
      <View style={{ height: 70 }} />
    </Screen>
  );
}
