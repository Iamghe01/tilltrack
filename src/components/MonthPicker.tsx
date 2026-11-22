// "‹ November 2026 ›" — steps through months; can't go past the current month.
import { Pressable, Text, View } from 'react-native';
import { theme } from '../lib/theme';
import { Ionicons, styles } from './ui';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function MonthPicker({ month, onChange }: { month: Date; onChange: (d: Date) => void }) {
  const now = new Date();
  const atNow = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const go = (n: number) => onChange(new Date(month.getFullYear(), month.getMonth() + n, 1));
  return (
    <View style={[styles.row, { justifyContent: 'space-between', backgroundColor: theme.card, borderRadius: 14, borderWidth: 1, borderColor: theme.border, paddingVertical: 6, paddingHorizontal: 6 }]}>
      <Pressable onPress={() => go(-1)} hitSlop={10} style={{ padding: 8 }}>
        <Ionicons name="chevron-back" size={22} color={theme.ink} />
      </Pressable>
      <Text style={{ fontSize: 17, fontWeight: '800', color: theme.ink }}>
        {MONTHS[month.getMonth()]} {month.getFullYear()}
      </Text>
      <Pressable onPress={() => go(1)} disabled={atNow} hitSlop={10} style={{ padding: 8 }}>
        <Ionicons name="chevron-forward" size={22} color={atNow ? theme.border : theme.ink} />
      </Pressable>
    </View>
  );
}

export function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
