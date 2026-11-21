import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({ children, scroll = true, padTop = true }: { children: ReactNode; scroll?: boolean; padTop?: boolean }) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: padTop ? insets.top + 12 : 12, paddingBottom: 32, paddingHorizontal: 16 };
  if (!scroll) return <View style={[styles.screen, pad]}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function H1({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.h1}>{children}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  icon,
  kind = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: theme.accent, secondary: theme.cardAlt, danger: theme.accentSoft, ghost: 'transparent' }[kind];
  const fg = { primary: '#fff', secondary: theme.ink, danger: theme.accent, ghost: theme.accent }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        kind === 'ghost' && { paddingHorizontal: 6 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segItem, active && styles.segActive]}>
            <Text style={[styles.segText, active && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 12, flex: (props.style as ViewStyle | undefined)?.flex }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={theme.inkFaint} {...props} style={[styles.input, props.style]} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({ text, color = theme.inkSoft, bg = theme.cardAlt }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color }]}>{text}</Text>
    </View>
  );
}

export function Bar({ fraction, color, height = 8 }: { fraction: number; color: string; height?: number }) {
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: theme.cardAlt, overflow: 'hidden' }}>
      <View style={{ width: `${f * 100}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={theme.accent} />
      </View>
      <Text style={[styles.section, { marginTop: 10, textAlign: 'center' }]}>{title}</Text>
      <Text style={[styles.sub, { textAlign: 'center', marginBottom: action ? 14 : 0 }]}>{text}</Text>
      {action}
    </Card>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={styles.hint}>{sub}</Text> : null}
    </View>
  );
}

export { Ionicons };

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  h1: { fontFamily: theme.serif, fontSize: 30, fontWeight: '700', color: theme.ink },
  sub: { color: theme.inkSoft, fontSize: 14, marginTop: 2, lineHeight: 20 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  section: { fontFamily: theme.serif, fontSize: 19, fontWeight: '700', color: theme.ink },
  card: {
    backgroundColor: theme.card,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  btnText: { fontSize: 15, fontWeight: '700' },
  seg: { flexDirection: 'row', backgroundColor: theme.cardAlt, borderRadius: 12, padding: 3 },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  segActive: { backgroundColor: theme.accent },
  segText: { fontWeight: '700', color: theme.inkSoft, fontSize: 14 },
  label: { fontSize: 13, fontWeight: '700', color: theme.inkSoft, marginBottom: 5 },
  input: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.ink,
  },
  hint: { fontSize: 12, color: theme.inkFaint, marginTop: 4, lineHeight: 16 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 12, fontWeight: '700', color: theme.inkSoft, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 22, fontWeight: '800', color: theme.ink, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  muted: { color: theme.inkSoft, fontSize: 13 },
  body: { color: theme.ink, fontSize: 15 },
});
