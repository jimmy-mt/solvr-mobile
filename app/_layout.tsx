import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { C } from '../src/constants/colors';

function DbWarmup() {
  const db = useSQLiteContext();
  useEffect(() => {
    db.getFirstAsync('SELECT id FROM nodes ORDER BY RANDOM() LIMIT 1')
      .then((row) => {
        const node = row as { id?: number } | null;
        if (node?.id != null) {
          return Promise.all([
            db.getFirstAsync('SELECT * FROM nodes WHERE id = ?', [1]),
            db.getAllAsync('SELECT hand, freq_fold, freq_call, freq_raise, freq_all_in, hand_probability FROM hands WHERE node_id = ? ORDER BY id', [1]),
            db.getAllAsync('SELECT t.action, t.to_node_id, n.proposed_raise_bb FROM transitions t LEFT JOIN nodes n ON n.id = t.to_node_id WHERE t.from_node_id = ?', [1]),
            db.getAllAsync('SELECT hand FROM hands WHERE node_id = ? LIMIT 1', [node.id]),
          ]);
        }
        return null;
      })
      .catch(() => {});
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <SQLiteProvider
      databaseName="trainer.db"
      assetSource={{ assetId: require('../assets/trainer.db') }}
    >
      <DbWarmup />
      <StatusBar style="light" backgroundColor={C.bg} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </SQLiteProvider>
  );
}
