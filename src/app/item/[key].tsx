import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { priceTrend, statusPill } from '../../components/itemBits';
import { Button, Card, Field, Ionicons, Screen, SectionTitle, Stat, styles } from '../../components/ui';
import { CATEGORIES, categoryColor } from '../../lib/categories';
import { renameItemKey, setItemKeyCategory } from '../../lib/db';
import { money, prettyDate, qty, relativeDays } from '../../lib/format';
import { normalizeKey, summarizeItems } from '../../lib/stats';
import { theme } from '../../lib/theme';
import { useAllData } from '../../lib/useData';

export default function ItemDetail() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const db = useSQLiteContext();
  const { items, settings, loaded } = useAllData();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const cur = settings.currency;

  const s = useMemo(() => summarizeItems(items).find((x) => x.key === key), [items, key]);

  if (!loaded) return <Screen padTop={false}>{null}</Screen>;
  if (!s) {
    return (
      <Screen padTop={false}>
        <Text style={styles.body}>This item has no purchases left.</Text>
      </Screen>
    );
  }

  const trend = priceTrend(s);
  const prices = s.events.filter((e) => e.unitPrice != null).slice(-10);
  const maxP = Math.max(...prices.map((p) => p.unitPrice ?? 0), 0.01);
  const minP = Math.min(...prices.map((p) => p.unitPrice ?? 0));

  async function saveName() {
    const name = newName.trim();
    if (!name || !s) return setEditing(false);
    const target = normalizeKey(name);
    const merging = target !== s.key && summarizeItems(items).some((x) => x.key === target);
    const go = async () => {
      await renameItemKey(db, s.key, name);
      setEditing(false);
      // Reopen under the new name so the merged history reloads.
      router.replace({ pathname: '/item/[key]', params: { key: target } });
    };
    if (merging) {
      Alert.alert('Merge items?', `"${name}" already exists. Their purchase histories will be combined.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', onPress: go },
      ]);
    } else go();
  }

  return (
    <>
      <Stack.Screen options={{ title: s.name }} />
      <Screen padTop={false}>
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between', gap: 8 }]}>
            <Text style={[styles.section, { flex: 1 }]}>{s.name}</Text>
            {statusPill(s.status)}
          </View>
          <Pressable onPress={() => setCatOpen(true)} style={[styles.row, { gap: 6, marginTop: 6 }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: categoryColor(s.category) }} />
            <Text style={{ color: theme.inkSoft, fontWeight: '700' }}>{s.category}</Text>
            <Ionicons name="chevron-down" size={14} color={theme.inkSoft} />
          </Pressable>

          {s.nextExpected ? (
            <View style={{ backgroundColor: theme.cardAlt, borderRadius: 12, padding: 12, marginTop: 12 }}>
              <Text style={styles.muted}>You usually buy this every</Text>
              <Text style={{ fontSize: 24, fontWeight: '800', color: theme.ink }}>
                {Math.round(s.avgGapDays ?? 0)} days
                <Text style={[styles.muted, { fontWeight: '400' }]}>  (range {s.minGapDays}–{s.maxGapDays})</Text>
              </Text>
              <Text style={[styles.body, { marginTop: 4 }]}>
                Last bought {relativeDays(s.lastDate)}. Next one expected around{' '}
                <Text style={{ fontWeight: '800' }}>{prettyDate(s.nextExpected)}</Text> ({relativeDays(s.nextExpected)}).
              </Text>
            </View>
          ) : (
            <Text style={[styles.muted, { marginTop: 10 }]}>
              Bought once so far, {relativeDays(s.lastDate)}. Buy it again and TillTrack starts predicting when you'll need it next.
            </Text>
          )}

          <View style={[styles.row, { marginTop: 14, gap: 10 }]}>
            <Stat label="Times" value={String(s.timesBought)} />
            <Stat label="Quantity" value={qty(s.totalQuantity, s.unit).replace('×', '')} />
            <Stat label="Spent" value={money(s.totalSpent, '')} sub={cur} />
          </View>
        </Card>

        <SectionTitle>Price</SectionTitle>
        <Card>
          <View style={[styles.row, { gap: 10 }]}>
            <Stat label="Latest" value={money(s.lastPrice, '')} sub={trend ? `${trend.up ? '▲' : '▼'} ${Math.abs(trend.pct).toFixed(0)}% vs last time` : cur} />
            <Stat label="Average" value={money(s.avgPrice, '')} />
            <Stat label="Lowest" value={money(s.minPrice, '')} />
          </View>
          {prices.length > 1 ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90, marginTop: 14 }}>
              {prices.map((p, i) => {
                const v = p.unitPrice ?? 0;
                const h = 14 + ((v - minP) / (maxP - minP || 1)) * 60;
                return (
                  <View key={`${p.receiptId}-${i}`} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, color: theme.inkFaint }}>{v.toFixed(2)}</Text>
                    <View style={{ width: '100%', height: h, borderRadius: 5, backgroundColor: v === minP ? theme.good : i === prices.length - 1 ? theme.accent : theme.accentSoft }} />
                  </View>
                );
              })}
            </View>
          ) : null}
          {prices.length > 1 ? <Text style={styles.hint}>Price each for the last {prices.length} purchases. Green is the cheapest.</Text> : null}
        </Card>

        <SectionTitle>Purchase history</SectionTitle>
        <Card>
          {[...s.events].reverse().slice(0, showAll ? undefined : 6).map((e, i, arr) => (
            <Pressable
              key={`${e.receiptId}-${i}`}
              onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: String(e.receiptId) } })}
              style={{ flexDirection: 'row', gap: 12 }}
            >
              <View style={{ alignItems: 'center', width: 14 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: i === 0 ? theme.accent : theme.border, marginTop: 4 }} />
                {i < arr.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: theme.border }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 14 }}>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Text style={[styles.body, { fontWeight: '700' }]}>{prettyDate(e.date, true)}</Text>
                  <Text style={[styles.body, { fontWeight: '700' }]}>{money(e.total, cur)}</Text>
                </View>
                <Text style={styles.muted}>
                  {qty(e.quantity, s.unit)}
                  {e.unitPrice != null ? ` @ ${money(e.unitPrice, cur)}` : ''}
                  {e.store ? ` · ${e.store}` : ''}
                </Text>
                {e.gapDays != null ? (
                  <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                    {e.gapDays === 0 ? 'Same day as the previous purchase' : `${e.gapDays} days after the previous purchase`}
                  </Text>
                ) : (
                  <Text style={styles.hint}>First purchase</Text>
                )}
              </View>
            </Pressable>
          ))}
          {s.events.length > 6 ? (
            <Button
              title={showAll ? 'Show fewer' : `Show all ${s.events.length} purchases`}
              kind="ghost"
              onPress={() => setShowAll((v) => !v)}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : null}
        </Card>

        <SectionTitle>Tidy up</SectionTitle>
        {editing ? (
          <Card>
            <Field label="New name" value={newName} onChangeText={setNewName} autoFocus hint="Give two spellings of the same product one name and their histories merge." />
            <View style={[styles.row, { gap: 10 }]}>
              <Button title="Save" onPress={saveName} style={{ flex: 1 }} />
              <Button title="Cancel" kind="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : (
          <Button title="Rename or merge" icon="git-merge-outline" kind="secondary" onPress={() => { setNewName(s.name); setEditing(true); }} />
        )}
      </Screen>

      <Modal visible={catOpen} transparent animationType="slide" onRequestClose={() => setCatOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={() => setCatOpen(false)} />
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', padding: 16 }}>
          <Text style={[styles.section, { marginBottom: 4 }]}>Category for every purchase</Text>
          <ScrollView>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={async () => {
                  await setItemKeyCategory(db, s.key, c);
                  setCatOpen(false);
                  router.replace({ pathname: '/item/[key]', params: { key: s.key } });
                }}
                style={[styles.row, { gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }]}
              >
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: categoryColor(c) }} />
                <Text style={styles.body}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
