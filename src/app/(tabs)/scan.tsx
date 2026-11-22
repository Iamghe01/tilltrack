import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, View } from 'react-native';
import { Button, Card, H1, Ionicons, Screen, SectionTitle, styles } from '../../components/ui';
import { AiError, hasAiKey } from '../../lib/ai';
import { setPendingDraft } from '../../lib/draft';
import { runScan, type ScanStage } from '../../lib/scanPipeline';
import { loadSettings } from '../../lib/settings';
import { toISODate } from '../../lib/stats';
import { theme } from '../../lib/theme';

type Step = 'idle' | ScanStage | 'error';

const STAGE_TEXT: Record<ScanStage, [string, string]> = {
  preparing: ['Preparing the photo…', ''],
  reading: ['Reading the text on your phone…', 'This takes about a second and works offline.'],
  ai: ['Tidying up the items…', 'The AI is matching names, prices and categories. Usually 3–10 seconds.'],
  'photo-ai': ['Reading the photo with AI…', 'The text was hard to read, so the AI is looking at the whole photo. This can take up to a minute.'],
};

/** Shrinks the photo and keeps a copy for the receipt. 1600 px wide is sharp enough for text and quick to process. */
async function prepareImage(uri: string) {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1600 });
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });

  const dir = new Directory(Paths.document, 'receipts');
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, `receipt-${Date.now()}.jpg`);
  await new File(saved.uri).copy(dest);
  return { base64: saved.base64 ?? '', uri: dest.uri };
}

export default function Scan() {
  const db = useSQLiteContext();
  const [step, setStep] = useState<Step>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [lastPick, setLastPick] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadSettings(db).then((st) => setNeedsKey(!hasAiKey(st)));
    }, [db]),
  );

  const busy = step !== 'idle' && step !== 'error';
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [busy]);

  async function process(uri: string) {
    setPreview(uri);
    setLastPick(uri);
    setError(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      setStep('preparing');
      const settings = await loadSettings(db);
      const img = await prepareImage(uri);
      const res = await runScan(db, settings, img, setStep, ctrl.signal);
      if (ctrl.signal.aborted) return;
      res.draft.image_uri = img.uri;
      setPendingDraft(res.draft, res.warnings, res.info);
      setStep('idle');
      setPreview(null);
      router.push({ pathname: '/receipt/[id]', params: { id: 'new' } });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const err = e instanceof AiError ? e : new AiError((e as Error).message || 'Something went wrong.');
      setError({ message: err.message, hint: err.hint });
      setStep('error');
    }
  }

  function cancel() {
    abort.current?.abort();
    setStep('idle');
    setPreview(null);
  }

  async function fromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Android settings to scan receipts.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true });
    if (!r.canceled && r.assets[0]) process(r.assets[0].uri);
  }

  async function fromGallery() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: true });
    if (!r.canceled && r.assets[0]) process(r.assets[0].uri);
  }

  async function manual() {
    const settings = await loadSettings(db);
    setPendingDraft({
      store: null,
      date: toISODate(new Date()),
      time: null,
      subtotal: null,
      tax: null,
      discount: null,
      total: 0,
      currency: settings.currency,
      payment_method: null,
      image_uri: null,
      note: null,
      source: 'manual',
      items: [],
    });
    router.push({ pathname: '/receipt/[id]', params: { id: 'new' } });
  }

  return (
    <Screen>
      <H1 sub="Take a photo and every line is filled in for you">Scan a receipt</H1>

      {busy || step === 'error' ? (
        <Card style={{ alignItems: 'center' }}>
          {preview ? (
            <Image source={{ uri: preview }} style={{ width: '100%', height: 260, borderRadius: 12, backgroundColor: theme.cardAlt }} resizeMode="contain" />
          ) : null}
          {busy ? (
            <View style={{ alignItems: 'center', marginTop: 16, width: '100%' }}>
              <ActivityIndicator color={theme.accent} size="large" />
              <Text style={[styles.body, { fontWeight: '700', marginTop: 10 }]}>{STAGE_TEXT[step as ScanStage][0]}</Text>
              <Text style={[styles.hint, { textAlign: 'center' }]}>{STAGE_TEXT[step as ScanStage][1]}</Text>
              <Text style={[styles.muted, { marginTop: 6, fontVariant: ['tabular-nums'] }]}>{elapsed} s</Text>
              <Button title="Cancel" kind="ghost" onPress={cancel} style={{ marginTop: 4 }} />
            </View>
          ) : (
            <View style={{ alignItems: 'center', marginTop: 14, width: '100%' }}>
              <Ionicons name="alert-circle" size={30} color={theme.accent} />
              <Text style={[styles.body, { fontWeight: '700', marginTop: 6, textAlign: 'center' }]}>{error?.message}</Text>
              {error?.hint ? <Text style={[styles.muted, { textAlign: 'center', marginTop: 4 }]}>{error.hint}</Text> : null}
              <View style={[styles.row, { gap: 10, marginTop: 14 }]}>
                {lastPick ? <Button title="Try again" icon="refresh" onPress={() => process(lastPick)} /> : null}
                <Button title="Cancel" kind="secondary" onPress={cancel} />
              </View>
              <Button title="Type it in instead" icon="create-outline" kind="ghost" onPress={() => { cancel(); manual(); }} style={{ marginTop: 6 }} />
            </View>
          )}
        </Card>
      ) : (
        <>
          {needsKey ? (
            <Card style={{ backgroundColor: theme.warnSoft, borderColor: theme.warnSoft }}>
              <View style={[styles.row, { gap: 10, alignItems: 'flex-start' }]}>
                <Ionicons name="key-outline" size={22} color={theme.warn} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.body, { fontWeight: '700' }]}>Tip: add your free AI key</Text>
                  <Text style={[styles.muted, { marginTop: 2 }]}>
                    Scanning works offline, but a free Gemini key makes names and categories much more accurate.
                  </Text>
                  <Button title="Add key in Settings" kind="ghost" icon="arrow-forward" onPress={() => router.navigate('/settings')} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                </View>
              </View>
            </Card>
          ) : null}
          <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
            <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="camera" size={40} color={theme.accent} />
            </View>
            <Button title="Take a photo" icon="camera" onPress={fromCamera} style={{ marginTop: 18, alignSelf: 'stretch' }} />
            <Button title="Choose from gallery" icon="images" kind="secondary" onPress={fromGallery} style={{ marginTop: 10, alignSelf: 'stretch' }} />
            <Button title="Enter it manually" icon="create-outline" kind="ghost" onPress={manual} style={{ marginTop: 6 }} />
          </Card>

          <SectionTitle>Tips for a clean scan</SectionTitle>
          {[
            ['sunny-outline', 'Use good light and avoid shadows across the text.'],
            ['scan-outline', 'Lay the receipt flat, then crop to just the receipt when asked.'],
            ['resize-outline', 'For long receipts, take two photos and scan each one.'],
            ['checkmark-done-outline', 'Check the results before saving. You can fix any line that was misread.'],
          ].map(([icon, text]) => (
            <Card key={text} style={[styles.row, { gap: 12 }]}>
              <Ionicons name={icon as 'sunny-outline'} size={22} color={theme.accent} />
              <Text style={[styles.body, { flex: 1 }]}>{text}</Text>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
