import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Bar, Button, Card, Empty, H1, Ionicons, Pill, Screen, SectionTitle, Segmented, Stat, styles } from '../../components/ui';
import { categoryColor } from '../../lib/categories';
import { money, prettyDate } from '../../lib/format';
import {
  categoryTotals,
  comparableRange,
  inRange,
  parseISODate,
  periodRange,
  spendInRange,
  storeTotals,
  summarizeItems,
  trend,
  type Period,
} from '../../lib/stats';
import { loadSampleData } from '../../lib/db';
import { buildSampleReceipts } from '../../lib/sample';
import { theme } from '../../lib/theme';
import { useAllData } from '../../lib/useData';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

export default function Overview() {
  const db = useSQLiteContext();
  const { receipts, items, settings, loaded, reload } = useAllData();
  const [loadingSample, setLoadingSample] = useState(false);
  const [period, setPeriod] = useState<Period>('month');
  const [offset, setOffset] = useState(0);
  const cur = settings.currency;
  const ws = settings.weekStartsOn;

  const data = useMemo(() => {
    const range = periodRange(period, offset, new Date(), ws);
    const prevRange = periodRange(period, offset - 1, new Date(), ws);
    const total = spendInRange(receipts, range);
    const cmp = comparableRange(range, prevRange);
    const prev = spendInRange(receipts, cmp.range);
    const partial = cmp.partial;
    const cats = categoryTotals(items, range);
    const itemsSum = cats.reduce((s, c) => s + c.total, 0);
    const extra = Math.round((total - itemsSum) * 100) / 100; // VAT, receipt discounts and fees
    // Bars end at the period being viewed, so paging back moves the chart too.
    const bars = trend(receipts, period, period === 'year' ? 4 : 6, parseISODate(range.end), ws);
    const tripCount = receipts.filter((r) => inRange(r.date, range)).length;
    const units = items.filter((i) => inRange(i.date, range) && i.total_price > 0).reduce((s, i) => s + (i.unit ? 1 : i.quantity), 0);
    const stores = storeTotals(receipts, range).slice(0, 3);
    const rebuy = summarizeItems(items)
      .filter((s) => s.status === 'due' || s.status === 'overdue' || s.status === 'soon')
      .sort((a, b) => b.daysSinceLast / (b.avgGapDays || 1) - a.daysSinceLast / (a.avgGapDays || 1))
      .slice(0, 5);
    const monthSpend = spendInRange(receipts, periodRange('month', 0, new Date(), ws));
    return { range, total, prev, partial, cats, extra, bars, tripCount, units, stores, rebuy, monthSpend };
  }, [receipts, items, period, offset, ws]);

  if (loaded && receipts.length === 0) {
    return (
      <Screen>
        <H1 sub="See where your money goes, item by item.">TillTrack</H1>
        <Empty
          icon="receipt-outline"
          title="Scan your first receipt"
          text="Take a photo of a receipt. The AI reads every line, sorts it into a category and starts tracking how often you buy each item."
          action={
            <View style={{ alignSelf: 'stretch', gap: 8 }}>
              <Button title="Scan a receipt" icon="scan" onPress={() => router.navigate('/scan')} />
              <Button
                title="Try it with sample receipts"
                icon="sparkles-outline"
                kind="secondary"
                loading={loadingSample}
                onPress={async () => {
                  setLoadingSample(true);
                  await loadSampleData(db, buildSampleReceipts());
                  setLoadingSample(false);
                  reload();
                }}
              />
            </View>
          }
        />
        <Text style={[styles.hint, { textAlign: 'center' }]}>You can remove the sample receipts any time in Settings.</Text>
      </Screen>
    );
  }

  const change = data.prev > 0 ? ((data.total - data.prev) / data.prev) * 100 : null;
  const maxBar = Math.max(1, ...data.bars.map((b) => b.total));
  const budget = settings.monthlyBudget;

  return (
    <Screen>
      <H1 sub="Your spending at a glance">Overview</H1>
      <Segmented options={PERIODS} value={period} onChange={(p) => { setPeriod(p); setOffset(0); }} />

      <Card style={{ marginTop: 12 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Pressable hitSlop={12} onPress={() => setOffset((o) => o - 1)}>
            <Ionicons name="chevron-back" size={22} color={theme.inkSoft} />
          </Pressable>
          <Text style={[styles.muted, { fontWeight: '700' }]}>{data.range.label}</Text>
          <Pressable hitSlop={12} disabled={offset >= 0} onPress={() => setOffset((o) => Math.min(0, o + 1))}>
            <Ionicons name="chevron-forward" size={22} color={offset >= 0 ? theme.border : theme.inkSoft} />
          </Pressable>
        </View>
        <Text style={{ fontSize: 36, fontWeight: '800', color: theme.ink, marginTop: 8 }}>{money(data.total, cur)}</Text>
        {change != null ? (
          <View style={[styles.row, { gap: 6, marginTop: 2 }]}>
            <Ionicons name={change > 0 ? 'trending-up' : 'trending-down'} size={16} color={change > 0 ? theme.accent : theme.good} />
            <Text style={{ color: change > 0 ? theme.accent : theme.good, fontWeight: '700' }}>
              {Math.abs(change).toFixed(0)}% {change > 0 ? 'more' : 'less'} than{' '}
              {data.partial ? `this point last ${period}` : `the previous ${period}`}
            </Text>
          </View>
        ) : null}
        <View style={[styles.row, { marginTop: 14, gap: 10 }]}>
          <Stat label="Trips" value={String(data.tripCount)} />
          <Stat label="Items" value={String(Math.round(data.units))} />
          <Stat label="Avg / trip" value={data.tripCount ? money(data.total / data.tripCount, '') : '—'} />
        </View>

        {/* Trend bars */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 110, marginTop: 16 }}>
          {data.bars.map((b, i) => {
            const isCur = i === data.bars.length - 1;
            return (
              <View key={b.range.start} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: theme.inkFaint, marginBottom: 3 }} numberOfLines={1}>
                  {b.total ? Math.round(b.total) : ''}
                </Text>
                <View
                  style={{
                    width: '100%',
                    height: Math.max(3, (b.total / maxBar) * 80),
                    borderRadius: 6,
                    backgroundColor: isCur ? theme.accent : theme.accentSoft,
                  }}
                />
                <Text style={{ fontSize: 11, color: isCur ? theme.ink : theme.inkFaint, marginTop: 4, fontWeight: isCur ? '700' : '400' }}>
                  {b.label}
                </Text>
              </View>
            );
          })}
        </View>
      </Card>

      {budget > 0 ? (
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 8 }]}>
            <Text style={[styles.body, { fontWeight: '700' }]}>Monthly budget</Text>
            <Text style={styles.muted}>
              {money(data.monthSpend, cur)} of {money(budget, cur)}
            </Text>
          </View>
          <Bar
            fraction={data.monthSpend / budget}
            height={10}
            color={data.monthSpend > budget ? theme.accent : data.monthSpend > budget * 0.8 ? theme.warn : theme.good}
          />
          <Text style={styles.hint}>
            {data.monthSpend > budget
              ? `${money(data.monthSpend - budget, cur)} over budget this month`
              : `${money(budget - data.monthSpend, cur)} left this month`}
          </Text>
        </Card>
      ) : null}

      {data.rebuy.length ? (
        <>
          <SectionTitle right={<Pressable onPress={() => router.navigate('/items')}><Text style={{ color: theme.accent, fontWeight: '700' }}>All items</Text></Pressable>}>
            Time to rebuy
          </SectionTitle>
          {data.rebuy.map((s) => (
            <Card key={s.key} onPress={() => router.push({ pathname: '/item/[key]', params: { key: s.key } })}>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.body, { fontWeight: '700' }]} numberOfLines={1}>{s.name}</Text>
                  <Text style={styles.muted}>
                    You buy it every ~{Math.round(s.avgGapDays ?? 0)} days · last bought {s.daysSinceLast} days ago
                  </Text>
                </View>
                <Pill
                  text={s.status === 'overdue' ? 'Overdue' : s.status === 'due' ? 'Due' : 'Soon'}
                  color={s.status === 'soon' ? theme.warn : theme.accent}
                  bg={s.status === 'soon' ? theme.warnSoft : theme.accentSoft}
                />
              </View>
            </Card>
          ))}
        </>
      ) : null}

      <SectionTitle>By category</SectionTitle>
      <Card>
        {data.cats.length === 0 ? (
          <Text style={styles.muted}>No purchases in this {period}.</Text>
        ) : (
          <>
            {data.cats.map((c) => (
              <View key={c.category} style={{ marginBottom: 12 }}>
                <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 5 }]}>
                  <View style={[styles.row, { gap: 8, flex: 1 }]}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: categoryColor(c.category) }} />
                    <Text style={styles.body} numberOfLines={1}>{c.category}</Text>
                  </View>
                  <Text style={[styles.body, { fontWeight: '700' }]}>{money(c.total, cur)}</Text>
                </View>
                <Bar fraction={c.total / (data.cats[0].total || 1)} color={categoryColor(c.category)} />
                <Text style={styles.hint}>
                  {data.total > 0 ? `${Math.round((c.total / data.total) * 100)}% of spending` : ''}
                </Text>
              </View>
            ))}
            {Math.abs(data.extra) >= 0.01 ? (
              <Text style={styles.hint}>
                {data.extra > 0 ? `+ ${money(data.extra, cur)} VAT and fees` : `${money(data.extra, cur)} receipt discounts`} not tied to one item.
              </Text>
            ) : null}
          </>
        )}
      </Card>

      {data.stores.length ? (
        <>
          <SectionTitle>Top stores</SectionTitle>
          <Card>
            {data.stores.map((s, i) => (
              <View key={s.store} style={[styles.row, { justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: theme.border }]}>
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

      <Text style={[styles.hint, { textAlign: 'center', marginTop: 10 }]}>
        {data.range.start === data.range.end ? '' : `${prettyDate(data.range.start)} – ${prettyDate(data.range.end)}`}
      </Text>
    </Screen>
  );
}
