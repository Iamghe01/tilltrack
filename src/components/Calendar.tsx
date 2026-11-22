// A simple month calendar in a bottom sheet, for picking a receipt date.
// Future dates are disabled, because a receipt can't be from tomorrow.
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { parseISODate, toISODate } from '../lib/stats';
import { theme } from '../lib/theme';
import { Button, Ionicons, styles } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function CalendarSheet({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: string;
  onPick: (iso: string) => void;
  onClose: () => void;
}) {
  const sel = parseISODate(value);
  const [month, setMonth] = useState(new Date(sel.getFullYear(), sel.getMonth(), 1));
  const today = toISODate(new Date());
  const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  // Monday-first grid
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const go = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const canNext = month < thisMonth;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onShow={() => setMonth(new Date(sel.getFullYear(), sel.getMonth(), 1))}>
      <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={onClose} />
      <View style={{ backgroundColor: theme.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 28 }}>
        <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 12 }]}>
          <Pressable hitSlop={12} onPress={() => go(-1)} style={{ padding: 6 }}>
            <Ionicons name="chevron-back" size={22} color={theme.ink} />
          </Pressable>
          <Text style={[styles.section, { fontSize: 18 }]}>
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </Text>
          <Pressable hitSlop={12} disabled={!canNext} onPress={() => go(1)} style={{ padding: 6 }}>
            <Ionicons name="chevron-forward" size={22} color={canNext ? theme.ink : theme.border} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row' }}>
          {DOW.map((d) => (
            <Text key={d} style={{ flex: 1, textAlign: 'center', color: theme.inkFaint, fontWeight: '700', fontSize: 12, marginBottom: 6 }}>
              {d}
            </Text>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <View key={w} style={{ flexDirection: 'row' }}>
            {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
              if (d == null) return <View key={i} style={{ flex: 1, height: 44 }} />;
              const iso = toISODate(new Date(month.getFullYear(), month.getMonth(), d));
              const future = iso > today;
              const selected = iso === value;
              const isToday = iso === today;
              return (
                <Pressable
                  key={i}
                  disabled={future}
                  onPress={() => {
                    onPick(iso);
                    onClose();
                  }}
                  style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? theme.accent : 'transparent',
                      borderWidth: isToday && !selected ? 1.5 : 0,
                      borderColor: theme.accent,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: selected || isToday ? '800' : '500', color: selected ? '#fff' : future ? theme.border : theme.ink }}>
                      {d}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <Button title="Close" kind="secondary" onPress={onClose} style={{ marginTop: 10 }} />
      </View>
    </Modal>
  );
}
