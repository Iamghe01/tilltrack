import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, View } from 'react-native';
import { Button, Card, H1, Ionicons, Screen, SectionTitle, styles } from '../../components/ui';
import { AiError, extractReceipt } from '../../lib/ai';
import { setPendingDraft } from '../../lib/draft';
import { loadSettings } from '../../lib/settings';
import { toISODate } from '../../lib/stats';
import { theme } from '../../lib/theme';

type Step = 'idle' | 'preparing' | 'reading' | 'error';

/** Shrinks the photo (smaller uploads are faster and use less free quota) and keeps a copy for the receipt. */
async function prepareImage(uri: string) {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1600 });
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.75, base64: true });

  const dir = new Directory(Paths.document, 'receipts');
  dir.create({ idempotent: true, intermediates: true });
  const dest = new File(dir, `receipt-${Date.now()}.jpg`);
  await new File(saved.uri).copy(dest);
  return { base64: saved.base64 ?? '', storedUri: dest.uri };
}

export default function Scan() {
  const db = useSQLiteContext();
  const [step, setStep] = useState<Step>('idle');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [lastPick, setLastPick] = useState<string | null>(null);

  async function process(uri: string) {
    setPreview(uri);
    setLastPick(uri);
    setError(null);
    try {
      setStep('preparing');
      const settings = await loadSettings(db);
      const img = await prepareImage(uri);
      setStep('reading');
      const res = await extractReceipt(settings, img.base64);
      res.draft.image_uri = img.storedUri;
      const info = `${res.model ?? 'AI'} via ${res.via}`;
      setPendingDraft(res.draft, res.warnings, info);
      setStep('idle');
      setPreview(null);
      router.push({ pathname: '/receipt/[id]', params: { id: 'new' } });
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError((e as Error).message || 'Something went wrong.');
      setError({ message: err.message, hint: err.hint });
      setStep('error');
    }
  }

  async function fromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access needed', 'Allow camera access in Android settings to scan receipts.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!r.canceled && r.assets[0]) process(r.assets[0].uri);
  }

  async function fromGallery() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
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
      items: [{ name: '', category: 'Groceries', quantity: 1, unit: null, unit_price: null, total_price: 0 }],
    });
    router.push({ pathname: '/receipt/[id]', params: { id: 'new' } });
  }

  const busy = step === 'preparing' || step === 'reading';

  return (
    <Screen>
      <H1 sub="Take a photo and the AI fills in every line for you">Scan a receipt</H1>

      {busy || step === 'error' ? (
        <Card style={{ alignItems: 'center' }}>
          {preview ? (
            <Image source={{ uri: preview }} style={{ width: '100%', height: 260, borderRadius: 12, backgroundColor: theme.cardAlt }} resizeMode="contain" />
          ) : null}
          {busy ? (
            <View style={{ alignItems: 'center', marginTop: 16 }}>
              <ActivityIndicator color={theme.accent} size="large" />
              <Text style={[styles.body, { fontWeight: '700', marginTop: 10 }]}>
                {step === 'preparing' ? 'Preparing the photo…' : 'Reading the receipt…'}
              </Text>
              <Text style={[styles.hint, { textAlign: 'center' }]}>
                {step === 'reading' ? 'The AI is reading every line. This usually takes 5–40 seconds.' : ''}
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center', marginTop: 14, width: '100%' }}>
              <Ionicons name="alert-circle" size={30} color={theme.accent} />
              <Text style={[styles.body, { fontWeight: '700', marginTop: 6, textAlign: 'center' }]}>{error?.message}</Text>
              {error?.hint ? <Text style={[styles.muted, { textAlign: 'center', marginTop: 4 }]}>{error.hint}</Text> : null}
              <View style={[styles.row, { gap: 10, marginTop: 14 }]}>
                {lastPick ? <Button title="Try again" icon="refresh" onPress={() => process(lastPick)} /> : null}
                <Button title="Cancel" kind="secondary" onPress={() => { setStep('idle'); setPreview(null); }} />
              </View>
            </View>
          )}
        </Card>
      ) : (
        <>
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
            ['scan-outline', 'Lay the receipt flat and fill the frame with it.'],
            ['resize-outline', 'For long receipts, take two photos and scan each one.'],
            ['checkmark-done-outline', "Check the results before saving. You can fix any line the AI got wrong."],
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
