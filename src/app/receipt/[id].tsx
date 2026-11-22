import { File } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { CalendarSheet } from '../../components/Calendar';
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
import { recalcLine, type LineField } from '../../lib/lineMath';
import type { BackgroundCheck } from '../../lib/scanPipeline';
import { loadSettings } from '../../lib/settings';
import { addDays, normalizeKey, round2, toISODate, vatFromInclusive } from '../../lib/stats';
import { theme } from '../../lib/theme';

type Mode = 'pcs' | 'kg';

interface EditItem {
  key: number;
  name: string;
  category: string;
  mode: Mode;
  qty: string; // pieces, or weight in kg
  unit: string; // other units (L, g, ml) are kept as typed
  unitPrice: string; // price each, or per kg
  total: string;
  pieces: string; // for weighed items: how many pieces (optional)
}

type AiState =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'applied'; info: string; undo: Snapshot }
  | { kind: 'offer'; result: Extract<BackgroundCheck, { ok: true }> }
  | { kind: 'failed'; reason: string };

interface Snapshot {
  store: string;
  date: string;
  time: string;
  items: EditItem[];
  totalOverride: string | null;
  tax: string;
  vatIncluded: boolean;
  warnings: string[];
}

const toStr = (n: number | null | undefined) => (n == null ? '' : String(n));
const toNum = (s: string) => {
  const n = Number(s.replace(',', '.').replace(/[^0-9.\-]/g, ''));
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};

let keySeq = 1;

