import * as Clipboard from 'expo-clipboard';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { Button, Card, Ionicons, Screen, SectionTitle, styles } from '../components/ui';
import { setPendingDraft } from '../lib/draft';
import { interpretPaste, promptForOtherApp } from '../lib/pasteImport';
import { runTextImport } from '../lib/scanPipeline';
import { loadSettings } from '../lib/settings';
import { theme } from '../lib/theme';

export default function Paste() {
  const db = useSQLiteContext();
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copyPrompt() {
    const s = await loadSettings(db);
    await Clipboard.setStringAsync(promptForOtherApp(s.currency));
    setCopied(true);
  }

  async function pasteClipboard() {
    const t = await Clipboard.getStringAsync();
    if (!t.trim()) return Alert.alert('Nothing to paste', 'Copy the receipt text or the AI answer first, then come back.');
    setText(t);
  }

  async function arrange() {
    const settings = await loadSettings(db);
    const r = interpretPaste(text, settings.currency);
    if (r.kind === 'empty') return Alert.alert('Nothing to arrange', 'Paste the receipt text first.');
    setBusy(true);
    try {
      if (r.kind === 'ready') {
        setPendingDraft(r.draft, r.warnings, 'Imported from your AI app');
      } else {
        const res = await runTextImport(db, settings, r.rows);
        if (!res.draft.items.length && !res.background) {
          setBusy(false);
          return Alert.alert(
            "Couldn't find any items",
            'Check that the prices were copied too. For the best result, use the AI app method in step 1.',
          );
        }
        setPendingDraft(res.draft, res.warnings, res.info, res.background);
      }
      setText('');
      router.replace({ pathname: '/receipt/[id]', params: { id: 'new' } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Paste a receipt' }} />
      <Screen padTop={false}>
        <Text style={[styles.sub, { marginBottom: 6 }]}>
          Use another app to read the receipt, then paste the result here. TillTrack arranges it into items, prices and VAT.
        </Text>

        <SectionTitle>Option A — with your AI app (most accurate)</SectionTitle>
        <Card>
          {[
            ['1', 'Tap Copy prompt below.'],
            ['2', 'Open Gemini, ChatGPT or Claude. Attach the receipt photo and paste the prompt.'],
            ['3', "Copy the AI's answer and come back here."],
          ].map(([n, t]) => (
            <View key={n} style={[styles.row, { gap: 10, marginBottom: 8, alignItems: 'flex-start' }]}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: theme.accent, fontWeight: '800' }}>{n}</Text>
              </View>
              <Text style={[styles.body, { flex: 1 }]}>{t}</Text>
            </View>
          ))}
          <Button title={copied ? 'Prompt copied ✓' : 'Copy prompt'} icon="copy-outline" kind="secondary" onPress={copyPrompt} />
        </Card>

        <SectionTitle>Option B — with Google Lens</SectionTitle>
        <Card>
          <Text style={styles.body}>
            Open Google Lens (or the camera's text tool), point it at the receipt, tap <Text style={{ fontWeight: '700' }}>Text → Select all → Copy</Text>, and come back here.
          </Text>
        </Card>

        <SectionTitle>Paste here</SectionTitle>
        <Card>
          <Button title="Paste from clipboard" icon="clipboard-outline" onPress={pasteClipboard} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="…or long-press here and choose Paste"
            placeholderTextColor={theme.inkFaint}
            multiline
            textAlignVertical="top"
            style={[styles.input, { minHeight: 140, marginTop: 10, fontSize: 14, fontFamily: 'monospace' }]}
          />
          {text.trim() ? (
            <View style={[styles.row, { gap: 6, marginTop: 6 }]}>
              <Ionicons name="information-circle-outline" size={16} color={theme.inkSoft} />
              <Text style={styles.hint}>
                {/"items"\s*:/.test(text) ? 'Looks like an answer from your AI app. It will be imported exactly.' : `${text.trim().split('\n').length} lines of text. TillTrack will arrange them.`}
              </Text>
            </View>
          ) : null}
          <Button title="Arrange it" icon="sparkles" onPress={arrange} loading={busy} disabled={!text.trim()} style={{ marginTop: 10 }} />
        </Card>
      </Screen>
    </>
  );
}
