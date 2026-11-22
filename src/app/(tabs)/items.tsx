import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { priceTrend } from '../../components/itemBits';
import { Empty, H1, Ionicons, Screen, Segmented, styles } from '../../components/ui';
import { categoryColor } from '../../lib/categories';
import { money } from '../../lib/format';
import { inRange, periodRange, summarizeItems, type ItemSummary, type RebuyStatus } from '../../lib/stats';
import { theme } from '../../lib/theme';
import { useAllData } from '../../lib/useData';

type Filter = 'all' | 'rebuy';

const STATUS: Record<RebuyStatus, { label: string; color: string }> = {
  overdue: { label: 'Overdue', color: theme.accent },
  due: { label: 'Due', color: theme.accent },
  soon: { label: 'Soon', color: theme.warn },
  ok: { label: 'Stocked', color: theme.good },
  once: { label: '', color: theme.border },
};

export default function Items() {
  const { items, settings, loaded } = useAllData();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const cur = settings.currency;

  const summaries = useMemo(() => summarizeItems(items), [items]);
  const month = useMemo(() => periodRange('month', 0), []);
  const monthSpend = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) if (inRange(it.date, month) && it.total_price > 0) m.set(it.category, (m.get(it.category) ?? 0) + it.total_price);
    return m;
  }, [items, month]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank: Record<RebuyStatus, number> = { overdue: 0, due: 1, soon: 2, ok: 3, once: 4 };
    const list = summaries.filter(
      (s) => (!needle || s.name.toLowerCase().includes(needle)) && (filter === 'all' || s.status === 'due' || s.status === 'overdue' || s.status === 'soon'),
    );
    const map = new Map<string, ItemSummary[]>();
    for (const s of list) map.set(s.category, [...(map.get(s.category) ?? []), s]);
    return [...map.entries()]
      .map(([category, rows]) => ({
        category,
        rows: rows.sort((a, b) =>
          filter === 'rebuy' ? rank[a.status] - rank[b.status] || b.daysSinceLast - a.daysSinceLast : a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0,
        ),
        spend: monthSpend.get(category) ?? 0,
        due: rows.filter((r) => r.status === 'due' || r.status === 'overdue').length,
      }))
      .sort((a, b) => b.spend - a.spend || b.rows.length - a.rows.length);
  }, [summaries, q, filter, monthSpend]);

  if (loaded && !summaries.length) {
    return (
      <Screen>
        <H1>Items</H1>
        <Empty icon="basket-outline" title="No items yet" text="Every product you buy shows up here, grouped by category, with how often you buy it and its latest price." />
      </Screen>
    );
  }

  const searching = q.trim().length > 0 || filter === 'rebuy';
  const isOpen = (c: string) => searching || open.has(c);
  const toggle = (c: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.category));

  return (
    <Screen>
      <H1 sub={`${summaries.length} products · tap a group to open it`}>Items</H1>
      <View style={[styles.input, styles.row, { gap: 8, paddingVertical: 4, marginBottom: 10 }]}>
        <Ionicons name="search" size={18} color={theme.inkFaint} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search items" placeholderTextColor={theme.inkFaint} style={{ flex: 1, color: theme.ink, paddingVertical: 8, fontSize: 16 }} />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.inkFaint} />
          </Pressable>
        ) : null}
      </View>
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All items' },
          { value: 'rebuy', label: 'Time to rebuy' },
        ]}
      />
      {!searching ? (
        <Pressable onPress={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.category)))} style={{ alignSelf: 'flex-end', paddingVertical: 8 }}>
          <Text style={{ color: theme.accent, fontWeight: '700' }}>{allOpen ? 'Close all' : 'Open all'}</Text>
        </Pressable>
      ) : (
        <View style={{ height: 10 }} />
      )}

      {groups.map((g) => {
        const expanded = isOpen(g.category);
        return (
          <View key={g.category} style={{ backgroundColor: theme.card, borderRadius: theme.radius, borderWidth: 1, borderColor: theme.border, marginBottom: 10, overflow: 'hidden' }}>
            <Pressable onPress={() => toggle(g.category)} style={[styles.row, { gap: 10, padding: 14 }]}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: categoryColor(g.category) }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: theme.ink }}>{g.category}</Text>
                <Text style={styles.hint}>
                  {g.rows.length} {g.rows.length === 1 ? 'item' : 'items'}
                  {g.spend ? ` · ${money(g.spend, cur)} this month` : ''}
                  {g.due ? ` · ${g.due} to rebuy` : ''}
                </Text>
              </View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.inkSoft} />
            </Pressable>
            {expanded
              ? g.rows.map((s) => {
                  const st = STATUS[s.status];
                  const t = priceTrend(s);
                  return (
                    <Pressable
                      key={s.key}
                      onPress={() => router.push({ pathname: '/item/[key]', params: { key: s.key } })}
                      style={({ pressed }) => [
                        styles.row,
                        { gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: pressed ? theme.cardAlt : 'transparent' },
                      ]}
                    >
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.color }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.ink }} numberOfLines={1}>
                          {s.name}
                        </Text>
                        <Text style={styles.hint} numberOfLines={1}>
                          {s.avgGapDays != null ? `every ~${Math.round(s.avgGapDays)} d · ` : ''}
                          {s.daysSinceLast === 0 ? 'bought today' : `last ${s.daysSinceLast} d ago`}
                          {st.label ? ` · ${st.label}` : ''}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: theme.ink }}>
                          {s.lastPrice != null ? s.lastPrice.toFixed(2) : '—'}
                          {s.unit === 'kg' ? <Text style={styles.hint}>/kg</Text> : null}
                        </Text>
                        {t ? (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: t.up ? theme.accent : theme.good }}>
                            {t.up ? '▲' : '▼'} {Math.abs(t.pct).toFixed(0)}%
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })
              : null}
          </View>
        );
      })}
      {!groups.length ? (
        <Text style={[styles.muted, { textAlign: 'center', marginTop: 20 }]}>{filter === 'rebuy' ? 'Nothing is due right now.' : 'No items match.'}</Text>
      ) : null}
      <View style={{ height: 70 }} />
    </Screen>
  );
}
