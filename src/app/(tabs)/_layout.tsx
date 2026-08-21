import { Tabs } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AskDockProvider } from '@/components/ask/AskDockContext';
import {
  HouseholdTabBar,
  TabBarSpacer,
  type TabBarProps,
} from '@/components/fin/HouseholdTabBar';
import { useColors } from '@/design/theme';

export default function TabLayout() {
  const colors = useColors();
  // The bar renders outside the navigator so the composer's scrim can sit
  // between the scenes and the bar — a child of the navigator's `tabBar` slot
  // can never paint above a sibling of `<Tabs>`. `TabBarSpacer` holds the
  // bar's place inside the navigator and hands its state out here.
  const [nav, setNav] = useState<TabBarProps | null>(null);

  // A theme swap re-renders this component, and expo-router keeps every
  // visited tab mounted — so a fresh `tabBar` or `screenOptions` identity
  // here cascades into re-rendering all four screens. Both are pinned:
  // `setNav` is stable, and the options depend on one token, not the palette.
  const renderTabBar = useCallback(
    (props: TabBarProps) => <TabBarSpacer {...props} onProps={setNav} />,
    [],
  );
  const screenOptions = useMemo(
    () => ({ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }),
    [colors.bg],
  );

  return (
    <AskDockProvider>
      <View style={styles.root}>
        <Tabs tabBar={renderTabBar} screenOptions={screenOptions}>
          <Tabs.Screen name="index" options={{ title: 'Ask' }} />
          <Tabs.Screen name="cards" options={{ title: 'Cards' }} />
          <Tabs.Screen name="family" options={{ title: 'Family' }} />
          <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
        </Tabs>
        {nav ? <HouseholdTabBar {...nav} /> : null}
      </View>
    </AskDockProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
