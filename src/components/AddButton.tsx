// The floating + button on every tab: Scan, Paste or Type in a receipt.
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { startManual } from '../lib/startManual';
import { theme } from '../lib/theme';
import { Ionicons, styles, type IconName } from './ui';

export function AddButton() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const go = (fn: () => void) => {
    setOpen(false);
    setTimeout(fn, 150);
  };

  const options: { icon: IconName; title: string; sub: string; onPress: () => void }[] = [
    { icon: 'scan', title: 'Scan receipt', sub: 'Camera finds and cleans the receipt for you', onPress: () => go(() => router.push({ pathname: '/scan', params: { start: 'scan' } })) },
    { icon: 'clipboard-outline', title: 'Paste receipt', sub: 'From Google Lens or your AI app', onPress: () => go(() => router.push('/paste')) },
    { icon: 'create-outline', title: 'Type it in', sub: 'Quick entry with your usual items', onPress: () => go(() => startManual(db)) },
    { icon: 'images-outline', title: 'From a photo', sub: 'Pick a receipt photo from your gallery', onPress: () => go(() => router.push('/scan')) },
  ];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Add a receipt"
        style={({ pressed }) => ({
          position: 'absolute',
          right: 18,
          bottom: 70 + insets.bottom,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: theme.accent,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 6,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        <Ionicons name="add" size={34} color="#fff" />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={() => setOpen(false)} />
        <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 24 + insets.bottom }}>
          <Text style={[styles.section, { marginBottom: 10 }]}>Add a receipt</Text>
          {options.map((o) => (
            <Pressable
              key={o.title}
              onPress={o.onPress}
              style={({ pressed }) => [
                styles.row,
                { gap: 14, padding: 14, borderRadius: 14, marginBottom: 8, backgroundColor: pressed ? theme.cardAlt : theme.card, borderWidth: 1, borderColor: theme.border },
              ]}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={o.icon} size={22} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: theme.ink }}>{o.title}</Text>
                <Text style={styles.hint}>{o.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.inkFaint} />
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
  );
}
