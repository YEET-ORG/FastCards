import { Tabs } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { AskDockProvider, useAskDock } from '@/components/ask/AskDockContext';
import {
  HouseholdTabBar,
  TabBarSpacer,
  type TabBarProps,
} from '@/components/fin/HouseholdTabBar';
import { useColors } from '@/design/theme';
import { SheetHostProvider } from '@/features/home-sheets/SheetHost';

// Pinned identities: fresh `options` literals per render re-render the whole
// navigator subtree whenever TabLayoutInner re-renders (dock value changes).
const TAB_OPTIONS = {
  index: { title: 'Ask' },
  cards: { title: 'Cards' },
  family: { title: 'Family' },
  activity: { title: 'Activity' },
} as const;

/**
 * The nav bar renders outside the navigator so the composer's scrim can sit
 * between the scenes and the bar — a child of the navigator's `tabBar` slot
 * can never paint above a sibling of `<Tabs>`. `TabBarSpacer` holds the bar's
 * place inside the navigator and hands its state out here.
 *
 * The bar stands down entirely while the chat-first shell is in chat mode
 * (AskDockContext.chatMode): the drawer's whole-app slide must never have the
 * dock floating above it, and the floating composer owns the bottom edge.
 */
function TabLayoutInner() {
  const colors = useColors();
  const dock = useAskDock();
  const [nav, setNav] = useState<TabBarProps | null>(null);

  // The floating bar is a sibling of the navigator, so the shell's drawer
  // slide cannot move it by itself. It rides the dock-owned surfaceX — the
  // exact shared value the shell's drawer physics write — so it stays glued
  // to the moved surface (same spring, same gesture frames) instead of
  // floating over the drawer panel.
  const navSlide = useAnimatedStyle(() => ({
    transform: [{ translateX: dock.surfaceX.value }],
  }));

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
    <View style={styles.root}>
      <Tabs tabBar={renderTabBar} screenOptions={screenOptions}>
        <Tabs.Screen name="index" options={TAB_OPTIONS.index} />
        <Tabs.Screen name="cards" options={TAB_OPTIONS.cards} />
        <Tabs.Screen name="family" options={TAB_OPTIONS.family} />
        <Tabs.Screen name="activity" options={TAB_OPTIONS.activity} />
      </Tabs>
      {nav && !dock.chatMode ? (
        <Animated.View pointerEvents="box-none" style={[styles.navOverlay, navSlide]}>
          <HouseholdTabBar {...nav} />
        </Animated.View>
      ) : null}
    </View>
  );
}

export default function TabLayout() {
  return (
    <AskDockProvider>
      {/* The detail sheet mounts ABOVE the tab shell — a sibling of the Tabs
          navigator and the floating bar, not a child of either — so it covers
          the whole window and the shell's pan gestures cannot fire through it. */}
      <SheetHostProvider>
        <TabLayoutInner />
      </SheetHostProvider>
    </AskDockProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});