function toEditItems(d: DraftReceipt): EditItem[] {
  return d.items.map((it) => {
    const kg = (it.unit ?? '').toLowerCase() === 'kg';
    return {
      key: keySeq++,
      name: it.name,
      category: it.category,
      mode: kg ? 'kg' : 'pcs',
      qty: toStr(it.quantity),
      unit: kg ? '' : it.unit ?? '',
      unitPrice: toStr(it.unit_price),
      total: toStr(it.total_price),
      pieces: toStr(it.pieces ?? null),
    };
  });
}

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
  const [vatIncluded, setVatIncluded] = useState(true);
  const [vatRate, setVatRate] = useState(5);
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<EditItem[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [catFor, setCatFor] = useState<number | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showCal, setShowCal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [known, setKnown] = useState<KnownItem[]>([]);
  const [stores, setStores] = useState<string[]>([]);
  const [editTotal, setEditTotal] = useState(false);
  const [ai, setAi] = useState<AiState>({ kind: 'none' });

  // Quick-add bar
  const [qName, setQName] = useState('');
  const [qMode, setQMode] = useState<Mode>('pcs');
  const [qQty, setQQty] = useState(1);
  const [qWeight, setQWeight] = useState('');
  const [qPrice, setQPrice] = useState('');
  const priceRef = useRef<TextInputInstance>(null);
  const nameRef = useRef<TextInputInstance>(null);
  const didLoad = useRef(false);
  const edited = useRef(false); // set once you change anything, so the AI never overwrites your edits silently
  const alive = useRef(true);
  const touch = () => (edited.current = true);

  useEffect(() => () => void (alive.current = false), []);

  useEffect(() => {
    if (didLoad.current) return;
    didLoad.current = true;
    (async () => {
      const [k, st, settings] = await Promise.all([knownItems(db), recentStores(db), loadSettings(db)]);
      setKnown(k);
      setStores(st);
      setVatRate(settings.vatRate || 0);
      let d: DraftReceipt | null = null;
      let background: Promise<BackgroundCheck> | undefined;
      if (isNew) {
        const p = takePendingDraft();
        if (p) {
          d = p.draft;
          setWarnings(p.warnings);
          setInfo(p.modelInfo);
          background = p.background;
        }
      } else {
        const r = await getReceipt(db, Number(id));
        if (r) d = { ...r.receipt, vat_included: r.receipt.vat_included !== 0, items: r.items };
      }
      if (!d) {
        setLoaded(true);
        return;
      }
      setBase(d);
      applyDraft(d, d.source === 'manual' && isNew);
      setCurrency(d.currency);
      setPayment(d.payment_method ?? '');
      setDiscount(toStr(d.discount));
      setNote(d.note ?? '');
      if (d.discount || d.note || d.payment_method) setShowMore(true);
      setLoaded(true);

      if (background) {
        setAi({ kind: 'checking' });
        background.then((res) => {
          if (!alive.current) return;
          if (!res.ok) {
            setAi({ kind: 'failed', reason: res.reason });
            return;
          }
          if (edited.current) {
            setAi({ kind: 'offer', result: res });
          } else {
            const undo = snapshot();
            applyAi(res);
            setAi({ kind: 'applied', info: res.info, undo });
          }
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, id, isNew]);

  function applyDraft(d: DraftReceipt, autoTotal: boolean) {
    setStore(d.store ?? '');
    setDate(d.date);
    setTime(d.time ?? '');
    setTax(toStr(d.tax));
    setVatIncluded(d.vat_included !== false);
    setTotalOverride(autoTotal ? null : toStr(d.total));
    setItems(toEditItems(d));
  }

  // Latest values for the snapshot taken when the AI result arrives.
  const latest = useRef<Snapshot | null>(null);
  latest.current = { store, date, time, items, totalOverride, tax, vatIncluded, warnings };
  const snapshot = (): Snapshot => ({ ...(latest.current as Snapshot) });

  function applyAi(res: Extract<BackgroundCheck, { ok: true }>) {
    const d = res.draft;
    setStore(d.store || latest.current?.store || '');
    setDate(d.date);
    setTime(d.time ?? latest.current?.time ?? '');
    setTax(toStr(d.tax));
    setVatIncluded(d.vat_included !== false);
    setTotalOverride(toStr(d.total));
    setItems(toEditItems(d));
    setWarnings(res.warnings);
    if (d.payment_method) setPayment(d.payment_method);
    setOpen(null);
  }

  function undoAi(s: Snapshot) {
    setStore(s.store);
    setDate(s.date);
    setTime(s.time);
    setItems(s.items);
    setTotalOverride(s.totalOverride);
    setTax(s.tax);
    setVatIncluded(s.vatIncluded);
    setWarnings(s.warnings);
    setAi({ kind: 'none' });
  }

  // ---------- totals and VAT ----------
  const itemsSum = useMemo(() => round2(items.reduce((s, i) => s + (toNum(i.total) ?? 0), 0)), [items]);
  const disc = toNum(discount) ?? 0;
  const vatTyped = toNum(tax);
  // If the VAT isn't typed in, work it out: inside the prices, or on top of them.
  const vatAuto = vatIncluded ? vatFromInclusive(itemsSum - disc, vatRate) : round2(((itemsSum - disc) * vatRate) / 100);
  const vat = vatTyped ?? vatAuto;
  const autoTotal = round2(itemsSum - disc + (vatIncluded ? 0 : vat));
  const totalNum = totalOverride != null ? toNum(totalOverride) : autoTotal;
  const mismatch =
    totalOverride != null && totalNum != null && Math.abs(totalNum - autoTotal) > 0.05 && Math.abs(totalNum - itemsSum) > 0.05;

  // ---------- suggestions ----------
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

  // ---------- item editing ----------
  function update(key: number, patch: Partial<EditItem>, changed?: LineField) {
    touch();
    setItems((list) => list.map((it) => (it.key !== key ? it : changed ? recalcLine({ ...it, ...patch }, changed) : { ...it, ...patch })));
  }

  function step(key: number, delta: number) {
    touch();
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
        const up = toNum(it.unitPrice) ?? (toNum(it.total) != null && q > 0 ? round2((toNum(it.total) ?? 0) / q) : null);
        out.push({ ...it, qty: String(next), unitPrice: up != null ? String(up) : it.unitPrice, total: up != null ? String(round2(up * next)) : it.total });
      }
      return out;
    });
  }

  function stepPieces(key: number, delta: number) {
    const it = items.find((x) => x.key === key);
    if (!it) return;
    const p = Math.max(0, (toNum(it.pieces) ?? 0) + delta);
    update(key, { pieces: p ? String(p) : '' });
  }

  function setMode(key: number, mode: Mode) {
    const it = items.find((x) => x.key === key);
    if (!it || it.mode === mode) return;
    // Switching keeps the line total; you then type the weight or the count.
    update(key, { mode, qty: mode === 'kg' ? '' : '1', unitPrice: mode === 'kg' ? '' : it.total, pieces: '' });
  }

  function removeItem(key: number) {
    touch();
    setItems((l) => l.filter((x) => x.key !== key));
    if (open === key) setOpen(null);
  }

  function addItem(name: string, opts: { price: number | null; qty?: number; mode?: Mode; weight?: number | null; k?: KnownItem }) {
    const n = name.trim();
    if (!n) return;
    touch();
    const mode: Mode = opts.mode ?? ((opts.k?.unit ?? '').toLowerCase() === 'kg' ? 'kg' : 'pcs');
    const existing = mode === 'pcs' ? items.find((i) => i.mode === 'pcs' && normalizeKey(i.name) === normalizeKey(n)) : undefined;
    if (existing) {
      step(existing.key, opts.qty ?? 1); // adding the same thing again just bumps the quantity
    } else {
      const qty = mode === 'kg' ? opts.weight ?? null : opts.qty ?? 1;
      const price = opts.price;
      const line: EditItem = {
        key: keySeq++,
        name: n,
        category: opts.k?.category ?? guessCategory(n, categoryHistory),
        mode,
        qty: qty != null ? String(qty) : '',
        unit: mode === 'pcs' && opts.k?.unit && opts.k.unit.toLowerCase() !== 'kg' ? opts.k.unit : '',
        unitPrice: price != null ? String(price) : '',
        total: price != null && qty != null ? String(round2(price * qty)) : '',
        pieces: '',
      };
      setItems((l) => [...l, line]);
      // A weighed item without a weight yet: open it so you can type the weight straight away.
      if (mode === 'kg' && qty == null) setOpen(line.key);
    }
    setQName('');
    setQPrice('');
    setQWeight('');
    setQQty(1);
    setQMode('pcs');
  }

  function pickKnown(k: KnownItem) {
    const price = k.last_price != null ? round2(k.last_price) : null;
    const kg = (k.unit ?? '').toLowerCase() === 'kg';
    addItem(k.name, { price, qty: qQty, mode: kg ? 'kg' : 'pcs', weight: kg ? toNum(qWeight) : null, k });
  }

  function addFromBar() {
    if (!qName.trim()) return;
    const exact = known.find((k) => k.item_key === normalizeKey(qName));
    const price = toNum(qPrice) ?? exact?.last_price ?? null;
    addItem(exact?.name ?? capitalise(qName), {
      price: price != null ? round2(price) : null,
      qty: qQty,
      mode: qMode,
      weight: qMode === 'kg' ? toNum(qWeight) : null,
      k: exact,
    });
    nameRef.current?.focus();
  }

  // ---------- save / delete ----------
  async function onSave() {
    const lines = items.filter((i) => i.name.trim());
    if (!lines.length) return Alert.alert('Add at least one item', 'Type an item name above, or tap one of your usual items.');
    const noPrice = lines.find((i) => toNum(i.total) == null);
    if (noPrice) {
      setOpen(noPrice.key);
      return Alert.alert('A price is missing', `"${noPrice.name}" needs a price or line total.`);
    }
    const noWeight = lines.find((i) => i.mode === 'kg' && toNum(i.qty) == null);
    if (noWeight) {
      setOpen(noWeight.key);
      return Alert.alert('A weight is missing', `Type the weight of "${noWeight.name}", or its price per kg.`);
    }
    const draft: DraftReceipt = {
      store: store.trim() || null,
      date,
      time: time.trim() || null,
      subtotal: base?.subtotal ?? null,
      tax: vat ? round2(vat) : null,
      discount: toNum(discount),
      total: totalNum ?? autoTotal,
      currency: currency.trim().toUpperCase() || 'AED',
      payment_method: payment.trim() || null,
      image_uri: base?.image_uri ?? null,
      note: note.trim() || null,
      source: base?.source ?? 'manual',
      vat_included: vatIncluded,
      items: lines.map((i) => ({
        name: i.name.trim(),
        category: i.category,
        quantity: toNum(i.qty) ?? 1,
        unit: i.mode === 'kg' ? 'kg' : i.unit.trim() || null,
        unit_price: toNum(i.unitPrice),
        total_price: toNum(i.total) ?? 0,
        pieces: i.mode === 'kg' ? toNum(i.pieces) : null,
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
  const otherDate = date !== today && date !== yesterday;

  return (
    <>
      <Stack.Screen options={{ title: isNew ? (base?.source === 'scan' ? 'Check receipt' : 'Add purchase') : 'Edit receipt' }} />
      <Screen padTop={false}>
        <AiBanner
          state={ai}
          onApply={() => {
            if (ai.kind !== 'offer') return;
            const undo = snapshot();
            applyAi(ai.result);
            setAi({ kind: 'applied', info: ai.result.info, undo });
          }}
          onDismiss={() => setAi({ kind: 'none' })}
          onUndo={() => ai.kind === 'applied' && undoAi(ai.undo)}
        />

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
                onChangeText={(v) => {
                  touch();
                  setStore(v);
                }}
                placeholder="Where did you buy it?"
                placeholderTextColor={theme.inkFaint}
                style={[styles.input, { fontSize: 16 }]}
              />
            </View>
          </View>
          {stores.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
              {stores.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={s.toLowerCase() === store.trim().toLowerCase()}
                  onPress={() => {
                    touch();
                    setStore(s);
                  }}
                />
              ))}
            </ScrollView>
          ) : null}

          <Text style={[styles.label, { marginTop: 12 }]}>Date</Text>
          <View style={[styles.row, { gap: 6, flexWrap: 'wrap' }]}>
            <Chip label="Today" active={date === today} onPress={() => { touch(); setDate(today); }} />
            <Chip label="Yesterday" active={date === yesterday} onPress={() => { touch(); setDate(yesterday); }} />
            <Chip icon="calendar-outline" label={otherDate ? prettyDate(date, true) : 'Pick a date'} active={otherDate} onPress={() => setShowCal(true)} />
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
            onSubmitEditing={() => (suggestions[0] && !qPrice ? pickKnown(suggestions[0]) : priceRef.current?.focus())}
            style={[styles.input, { fontSize: 16, fontWeight: '600' }]}
          />
          {suggestions.length ? (
            <View style={{ marginTop: 6 }}>
              {suggestions.map((k) => (
                <Pressable
                  key={k.item_key}
                  onPress={() => pickKnown(k)}
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
                  <Text style={[styles.body, { fontWeight: '700' }]}>
                    {k.last_price != null ? `${k.last_price.toFixed(2)}${(k.unit ?? '').toLowerCase() === 'kg' ? '/kg' : ''}` : ''}
                  </Text>
                  <Ionicons name="add-circle" size={26} color={theme.accent} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {qName.trim() ? (
            <>
              <View style={[styles.row, { gap: 6, marginTop: 8 }]}>
                <Toggle value={qMode} onChange={setQMode} />
              </View>
              <View style={[styles.row, { gap: 8, marginTop: 8 }]}>
                {qMode === 'pcs' ? (
                  <Stepper value={qQty} onMinus={() => setQQty((q) => Math.max(1, q - 1))} onPlus={() => setQQty((q) => q + 1)} />
                ) : (
                  <TextInput
                    value={qWeight}
                    onChangeText={setQWeight}
                    placeholder="Weight kg"
                    placeholderTextColor={theme.inkFaint}
                    keyboardType="decimal-pad"
                    style={[styles.input, { width: 110, fontSize: 16 }]}
                  />
                )}
                <TextInput
                  ref={priceRef}
                  value={qPrice}
                  onChangeText={setQPrice}
                  placeholder={qMode === 'kg' ? 'Price per kg' : 'Price each'}
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
            </>
          ) : frequent.length ? (
            <View style={{ marginTop: 10 }}>
              <Text style={[styles.hint, { marginTop: 0, marginBottom: 6 }]}>Or tap what you usually buy:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
                {frequent.map((k) => (
                  <Chip
                    key={k.item_key}
                    label={`${k.name}${k.last_price != null ? ` · ${k.last_price.toFixed(2)}` : ''}`}
                    dot={categoryColor(k.category)}
                    onPress={() => pickKnown(k)}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </Card>

        {/* Item list */}
        {items.map((it) => {
          const expanded = open === it.key;
          const missing = toNum(it.total) == null || (it.mode === 'kg' && toNum(it.qty) == null);
          const kg = it.mode === 'kg';
          const sub = missing
            ? kg && toNum(it.qty) == null
              ? 'Tap to add the weight'
              : 'Tap to add a price'
            : kg
              ? `${toNum(it.qty)} kg × ${toNum(it.unitPrice)?.toFixed(2) ?? '?'}/kg${toNum(it.pieces) ? ` · ${toNum(it.pieces)} pcs` : ''}`
              : `${toNum(it.unitPrice) != null ? `${toNum(it.unitPrice)!.toFixed(2)} each · ` : ''}${it.category}`;
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
                    {sub}
                  </Text>
                </Pressable>
                {kg ? (
                  <Pressable onPress={() => setOpen(expanded ? null : it.key)} style={{ backgroundColor: theme.cardAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
                    <Text style={{ fontWeight: '800', color: theme.ink }}>{toNum(it.qty) != null ? `${toNum(it.qty)} kg` : '? kg'}</Text>
                  </Pressable>
                ) : it.unit ? (
                  <Text style={[styles.muted, { fontWeight: '700' }]}>
                    {it.qty} {it.unit}
                  </Text>
                ) : (
                  <Stepper small value={toNum(it.qty) ?? 1} onMinus={() => step(it.key, -1)} onPlus={() => step(it.key, 1)} />
                )}
                <Text style={[styles.body, { fontWeight: '800', minWidth: 54, textAlign: 'right' }]}>
                  {toNum(it.total) == null ? '—' : (toNum(it.total) ?? 0).toFixed(2)}
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
                  <View style={[styles.row, { justifyContent: 'space-between', marginVertical: 10 }]}>
                    <Pressable onPress={() => setCatFor(it.key)} style={[styles.row, { gap: 6, flex: 1 }]}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: categoryColor(it.category) }} />
                      <Text style={{ color: theme.inkSoft, fontWeight: '700' }} numberOfLines={1}>{it.category}</Text>
                      <Ionicons name="chevron-down" size={14} color={theme.inkSoft} />
                    </Pressable>
                    <Toggle value={it.mode} onChange={(m) => setMode(it.key, m)} />
                  </View>
                  {kg ? (
                    <>
                      <View style={[styles.row, { gap: 8 }]}>
                        <MiniField label="Weight (kg)" value={it.qty} onChange={(v) => update(it.key, { qty: v }, 'qty')} />
                        <MiniField label="Price per kg" value={it.unitPrice} onChange={(v) => update(it.key, { unitPrice: v }, 'unitPrice')} />
                        <MiniField label="Line total" value={it.total} onChange={(v) => update(it.key, { total: v }, 'total')} bold />
                      </View>
                      <View style={[styles.row, { justifyContent: 'space-between', marginTop: 10 }]}>
                        <View>
                          <Text style={[styles.label, { marginBottom: 0 }]}>Pieces</Text>
                          <Text style={[styles.hint, { marginTop: 0 }]}>Optional, e.g. 2 apples</Text>
                        </View>
                        <Stepper small value={toNum(it.pieces) ?? 0} onMinus={() => stepPieces(it.key, -1)} onPlus={() => stepPieces(it.key, 1)} />
                      </View>
                      <Text style={styles.hint}>Fill any two of weight, price per kg and total. The third is worked out.</Text>
                    </>
                  ) : (
                    <View style={[styles.row, { gap: 8 }]}>
                      <MiniField label="Qty" value={it.qty} onChange={(v) => update(it.key, { qty: v }, 'qty')} />
                      <MiniField label="Price each" value={it.unitPrice} onChange={(v) => update(it.key, { unitPrice: v }, 'unitPrice')} />
                      <MiniField label="Line total" value={it.total} onChange={(v) => update(it.key, { total: v }, 'total')} bold />
                    </View>
                  )}
                  <View style={[styles.row, { justifyContent: 'space-between', marginTop: 8 }]}>
                    <Button title="Remove" icon="trash-outline" kind="ghost" onPress={() => removeItem(it.key)} />
                    <Button title="Done" kind="secondary" onPress={() => setOpen(null)} />
                  </View>
                </View>
              ) : null}
            </Card>
          );
        })}

        {/* Totals and VAT */}
        <Card style={{ marginTop: 6 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={[styles.section, { fontSize: 18 }]}>Total</Text>
            {editTotal ? (
              <TextInput
                value={totalOverride ?? String(autoTotal)}
                onChangeText={(v) => {
                  touch();
                  setTotalOverride(v);
                }}
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
                The items come to {money(autoTotal, currency)}, but the total says {money(totalNum, currency)}. A line may be missing or misread.
              </Text>
              <Button title="Use the items total" kind="ghost" onPress={() => setTotalOverride(null)} style={{ alignSelf: 'flex-start' }} />
            </View>
          ) : null}

          {/* VAT */}
          <View style={{ backgroundColor: theme.cardAlt, borderRadius: 12, padding: 12, marginTop: 12 }}>
            <Pressable
              onPress={() => {
                touch();
                setVatIncluded((v) => !v);
              }}
              style={[styles.row, { justifyContent: 'space-between' }]}
            >
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={[styles.body, { fontWeight: '700' }]}>Prices include VAT</Text>
                <Text style={[styles.hint, { marginTop: 0 }]}>
                  {vatIncluded ? 'VAT is already inside the item prices (usual in UAE shops).' : 'VAT is added on top of the item prices.'}
                </Text>
              </View>
              <Switch on={vatIncluded} />
            </Pressable>
            <View style={[styles.row, { justifyContent: 'space-between', marginTop: 10 }]}>
              <Text style={styles.body}>
                VAT {vatRate ? `(${vatRate}%)` : ''} {vatIncluded ? 'included' : 'added'}
              </Text>
              <TextInput
                value={tax}
                onChangeText={(v) => {
                  touch();
                  setTax(v);
                }}
                placeholder={vatAuto.toFixed(2)}
                placeholderTextColor={theme.inkSoft}
                keyboardType="decimal-pad"
                style={[styles.input, { width: 110, textAlign: 'right', fontWeight: '700' }]}
              />
            </View>
            <Text style={styles.hint}>
              {vatTyped == null ? `Worked out at ${vatRate}%. Type the amount from the receipt if it's printed.` : 'As typed from the receipt.'}
            </Text>
          </View>

          <Pressable onPress={() => setShowMore((v) => !v)} style={[styles.row, { gap: 6, marginTop: 12 }]}>
            <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={theme.accent} />
            <Text style={{ color: theme.accent, fontWeight: '700' }}>More details (discount, time, payment, note)</Text>
          </Pressable>
          {showMore ? (
            <View style={{ marginTop: 10 }}>
              <View style={[styles.row, { gap: 10 }]}>
                <Field label="Receipt discount" value={discount} onChangeText={(v) => { touch(); setDiscount(v); }} keyboardType="decimal-pad" style={{ flex: 1 }} />
                <Field label="Time" value={time} onChangeText={(v) => { touch(); setTime(v); }} placeholder="HH:MM" style={{ flex: 1 }} />
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

      <CalendarSheet
        visible={showCal}
        value={date}
        onPick={(d) => {
          touch();
          setDate(d);
        }}
        onClose={() => setShowCal(false)}
      />

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

function AiBanner({ state, onApply, onDismiss, onUndo }: { state: AiState; onApply: () => void; onDismiss: () => void; onUndo: () => void }) {
  if (state.kind === 'none') return null;
  const box = { borderRadius: 12, padding: 12, marginBottom: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 };
  if (state.kind === 'checking') {
    return (
      <View style={[box, { backgroundColor: theme.cardAlt }]}>
        <ActivityIndicator color={theme.accent} />
        <Text style={[styles.body, { flex: 1, fontSize: 14 }]}>The AI is checking this receipt. You can start editing, nothing will be changed without asking.</Text>
      </View>
    );
  }
  if (state.kind === 'applied') {
    return (
      <View style={[box, { backgroundColor: theme.goodSoft }]}>
        <Ionicons name="sparkles" size={20} color={theme.good} />
        <Text style={[styles.body, { flex: 1, fontSize: 14 }]}>Updated by the AI. {state.info}.</Text>
        <Pressable onPress={onUndo} hitSlop={8}>
          <Text style={{ color: theme.good, fontWeight: '800' }}>Undo</Text>
        </Pressable>
      </View>
    );
  }
  if (state.kind === 'offer') {
    return (
      <View style={[box, { backgroundColor: theme.goodSoft, flexWrap: 'wrap' }]}>
        <Ionicons name="sparkles" size={20} color={theme.good} />
        <Text style={[styles.body, { flex: 1, fontSize: 14 }]}>The AI finished checking. Use its version? This replaces your changes.</Text>
        <View style={[styles.row, { gap: 14, width: '100%', justifyContent: 'flex-end' }]}>
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Text style={{ color: theme.inkSoft, fontWeight: '700' }}>Keep mine</Text>
          </Pressable>
          <Pressable onPress={onApply} hitSlop={8}>
            <Text style={{ color: theme.good, fontWeight: '800' }}>Use AI version</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <View style={[box, { backgroundColor: theme.cardAlt }]}>
      <Ionicons name="phone-portrait-outline" size={20} color={theme.inkSoft} />
      <Text style={[styles.body, { flex: 1, fontSize: 14 }]}>The AI couldn't check this one ({state.reason}). Your phone's reading is shown. Please check the lines.</Text>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Ionicons name="close" size={18} color={theme.inkSoft} />
      </Pressable>
    </View>
  );
}

function Chip({ label, active, onPress, dot, icon }: { label: string; active?: boolean; onPress: () => void; dot?: string; icon?: 'calendar-outline' }) {
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
      {icon ? <Ionicons name={icon} size={15} color={active ? '#fff' : theme.ink} /> : null}
      <Text style={{ color: active ? '#fff' : theme.ink, fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Toggle({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: theme.cardAlt, borderRadius: 10, padding: 3 }}>
      {(['pcs', 'kg'] as Mode[]).map((m) => (
        <Pressable
          key={m}
          onPress={() => onChange(m)}
          style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: value === m ? theme.accent : 'transparent' }}
        >
          <Text style={{ fontWeight: '700', color: value === m ? '#fff' : theme.inkSoft, fontSize: 13 }}>{m === 'pcs' ? 'Per piece' : 'By weight'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: on ? theme.good : theme.border, padding: 3, justifyContent: 'center' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignSelf: on ? 'flex-end' : 'flex-start' }} />
    </View>
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

function MiniField({ label, value, onChange, bold }: { label: string; value: string; onChange: (v: string) => void; bold?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.hint, { marginTop: 0, marginBottom: 3 }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholderTextColor={theme.inkFaint}
        keyboardType="decimal-pad"
        style={[styles.input, { paddingHorizontal: 8, paddingVertical: 8, fontSize: 15 }, bold && { fontWeight: '800' }]}
      />
    </View>
  );
}
