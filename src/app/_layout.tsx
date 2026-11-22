import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DB_NAME, migrate } from '../lib/db';
import { theme } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
      <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.bg },
            headerTintColor: theme.ink,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="receipt/[id]" options={{ title: 'Receipt' }} />
          <Stack.Screen name="item/[key]" options={{ title: 'Item' }} />
          <Stack.Screen name="category/[name]" options={{ title: 'Category' }} />
          <Stack.Screen name="scan" options={{ title: 'Scan a receipt' }} />
          <Stack.Screen name="paste" options={{ title: 'Paste a receipt' }} />
        </Stack>
      </SQLiteProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
