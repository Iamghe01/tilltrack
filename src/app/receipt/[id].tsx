import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { Button, Card, Field, Ionicons, Screen, SectionTitle, styles } from '../../components/ui';
import { CATEGORIES, categoryColor } from '../../lib/categories';
import {
  deleteReceipt,
  findDuplicate,
  getReceipt,
  knownItems,
  recentStores,
  saveReceipt,
  type DraftReceipt,
  type KnownItem,
} from '../../lib/db';
import { takePendingDraft } from '../../lib/draft';
import { money, prettyDate } from '../../lib/format';
import { guessCategory } from '../../lib/guessCategory';
import { addDays, normalizeKey, round2, toISODate } from '../../lib/stats';
import { theme } from '../../lib/theme';

interface EditItem {
  key: number;
  name: string;
  category: string;
  qty: string;
  unit: string;
  unitPrice: string;
  total: string;
}

const toStr = (n: number | null | undefined) => (n == null ? '' : String(n));
const toNum = (s: string) => {
  const n = Number(s.replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};

let keySeq = 1;

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const db = useSQLiteContext();

  const [loaded, setLoaded] = useState(false);
  const [base, setBase] = useState<DraftReceipt | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [store, setStore] = useState('');
  const [date, setDate] = useState(toISODate(new Date()));
  const [time, setTime] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [payment, setPayment] = useState('');
  const [totalOverride, setTotalOverride] = useState<string | null>(null);
  const [tax, setTax] = useState('');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<EditItem[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [catFor, setCatFor] = useState<number | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [known, setKnown] = useState<KnownItem[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [editTotal, setEditTotal] = useState(false);

  // Quick-add bar
  const [qName, setQName] = useState('');
  const [qQty, setQQty] = useState(1);
  const [qPrice, setQPrice] = useState('');
  const priceRef = useRef<TextInputInstance>(null);
  const nameRef = useRef<TextInputInstance>(null);
  const didLoad = useRef(false);

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    (async () => {
      const [k, st] = await Promise.all([knownItems(db), recentStores(db)]);
      setKnown(k);
      setStores(st);
      let d: DraftReceipt | null = null;
      if (isNew) {
        const p = takePendingDraft();
        if (p) {
          d = p.draft;
          setWarnings(p.warnings);
          setInfo(p.modelInfo);
        }
      } else {
        const r = await getReceipt(db, Number(id));
        if (r) d = { ...r.receipt, items: r.items };
      }
      if (!d) {
        setLoaded(true);
        return;
      }
      setBase(d);
      setStore(d.store ?? '');
      setDate(d.date);
      setTime(d.time ?? '');
      setCurrency(d.currency);
      setPayment(d.payment_method ?? '');
      setTax(toStr(d.tax));
      setDiscount(toStr(d.discount));
      setNote(d.note ?? '');
      // Scanned and saved receipts keep their printed total; new manual ones add up by themselves.
      setTotalOverride(d.source === 'manual' && isNew ? null : toStr(d.total));
      setItems(
        d.items.map((it) => ({
          key: keySeq++,
          name: it.name,
          category: it.category,
          qty: toStr(it.quantity),
          unit: it.unit ?? '',
          unitPrice: toStr(it.unit_price),
          total: toStr(it.total_price),
        })),
      );
      if (d.tax || d.discount || d.note || d.payment_method) setShowMore(true);
      setLoaded(true);
    })();
  }, [db, id, isNew]);

  const itemsSum = useMemo(() => round2(items.reduce((s, i) => s + (toNum(i.total) ?? 0), 0)), [items]);
  const autoTotal = round2(itemsSum + (toNum(tax) ?? 0) - (toNum(discount) ?? 0));
  const totalNum = totalOverride != null ? toNum(totalOverride) : autoTotal;
  const mismatch = totalOverride != null && totalNum != null && Math.abs(totalNum - autoTotal) > 0.05 && Math.abs(totalNum - itemsSum) > 0.05;

  // Suggestions while typing a name, from everything bought before.
  const suggestions = useMemo(() => {
    const q = normalizeKey(qName);
    if (!q) return [];
    const words = q.split(' ');
    return known
      .filter((k) => words.every((w) => k.item_key.includes(w)))
      .sort((a, b) => Number(b.item_key.startsWith(q)) - Number(a.item_key.startsWith(q)) || b.times - a.times)
      .slice(0, 5);
  }, [qName, known]);

  const inList = useMemo(() => new Set(items.map((i) => normalizeKey(i.name))), [items]);
  const frequent = useMemo(() => known.filter((k) => !inList.has(k.item_key)).slice(0, 10), [known, inList]);
  const categoryHistory = useMemo(() => new Map(known.map((k) => [k.item_key, k.category])), [known]);

  function update(key: number, patch: Partial<EditItem>) {
    setItems((list) =>
      list.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        if ('qty' in patch || 'unitPrice' in patch) {
          const q = toNum(next.qty);
          const up = toNum(next.unitPrice);
          if (q != null && up != null) next.total = String(round2(q * up));
        }
        if ('total' in patch && !('unitPrice' in patch)) {
          const q = toNum(next.qty);
          const t = toNum(next.total);
          if (q && t != null) next.unitPrice = String(round2(t / q));
        }
        return next;
      }),
    );
  }

  function step(key: number, delta: number) {
    setItems((list) => {
      const out: EditItem[] = [];
      for (const it of list) {
        if (it.key !== key) {
          out.push(it);
          continue;
        }
        const q = toNum(it.qty) ?? 1;
        const next = round2(q + delta);
        if (next <= 0) continue; // going below 1 removes the line
        // Keep the price each; work it out from the line total if it's missing.
        const up = toNum(it.unitPrice) ?? (toNum(it.total) != null && q > 0 ? round2((toNum(it.total) ?? 0) / q) : null);
        out.push({ ...it, qty: String(next), unitPrice: up != null ? String(up) : it.unitPrice, total: up != null ? String(round2(up * next)) : it.total });
      }
      return out;
    });
  }

  function removeItem(key: number) {
    setItems((l) => l.filter((x) => x.key !== key));
    if (open === key) setOpen(null);
  }

  function addItem(name: string, price: number | null, qty = 1, k?: KnownItem) {
    const n = name.trim();
    if (!n) return;
    const existing = items.find((i) => normalizeKey(i.name) === normalizeKey(n));
    if (existing) {
      // Adding the same thing again just bumps the quantity.
      step(existing.key, qty);
    } else {
      setItems((l) => [
        ...l,
        {
          key: keySeq++,
          name: n,
          category: k?.category ?? guessCategory(n, categoryHistory),
          qty: String(qty),
          unit: k?.unit ?? '',
          unitPrice: price != null ? String(price) : '',
          total: price != null ? String(round2(price * qty)) : '',
        },
      ]);
    }
    setQName('');
    setQPrice('');
    setQQty(1);
  }

  function addFromBar() {
    if (!qName.trim()) return;
    const exact = known.find((k) => k.item_key === normalizeKey(qName));
    const price = toNum(qPrice) ?? exact?.last_price ?? null;
    addItem(exact?.name ?? capitalise(qName), price != null ? round2(price) : null, qQty, exact);
    nameRef.current?.focus();
  }

  async function onSave() {
    const lines = items.filter((i) => i.name.trim());
    if (!lines.length) return Alert.alert('Add at least one item', 'Type an item name above, or tap one of your usual items.');
    if (lines.some((i) => toNum(i.total) == null)) {
      return Alert.alert('Some prices are missing', 'Each item needs a price. Tap the item to add it.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Alert.alert('Check the date', 'Use the format YYYY-MM-DD, for example 2026-11-17.');
    const draft: DraftReceipt = {
      store: store.trim() || null,
      date,
      time: time.trim() || null,
      subtotal: base?.subtotal ?? null,
      tax: toNum(tax),
      discount: toNum(discount),
      total: totalNum ?? autoTotal,
      currency: currency.trim().toUpperCase() || 'AED',
      payment_method: payment.trim() || null,
      image_uri: base?.image_uri ?? null,
      note: note.trim() || null,
      source: base?.source ?? 'manual',
      items: lines.map((i) => ({
        name: i.name.trim(),
        category: i.category,
        quantity: toNum(i.qty) ?? 1,
        unit: i.unit.trim() || null,
        unit_price: toNum(i.unitPrice),
        total_price: toNum(i.total) ?? 0,
      })),
    };

    const doSave = async () => {
      setSaving(true);
      try {
        await saveReceipt(db, draft, isNew ? undefined : Number(id));
        router.back();
      } catch (e) {
        Alert.alert("Couldn't save", (e as Error).message);
      } finally {
        setSaving(false);
      }
    };

    if (isNew) {
      const dup = await findDuplicate(db, draft);
      if (dup) {
        return Alert.alert('Already saved?', 'A receipt from the same store, date and total is already saved.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save anyway', onPress: doSave },
        ]);
      }
    }
    doSave();
  }

  function onDelete() {
    Alert.alert('Delete this receipt?', 'Its items will be removed from your stats.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteReceipt(db, Number(id));
          if (base?.image_uri) {
            try {
              new File(base.image_uri).delete();
            } catch {
              /* photo already gone */
            }
          }
          router.back();
        },
      },
    ]);
  }

  if (!loaded) return <Screen padTop={false}>{null}</Screen>;
  if (!base && !isNew) {
    return (
      <Screen padTop={false}>
        <Text style={styles.body}>This receipt couldn't be found.</Text>
      </Screen>
    );
  }

  const today = toISODate(new Date());
  const yesterday = addDays(today, -1);

  return (
    <>
      <Stack.Screen options={{ title: isNew ? (base?.source === 'scan' ? 'Check receipt' : 'Add purchase') : 'Edit receipt' }} />
      <Screen padTop={false}>
        {warnings.length ? (
          <Card style={{ backgroundColor: theme.warnSoft, borderColor: theme.warnSoft }}>
            {warnings.map((w) => (
              <View key={w} style={[styles.row, { gap: 8, alignItems: 'flex-start', marginBottom: 4 }]}>
                <Ionicons name="warning-outline" size={18} color={theme.warn} />
                <Text style={[styles.body, { flex: 1, fontSize: 14 }]}>{w}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        {info ? <Text style={[styles.hint, { marginBottom: 8, marginTop: 0 }]}>{info}</Text> : null}

        {/* Where and when */}
        <Card>
          <View style={[styles.row, { gap: 12 }]}>
            {base?.image_uri ? (
              <Pressable onPress={() => setShowPhoto(true)}>
                <Image source={{ uri: base.image_uri }} style={{ width: 52, height: 70, borderRadius: 8, backgroundColor: theme.cardAlt }} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Store</Text>
              <TextInput
                value={store}
                onChangeText={setStore}
                placeholder="Where did you buy it?"
                placeholderTextColor={theme.inkFaint}
                style={[styles.input, { fontSize: 16 }]}
              />
            </View>
          </View>
          {stores.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }}>
              {stores.map((s) => (
                <Chip key={s} label={s} active={s.toLowerCase() === store.trim().toLowerCase()} onPress={() => setStore(s)} />
              ))}
            </ScrollView>
          ) : null}

          <Text style={[styles.label, { marginTop: 12 }]}>Date</Text>
          <View style={[styles.row, { gap: 6, flexWrap: 'wrap' }]}>
            <Chip label="Today" active={date === today} onPress={() => setDate(today)} />
            <Chip label="Yesterday" active={date === yesterday} onPress={() => setDate(yesterday)} />
            <Chip label="− 1 day" onPress={() => setDate(addDays(date, -1))} />
            {date !== today && date !== yesterday ? <Chip label={prettyDate(date, true)} active onPress={() => {}} /> : null}
          </View>
        </Card>

        {/* Quick add */}
        <SectionTitle right={<Text style={styles.muted}>{items.length} {items.length === 1 ? 'item' : 'items'} · {money(itemsSum, currency)}</Text>}>
          Items
        </SectionTitle>
        <Card style={{ borderColor: theme.accent, borderWidth: 1.5 }}>
          <TextInput
            ref={nameRef}
            value={qName}
            onChangeText={setQName}
            placeholder="Add an item, e.g. milk"
            placeholderTextColor={theme.inkFaint}
            returnKeyType="next"
            onSubmitEditing={() =>
              suggestions[0] && !qPrice
                ? addItem(suggestions[0].name, suggestions[0].last_price != null ? round2(suggestions[0].last_price) : null, qQty, suggestions[0])
                : priceRef.current?.focus()
            }
            style={[styles.input, { fontSize: 16, fontWeight: '600' }]}
          />
          {suggestions.length ? (
            <View style={{ marginTop: 6 }}>
              {suggestions.map((k) => (
                <Pressable
                  key={k.item_key}
                  onPress={() => addItem(k.name, k.last_price != null ? round2(k.last_price) : null, qQty, k)}
                  style={({ pressed }) => [
                    styles.row,
                    { gap: 10, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 8, backgroundColor: pressed ? theme.cardAlt : 'transparent' },
                  ]}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: categoryColor(k.category) }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.body, { fontWeight: '600' }]} numberOfLines={1}>{k.name}</Text>
                    <Text style={[styles.hint, { marginTop: 0 }]}>bought {k.times}× · last {prettyDate(k.last_date)}</Text>
                  </View>
                  <Text style={[styles.body, { fontWeight: '700' }]}>{k.last_price != null ? k.last_price.toFixed(2) : ''}</Text>
                  <Ionicons name="add-circle" size={26} color={theme.accent} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {qName.trim() ? (
            <View style={[styles.row, { gap: 8, marginTop: 8 }]}>
              <Stepper value={qQty} onMinus={() => setQQty((q) => Math.max(1, q - 1))} onPlus={() => setQQty((q) => q + 1)} />
              <TextInput
                ref={priceRef}
                value={qPrice}
                onChangeText={setQPrice}
                placeholder="Price each"
                placeholderTextColor={theme.inkFaint}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={addFromBar}
                style={[styles.input, { flex: 1, minWidth: 0, fontSize: 16 }]}
              />
              <Pressable onPress={addFromBar} style={{ backgroundColor: theme.accent, borderRadius: 10, padding: 11 }}>
                <Ionicons name="add" size={22} color="#fff" />
              </Pressable>
            </View>
          ) : frequent.length ? (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.hint, { marginTop: 0, marginBottom: 6 }]}>Or tap what you usually buy:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {frequent.map((k) => (
                  <Chip
                    key={k.item_key}
                    label={`${k.name}${k.last_price != null ? ` · ${k.last_price.toFixed(2)}` : ''}`}
                    dot={categoryColor(k.category)}
                    onPress={() => addItem(k.name, k.last_price != null ? round2(k.last_price) : null, 1, k)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </Card>

        {/* Item list */}
        {items.map((it) => {
          const expanded = open === it.key;
          const missing = toNum(it.total) == null;
          return (
            <Card key={it.key} style={[{ paddingVertical: 10 }, missing && { borderColor: theme.accent }]}>
              <View style={[styles.row, { gap: 10 }]}>
                <Pressable onPress={() => setOpen(expanded ? null : it.key)} style={{ flex: 1 }}>
                  <View style={[styles.row, { gap: 6 }]}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: categoryColor(it.category) }} />
                    <Text style={[styles.body, { fontWeight: '700', flex: 1 }]} numberOfLines={expanded ? 3 : 1}>
                      {it.name || 'Unnamed item'}
                    </Text>
                  </View>
                  <Text style={[styles.hint, { marginTop: 2, color: missing ? theme.accent : theme.inkFaint }]} numberOfLines={1}>
                    {missing ? 'Tap to add a price' : `${toNum(it.unitPrice) != null ? `${toNum(it.unitPrice)!.toFixed(2)} each · ` : ''}${it.category}`}
                  </Text>
                </Pressable>
                {it.unit ? (
                  <Text style={[styles.muted, { fontWeight: '700' }]}>
                    {it.qty} {it.unit}
                  </Text>
                ) : (
                  <Stepper small value={toNum(it.qty) ?? 1} onMinus={() => step(it.key, -1)} onPlus={() => step(it.key, 1)} />
                )}
                <Text style={[styles.body, { fontWeight: '800', minWidth: 54, textAlign: 'right' }]}>
                  {missing ? '—' : (toNum(it.total) ?? 0).toFixed(2)}
                </Text>
              </View>

              {expanded ? (
                <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 }}>
                  <TextInput
                    value={it.name}
                    onChangeText={(t) => update(it.key, { name: t })}
                    placeholder="Item name"
                    placeholderTextColor={theme.inkFaint}
                    style={[styles.input, { fontWeight: '700' }]}
                  />
                  <Pressable onPress={() => setCatFor(it.key)} style={[styles.row, { gap: 6, marginVertical: 10 }]}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: categoryColor(it.category) }} />
                    <Text style={{ color: theme.inkSoft, fontWeight: '700' }}>{it.category}</Text>
                    <Ionicons name="chevron-down" size={14} color={theme.inkSoft} />
                  </Pressable>
                  <View style={[styles.row, { gap: 8 }]}>
                    <MiniField label="Qty" value={it.qty} onChange={(v) => update(it.key, { qty: v })} />
                    <MiniField label="Unit" value={it.unit} onChange={(v) => update(it.key, { unit: v })} placeholder="pcs" numeric={false} />
                    <MiniField label="Price each" value={it.unitPrice} onChange={(v) => update(it.key, { unitPrice: v })} />
                    <MiniField label="Line total" value={it.total} onChange={(v) => update(it.key, { total: v })} bold />
                  </View>
                  <View style={[styles.row, { justifyContent: 'space-between', marginTop: 8 }]}>
                    <Button title="Remove" icon="trash-outline" kind="ghost" onPress={() => removeItem(it.key)} />
                    <Button title="Done" kind="secondary" onPress={() => setOpen(null)} />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}

        {/* Totals */}
        <Card style={{ marginTop: 6 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[styles.section, { fontSize: 18 }]}>Total</Text>
            {editTotal ? (
              <TextInput
                value={totalOverride ?? String(autoTotal)}
                onChangeText={setTotalOverride}
                keyboardType="decimal-pad"
                autoFocus
                onBlur={() => setEditTotal(false)}
                style={[styles.input, { width: 130, textAlign: 'right', fontSize: 20, fontWeight: '800' }]}
              />
            ) : (
              <Pressable onPress={() => setEditTotal(true)} style={[styles.row, { gap: 6 }]}>
                <Text style={{ fontSize: 24, fontWeight: '800', color: theme.ink }}>{money(totalNum, currency)}</Text>
                <Ionicons name="pencil" size={14} color={theme.inkFaint} />
              </Pressable>
            )}
          </View>
          <Text style={styles.hint}>
            {totalOverride == null ? 'Adds up by itself from your items. Tap to change it.' : 'As printed on the receipt. Tap to change it.'}
          </Text>
          {mismatch ? (
            <View style={{ backgroundColor: theme.accentSoft, borderRadius: 10, padding: 10, marginTop: 8 }}>
              <Text style={[styles.body, { fontSize: 14 }]}>
                The items add up to {money(autoTotal, currency)}, but the total says {money(totalNum, currency)}. A line may be missing or misread.
              </Text>
              <Button title="Use the items total" kind="ghost" onPress={() => setTotalOverride(null)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null}

          <Pressable onPress={() => setShowMore((v) => !v)} style={[styles.row, { gap: 6, marginTop: 12 }]}>
            <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={theme.accent} />
            <Text style={{ color: theme.accent, fontWeight: '700' }}>More details (VAT, discount, payment, note)</Text>
          </Pressable>
          {showMore ? (
            <View style={{ marginTop: 10 }}>
              <View style={[styles.row, { gap: 10 }]}>
                <Field label="VAT / tax" value={tax} onChangeText={setTax} keyboardType="decimal-pad" style={{ flex: 1 }} />
                <Field label="Receipt discount" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" style={{ flex: 1 }} />
              </View>
              <View style={[styles.row, { gap: 10 }]}>
                <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={{ flex: 1 }} />
                <Field label="Time" value={time} onChangeText={setTime} placeholder="HH:MM" style={{ flex: 1 }} />
              </View>
              <View style={[styles.row, { gap: 10 }]}>
                <Field label="Payment" value={payment} onChangeText={setPayment} placeholder="cash, card…" style={{ flex: 1 }} />
                <Field label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" style={{ flex: 1 }} />
              </View>
              <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
            </View>
          ) : null}
        </Card>

        <Button title={isNew ? 'Save' : 'Save changes'} icon="checkmark" onPress={onSave} loading={saving} style={{ marginTop: 8 }} />
        {!isNew ? <Button title="Delete receipt" icon="trash-outline" kind="danger" onPress={onDelete} style={{ marginTop: 10 }} /> : null}
      </Screen>

      <Modal visible={catFor != null} transparent animationType="slide" onRequestClose={() => setCatFor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={() => setCatFor(null)} />
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', padding: 16 }}>
          <Text style={[styles.section, { marginBottom: 8 }]}>Category</Text>
          <ScrollView>
            {CATEGORIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  if (catFor != null) update(catFor, { category: c });
                  setCatFor(null);
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

      <Modal visible={showPhoto} onRequestClose={() => setShowPhoto(false)} animationType="fade">
        <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={() => setShowPhoto(false)}>
          {base?.image_uri ? <Image source={{ uri: base.image_uri }} style={{ flex: 1 }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </>
  );
}

function capitalise(s: string) {
  const t = s.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Chip({ label, active, onPress, dot }: { label: string; active?: boolean; onPress: () => void; dot?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 99,
        backgroundColor: active ? theme.ink : pressed ? theme.cardAlt : theme.card,
        borderWidth: 1,
        borderColor: active ? theme.ink : theme.border,
      })}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text style={{ color: active ? '#fff' : theme.ink, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Stepper({ value, onMinus, onPlus, small }: { value: number; onMinus: () => void; onPlus: () => void; small?: boolean }) {
  const size = small ? 30 : 40;
  const btn = { width: size, height: size, borderRadius: size / 2, backgroundColor: theme.cardAlt, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={[styles.row, { gap: small ? 6 : 8 }]}>
      <Pressable onPress={onMinus} hitSlop={6} style={btn}>
        <Ionicons name="remove" size={small ? 16 : 20} color={theme.ink} />
      </Pressable>
      <Text style={{ minWidth: small ? 18 : 22, textAlign: 'center', fontWeight: '800', fontSize: small ? 15 : 17, color: theme.ink }}>
        {Number.isInteger(value) ? value : value.toFixed(2)}
      </Text>
      <Pressable onPress={onPlus} hitSlop={6} style={btn}>
        <Ionicons name="add" size={small ? 16 : 20} color={theme.ink} />
      </Pressable>
    </View>
  );
}

function MiniField({
  label,
  value,
  onChange,
  placeholder,
  numeric = true,
  bold,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  bold?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.hint, { marginTop: 0, marginBottom: 3 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.inkFaint}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        style={[styles.input, { paddingHorizontal: 8, paddingVertical: 8, fontSize: 14 }, bold && { fontWeight: '800' }]}
      />
    </View>
  );
}
