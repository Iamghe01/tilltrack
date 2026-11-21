import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, Card, Field, Ionicons, Screen, SectionTitle, styles } from '../../components/ui';
import { CATEGORIES, categoryColor } from '../../lib/categories';
import { deleteReceipt, findDuplicate, getReceipt, saveReceipt, type DraftReceipt } from '../../lib/db';
import { takePendingDraft } from '../../lib/draft';
import { money } from '../../lib/format';
import { round2 } from '../../lib/stats';
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
  const [modelInfo, setModelInfo] = useState<string | null>(null);
  const [store, setStore] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [payment, setPayment] = useState('');
  const [total, setTotal] = useState('');
  const [tax, setTax] = useState('');
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<EditItem[]>([]);
  const [catFor, setCatFor] = useState<number | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const didLoad = useRef(false);

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    (async () => {
      let d: DraftReceipt | null = null;
      if (isNew) {
        const p = takePendingDraft();
        if (p) {
          d = p.draft;
          setWarnings(p.warnings);
          setModelInfo(p.modelInfo);
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
      setTotal(toStr(d.total || null));
      setTax(toStr(d.tax));
      setDiscount(toStr(d.discount));
      setNote(d.note ?? '');
      setItems(
        d.items.map((it) => ({
          key: keySeq++,
          name: it.name,
          category: it.category,
          qty: toStr(it.quantity),
          unit: it.unit ?? '',
          unitPrice: toStr(it.unit_price),
          total: toStr(it.total_price || (d!.source === 'manual' ? null : 0)),
        })),
      );
      setLoaded(true);
    })();
  }, [db, id, isNew]);

  const itemsSum = useMemo(() => round2(items.reduce((s, i) => s + (toNum(i.total) ?? 0), 0)), [items]);

  function update(key: number, patch: Partial<EditItem>) {
    setItems((list) =>
      list.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        // Keep the line total in step when quantity or unit price changes.
        if ('qty' in patch || 'unitPrice' in patch) {
          const q = toNum(next.qty);
          const up = toNum(next.unitPrice);
          if (q != null && up != null) next.total = String(round2(q * up));
        }
        return next;
      }),
    );
  }

  function addItem() {
    setItems((l) => [...l, { key: keySeq++, name: '', category: l[l.length - 1]?.category ?? 'Groceries', qty: '1', unit: '', unitPrice: '', total: '' }]);
  }

  async function onSave() {
    const lines = items.filter((i) => i.name.trim());
    if (!lines.length) return Alert.alert('Add at least one item', 'A receipt needs one or more items with a name.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Alert.alert('Check the date', 'Use the format YYYY-MM-DD, for example 2026-11-17.');
    const draft: DraftReceipt = {
      store: store.trim() || null,
      date,
      time: time.trim() || null,
      subtotal: base?.subtotal ?? null,
      tax: toNum(tax),
      discount: toNum(discount),
      total: toNum(total) ?? itemsSum,
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

  if (loaded && !base) {
    return (
      <Screen padTop={false}>
        <Text style={styles.body}>This receipt couldn't be found.</Text>
      </Screen>
    );
  }
  if (!loaded) return <Screen padTop={false}>{null}</Screen>;

  const totalNum = toNum(total);
  const diff = totalNum != null ? round2(totalNum - itemsSum - (toNum(tax) ?? 0) + (toNum(discount) ?? 0)) : 0;
  const diffNoTax = totalNum != null ? round2(totalNum - itemsSum) : 0;
  const mismatch = totalNum != null && Math.abs(diff) > 0.05 && Math.abs(diffNoTax) > 0.05;

  return (
    <>
      <Stack.Screen options={{ title: isNew ? 'Review receipt' : 'Edit receipt' }} />
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
        {modelInfo ? <Text style={[styles.hint, { marginBottom: 8 }]}>Read by {modelInfo}</Text> : null}

        <Card>
          <View style={[styles.row, { gap: 12 }]}>
            {base?.image_uri ? (
              <Pressable onPress={() => setShowPhoto(true)}>
                <Image source={{ uri: base.image_uri }} style={{ width: 64, height: 86, borderRadius: 8, backgroundColor: theme.cardAlt }} />
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              <Field label="Store" value={store} onChangeText={setStore} placeholder="e.g. Carrefour" />
            </View>
          </View>
          <View style={[styles.row, { gap: 10 }]}>
            <Field label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={{ flex: 1 }} />
            <Field label="Time" value={time} onChangeText={setTime} placeholder="HH:MM" style={{ flex: 1 }} />
          </View>
          <View style={[styles.row, { gap: 10 }]}>
            <Field label="Total paid" value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder={String(itemsSum)} style={{ flex: 1 }} />
            <Field label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" style={{ flex: 1 }} />
          </View>
          <View style={[styles.row, { gap: 10 }]}>
            <Field label="VAT / tax" value={tax} onChangeText={setTax} keyboardType="decimal-pad" style={{ flex: 1 }} />
            <Field label="Receipt discount" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" style={{ flex: 1 }} />
          </View>
          <Field label="Payment" value={payment} onChangeText={setPayment} placeholder="cash, card…" />
          <Field label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
        </Card>

        <SectionTitle right={<Text style={styles.muted}>{items.length} lines · {money(itemsSum, currency)}</Text>}>Items</SectionTitle>
        {mismatch ? (
          <Card style={{ backgroundColor: theme.accentSoft, borderColor: theme.accentSoft }}>
            <Text style={[styles.body, { fontSize: 14 }]}>
              The items add up to {money(itemsSum, currency)}, but the total paid is {money(totalNum, currency)}.
            </Text>
            <Button title="Use the items total" kind="ghost" onPress={() => setTotal(String(round2(itemsSum + (toNum(tax) ?? 0) - (toNum(discount) ?? 0))))} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : null}

        {items.map((it) => (
          <Card key={it.key}>
            <View style={[styles.row, { gap: 8 }]}>
              <TextInput
                value={it.name}
                onChangeText={(t) => update(it.key, { name: t })}
                placeholder="Item name"
                placeholderTextColor={theme.inkFaint}
                style={[styles.input, { flex: 1, fontWeight: '700' }]}
              />
              <Pressable hitSlop={10} onPress={() => setItems((l) => l.filter((x) => x.key !== it.key))}>
                <Ionicons name="trash-outline" size={20} color={theme.inkFaint} />
              </Pressable>
            </View>
            <Pressable onPress={() => setCatFor(it.key)} style={[styles.row, { gap: 6, marginVertical: 8 }]}>
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
          </Card>
        ))}
        <Button title="Add an item" icon="add" kind="secondary" onPress={addItem} />

        <View style={{ height: 18 }} />
        <Button title={isNew ? 'Save receipt' : 'Save changes'} icon="checkmark" onPress={onSave} loading={saving} />
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
