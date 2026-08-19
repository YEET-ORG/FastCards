import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color } from '@/design/tokens';
import { MorphicTabBar } from '@/shared/ui/molecules/morphing-tabbar';

// Floating morphing tab bar (Reacticx, Skia) — Kast-style minimal text
// navigation. Keyed on the active index so external navigation
// (router.push into a tab) stays in sync.

const TITLES: Record<string, string> = {
  index: 'Ask',
  cards: 'Cards',
  family: 'Family',
  activity: 'Activity',
};

const theme = {
  tabBackground: color.raised,
  inactiveText: color.textTertiary,
  activeText: color.textPrimary,
  glassBackground: color.surface2,
  shadowColor: '#000000',
};

// Structural subset of react-navigation's BottomTabBarProps (the package
// is a transitive dep of expo-router, so we avoid importing its types).
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
}

export function KastTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const items = state.routes.map((r) => ({ keyPath: r.name, name: TITLES[r.name] ?? r.name }));

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 10 }]}>
      <MorphicTabBar
        key={state.index}
        items={items}
        initialActiveIndex={state.index}
        onTabChange={(path) => {
          Haptics.selectionAsync();
          if (path !== state.routes[state.index]?.name) {
            navigation.navigate(path as never);
          }
        }}
        animationDuration={220}
        borderRadius={26}
        enableGlass={false}
        enableShadow
        dark={theme}
        light={theme}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: color.bg,
    paddingHorizontal: 20,
    paddingTop: 6,
  },
});
