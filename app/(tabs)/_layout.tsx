import { Tabs } from 'expo-router';

import { C } from '../../src/constants/colors';

// Main app navigation. Each file in this folder becomes one tab screen.
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: C.bg,
        },
        tabBarActiveTintColor: C.purpleLight,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: {
          backgroundColor: C.bg,
          borderTopColor: C.border,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="train" options={{ title: 'Train' }} />
      <Tabs.Screen name="simulator" options={{ title: 'Simulator' }} />
      <Tabs.Screen name="ranges" options={{ title: 'Ranges', lazy: false }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
