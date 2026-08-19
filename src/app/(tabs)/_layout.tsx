import { Tabs } from 'expo-router';

import { KastTabBar } from '@/components/fin/KastTabBar';
import { color } from '@/design/tokens';

// Four destinations only (spec §7): Ask · Cards · Family · Activity —
// rendered by the Reacticx morphing tab bar.

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <KastTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Ask' }} />
      <Tabs.Screen name="cards" options={{ title: 'Cards' }} />
      <Tabs.Screen name="family" options={{ title: 'Family' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
    </Tabs>
  );
}
