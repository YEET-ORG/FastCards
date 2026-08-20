import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AskDock } from '@/components/ask/AskDock';
import { AskDockProvider } from '@/components/ask/AskDockContext';
import { HouseholdTabBar } from '@/components/fin/HouseholdTabBar';
import { useColors } from '@/design/theme';

export default function TabLayout() {
  const colors = useColors();
  return (
    <AskDockProvider>
      <View style={styles.root}>
        <Tabs
          tabBar={(props) => <HouseholdTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colors.bg },
          }}>
          <Tabs.Screen name="index" options={{ title: 'Ask' }} />
          <Tabs.Screen name="cards" options={{ title: 'Cards' }} />
          <Tabs.Screen name="family" options={{ title: 'Family' }} />
          <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
        </Tabs>
        <AskDock />
      </View>
    </AskDockProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
