import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { theme } from '../../lib/theme';

type Icon = ComponentProps<typeof Ionicons>['name'];

const tab = (title: string, icon: Icon, activeIcon: Icon) => ({
  title,
  tabBarIcon: ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? activeIcon : icon} color={typeof color === 'string' ? color : theme.accent} size={size} />
  ),
});

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.inkFaint,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarLabelStyle: { fontWeight: '700' },
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="index" options={tab('Overview', 'pie-chart-outline', 'pie-chart')} />
      <Tabs.Screen name="items" options={tab('Items', 'basket-outline', 'basket')} />
      <Tabs.Screen name="scan" options={tab('Scan', 'scan-outline', 'scan')} />
      <Tabs.Screen name="receipts" options={tab('Receipts', 'receipt-outline', 'receipt')} />
      <Tabs.Screen name="settings" options={tab('Settings', 'settings-outline', 'settings')} />
    </Tabs>
  );
}
