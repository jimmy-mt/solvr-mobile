import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

// Root layout: app-wide providers live here so screens can stay small.
export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="trainer.db"
      assetSource={{ assetId: require('../assets/trainer.db') }}
    >
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SQLiteProvider>
  );
}
