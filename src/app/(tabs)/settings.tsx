import { File, Paths } from 'expo-file-system';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, Field, H1, Screen, SectionTitle, Segmented, styles } from '../../components/ui';
import { AiError, testConnection } from '../../lib/ai';
import { clearAll, countSampleReceipts, exportCsv, loadSampleData, removeSampleData } from '../../lib/db';
import { buildSampleReceipts, SAMPLE_NOTE } from '../../lib/sample';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../../lib/settings';
import { theme } from '../../lib/theme';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [budget, setBudget] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sampleCount, setSampleCount] = useState(0);
  const [sampleBusy, setSampleBusy] = useState(false);

  const ready = useRef(false);

  useFocusEffect(
    useCallback(() => {
      ready.current = false;
      loadSettings(db).then((x) => {
        setS(x);
        setBudget(x.monthlyBudget ? String(x.monthlyBudget) : '');
        setTimeout(() => (ready.current = true), 0);
      });
      countSampleReceipts(db, SAMPLE_NOTE).then(setSampleCount);
    }, [db]),
  );

  const set = (patch: Partial<Settings>) => {
    setS((cur) => ({ ...cur, ...patch }));
    setSaved(false);
  };

  // Changes save themselves shortly after you stop typing.
  useEffect(() => {
    if (!ready.current) return;
    const t = setTimeout(() => onSave(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, budget]);

  function current(): Settings {
    const b = Number(budget.replace(',', '.'));
    return {
      ...s,
      baseUrl: s.baseUrl.trim(),
      apiKey: s.apiKey.trim(),
      geminiKey: s.geminiKey.trim(),
      geminiModel: s.geminiModel.trim() || 'gemini-flash-latest',
      model: s.model.trim() || 'auto',
      currency: s.currency.trim().toUpperCase() || 'AED',
      monthlyBudget: Number.isFinite(b) && b > 0 ? b : 0,
    };
  }

  async function onSave() {
    const next = current();
    await saveSettings(db, next);
    setSaved(true);
  }

  async function onTest() {
    setTesting(true);
    setStatus(null);
    try {
      const msg = await testConnection(current());
      setStatus({ ok: true, text: msg });
    } catch (e) {
      const err = e as AiError;
      setStatus({ ok: false, text: err.hint ? `${err.message} ${err.hint}` : err.message });
    } finally {
      setTesting(false);
    }
  }

  async function onExport() {
    const csv = await exportCsv(db);
    const f = new File(Paths.cache, `tilltrack-${new Date().toISOString().slice(0, 10)}.csv`);
    f.create({ overwrite: true });
    await f.write(csv);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: 'Export purchases' });
    else Alert.alert('Saved', f.uri);
  }

  function onClear() {
    Alert.alert('Delete all receipts?', "This removes every receipt and item from this phone. It can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete everything', style: 'destructive', onPress: async () => { await clearAll(db); setSampleCount(0); } },
    ]);
  }

  return (
    <Screen>
      <H1 sub="Connection, budget and your data">Settings</H1>

      <SectionTitle>AI that reads your receipts</SectionTitle>
      <Card>
        <Segmented
          value={s.provider}
          onChange={(v) => {
            set({ provider: v });
            setStatus(null);
          }}
          options={[
            { value: 'gemini', label: 'Gemini (simple)' },
            { value: 'freellmapi', label: 'FreeLLMAPI' },
          ]}
        />
        <Text style={[styles.hint, { marginBottom: 12 }]}>
          {s.provider === 'gemini'
            ? 'The app talks to Google Gemini directly. You only need a free API key, no server.'
            : 'The app talks to your own FreeLLMAPI server, which can switch between many free AI providers.'}
        </Text>

        {s.provider === 'gemini' ? (
          <>
            <Field
              label="Gemini API key"
              value={s.geminiKey}
              onChangeText={(v) => set({ geminiKey: v })}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="AIza..."
              hint="Free from aistudio.google.com/apikey. Sign in with Google, tap Create API key, then copy and paste it here."
            />
            <Field
              label="Model"
              value={s.geminiModel}
              onChangeText={(v) => set({ geminiModel: v })}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="gemini-flash-latest"
              hint="Leave this as gemini-flash-latest. It always points at Google's current Flash model."
            />
          </>
        ) : (
          <>
            <Field
              label="Server address"
              value={s.baseUrl}
              onChangeText={(v) => set({ baseUrl: v })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.1.100:3001/v1"
              hint="If FreeLLMAPI runs in Termux on this phone, use http://127.0.0.1:3001/v1. If it runs on a computer, use that computer's Wi-Fi IP address and start FreeLLMAPI with HOST_BIND=0.0.0.0."
            />
            <Field
              label="API key"
              value={s.apiKey}
              onChangeText={(v) => set({ apiKey: v })}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="freellmapi-..."
              hint="The unified key from the top of the Keys page in the FreeLLMAPI dashboard."
            />
            <Field
              label="Model"
              value={s.model}
              onChangeText={(v) => set({ model: v })}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="auto"
              hint='Leave as "auto" and the router picks a free vision model. Turn on at least one model with the Vision badge in FreeLLMAPI.'
            />
          </>
        )}
        <Button title="Test connection" icon="pulse" kind="secondary" onPress={onTest} loading={testing} />
        {status ? (
          <Text style={{ marginTop: 10, color: status.ok ? theme.good : theme.accent, fontWeight: '700', lineHeight: 20 }}>{status.text}</Text>
        ) : null}
      </Card>

      <SectionTitle>Money</SectionTitle>
      <Card>
        <View style={[styles.row, { gap: 10 }]}>
          <Field label="Currency" value={s.currency} onChangeText={(v) => set({ currency: v })} autoCapitalize="characters" style={{ flex: 1 }} />
          <Field
            label="Monthly budget"
            value={budget}
            onChangeText={(v) => {
              setBudget(v);
              setSaved(false);
            }}
            keyboardType="decimal-pad"
            placeholder="none"
            style={{ flex: 1 }}
          />
        </View>
        <Text style={styles.label}>Week starts on</Text>
        <Segmented
          value={String(s.weekStartsOn) as '0' | '1' | '6'}
          onChange={(v) => set({ weekStartsOn: Number(v) })}
          options={[
            { value: '1', label: 'Monday' },
            { value: '6', label: 'Saturday' },
            { value: '0', label: 'Sunday' },
          ]}
        />
      </Card>

      <Text style={[styles.hint, { textAlign: 'center', marginTop: 0 }]}>{saved ? '✓ Changes saved' : 'Changes save automatically'}</Text>

      <SectionTitle>Your data</SectionTitle>
      <Card>
        <Text style={[styles.muted, { marginBottom: 10 }]}>
          Receipts and photos are stored on this phone. When you scan, the photo is sent to Google Gemini (or to your FreeLLMAPI server, which passes it on to a free AI provider) to be read. On Gemini's free tier, Google may use what you send to improve its products.
        </Text>
        <Button
          title={sampleCount ? `Remove ${sampleCount} sample receipts` : 'Load sample receipts'}
          icon={sampleCount ? 'close-circle-outline' : 'sparkles-outline'}
          kind="secondary"
          loading={sampleBusy}
          onPress={async () => {
            setSampleBusy(true);
            if (sampleCount) await removeSampleData(db, SAMPLE_NOTE);
            else await loadSampleData(db, buildSampleReceipts());
            setSampleCount(await countSampleReceipts(db, SAMPLE_NOTE));
            setSampleBusy(false);
          }}
          style={{ marginBottom: 10 }}
        />
        <Button title="Export to CSV" icon="download-outline" kind="secondary" onPress={onExport} />
        <Button title="Delete all data" icon="trash-outline" kind="danger" onPress={onClear} style={{ marginTop: 10 }} />
      </Card>
    </Screen>
  );
}
