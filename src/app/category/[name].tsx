import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MonthPicker, monthStart } from '../../components/MonthPicker';
import { Bar, Card, Ionicons, Screen, SectionTitle, styles } from '../../components/ui';
import { categoryColor } from '../../lib/categories';
import { money } from '../../lib/format';
import { categoryTrend, comparableRange, parseISODate, periodRange, typeBreakdown } from '../../lib/stats';
import { theme } from '../../lib/theme';
import { useAllData } from '../../lib/useData';

function amount(kg: number, pcs: number) {
  const parts: string[] = [];
  if (kg) parts.push(`${kg.toFixed(kg < 10 ? 2 : 1).replace(/\.?0+$/, '')} kg`);
  if (pcs) parts.push(`${Number.isInteger(pcs) ? pcs : pcs.toFixed(1)} pcs`);
  return parts.join(' + ');
}

export default function CategoryDetail() {
  const { name, month: m } = useLocalSearchParams<{ name: string; month?: string }>();
  const { items, settings, typeOf } = useAllData();
  const [month, setMonth] = useState(m ? monthStart(parseISODate(m)) : monthStart());
  const [open, setOpen] = useState<string | null>(null);
  const cur = settings.currency;
  const color = categoryColor(name);

  const data = useMemo(() => {
    const range = periodRange('month', 0, month);
    const prevFull = periodRange('month', -1, month);
    const prev = comparableRange(range, prevFull).range;
    const types = typeBreakdown(items, name, range, prev, typeOf);
    const total = types.reduce((s, t) => s + t.total, 0);
    const prevTotal = types.reduce((s, t) => s + t.prevTotal, 0);
    const trend = categoryTrend(items, name, 'month', 6, month);
    return { types, total, prevTotal, trend, partial: prev.end !== prevFull.end };
  }, [items, name, month, typeOf]);

  const change = data.prevTotal > 0 ? ((data.total - data.prevTotal) / data.prevTotal) * 100 : null;
  const maxT = Math.max(1, ...data.types.map((t) => t.total));
  const maxBar = Math.max(1, ...data.trend.map((t) => t.total));

  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <Screen padTop={false}>
        <MonthPicker month={month} onChange={setMonth} />

        <Card style={{ marginTop: 12 }}>
          <View style={[styles.row, { gap: 8 }]}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
            <Text style={[styles.muted, { fontWeight: '700' }]}>{name}</Text>
          </View>
          <Text style={{ fontSize: 32, fontWeight: '800', color: theme.ink, marginTop: 4 }}>{money(data.total, cur)}</Text>
          {change != null ? (
            <Text style={{ color: change > 0 ? theme.accent : theme.good, fontWeight: '700' }}>
              {change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}% vs {data.partial ? 'this point last month' : 'last month'} ({money(data.prevTotal, '')})
            </Text>
          ) : (
            <Text style={styles.hint}>Nothing in this category the month before.</Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 86, marginTop: 14 }}>
            {data.trend.map((b, i) => {
              const isCur = i === data.trend.length - 1;
              return (
                <View key={b.range.start} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: theme.inkFaint, marginBottom: 2 }}>{b.total ? Math.round(b.total) : ''}</Text>
                  <View style={{ width: '100%', height: Math.max(3, (b.total / maxBar) * 56), borderRadius: 5, backgroundColor: isCur ? color : `${color}44` }} />
                  <Text style={{ fontSize: 11, color: isCur ? theme.ink : theme.inkFaint, marginTop: 3, fontWeight: isCur ? '700' : '400' }}>{b.label}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        <SectionTitle>What you bought</SectionTitle>
        {data.types.filter((t) => t.total > 0).length === 0 ? <Text style={styles.muted}>Nothing in {name} this month.</Text> : null}
        {data.types
          .filter((t) => t.total > 0)
          .map((t) => {
            const expanded = open === t.type;
            const diff = t.prevTotal > 0 ? ((t.total - t.prevTotal) / t.prevTotal) * 100 : null;
            return (
              <Card key={t.type} onPress={() => setOpen(expanded ? null : t.type)}>
                <View style={[styles.row, { gap: 8 }]}>
                  <Text style={[styles.body, { fontWeight: '800', fontSize: 16, flex: 1 }]}>{t.type}</Text>
                  <Text style={{ fontWeight: '800', fontSize: 16, color: theme.ink }}>{money(t.total, '')}</Text>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.inkFaint} />
                </View>
                <View style={{ marginTop: 8 }}>
                  <Bar fraction={t.total / maxT} color={color} />
                </View>
                <View style={[styles.row, { justifyContent: 'space-between', marginTop: 6 }]}>
                  <Text style={styles.hint}>
                    {[amount(t.kg, t.pcs), `${t.times} ${t.times === 1 ? 'time' : 'times'}`].filter(Boolean).join(' · ')}
                  </Text>
                  {diff != null && Math.abs(diff) >= 1 ? (
                    <Text style={{ fontSize: 12, fontWeight: '700', color: diff > 0 ? theme.accent : theme.good }}>
                      {diff > 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(0)}%
                    </Text>
                  ) : null}
                </View>
                {expanded ? (
                  <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border }}>
                    {t.items.map((l) => (
                      <Pressable
                        key={l.key}
                        onPress={() => router.push({ pathname: '/item/[key]', params: { key: l.key } })}
                        style={[styles.row, { paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: theme.border }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.body, { fontWeight: '600' }]} numberOfLines={1}>{l.name}</Text>
                          <Text style={styles.hint}>
                            {l.unit === 'kg' ? `${l.qty} kg` : `${l.qty} ${l.unit ?? 'pcs'}`} · {l.times}×
                          </Text>
                        </View>
                        <Text style={[styles.body, { fontWeight: '700' }]}>{money(l.total, '')}</Text>
                        <Ionicons name="chevron-forward" size={16} color={theme.inkFaint} />
                      </Pressable>
                    ))}
                    <Text style={[styles.hint, { marginTop: 8 }]}>Wrong type? Open the item and change its type.</Text>
                  </View>
                ) : null}
              </Card>
            );
          })}
      </Screen>
    </>
  );
}
