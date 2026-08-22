import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { getDrawerColors } from '@/components/chat/ConversationDrawerContent';
import { AiDrawer, ChatFonts } from '@/constants/ai-ui';
import { useColors } from '@/design/theme';

/**
 * The account menu shown in the Home drawer — the same drawer chrome and
 * panel metrics as the AI chat history drawer, with account rows in the body.
 * It only ever opens from the header avatar tap (the shell owns that);
 * drag-to-close and every animation are the shared drawer's.
 */

const ROWS: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  to?: Href;
  signOut?: boolean;
}[] = [
  { icon: 'person-circle-outline', label: 'Profile', to: '/profile' },
  { icon: 'settings-outline', label: 'Settings', to: '/profile' },
  { icon: 'log-out-outline', label: 'Sign out', signOut: true },
];

export function HomeDrawerContent({
  headerRowHeight,
  headerCenterY,
  onClose,
}: {
  headerRowHeight: number;
  headerCenterY: number;
  onClose: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const { signOut } = useAuth();
  const drawerColors = getDrawerColors(colors);

  const go = useCallback(
    (to: Href) => {
      onClose();
      router.push(to);
    },
    [onClose, router],
  );

  const handleRow = useCallback(
    (row: (typeof ROWS)[number]) => {
      if (row.signOut) {
        Alert.alert('Sign out', 'Are you sure you want to sign out?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign out',
            style: 'destructive',
            onPress: () => {
              onClose();
              signOut();
            },
          },
        ]);
        return;
      }
      if (row.to) go(row.to);
    },
    [go, onClose, signOut],
  );

  const headerPadTop = Math.max(0, headerCenterY - headerRowHeight / 2);

  return (
    <View style={[styles.root, { backgroundColor: drawerColors.panelBg }]}>
      {/* Header row — aligned to the shell's left icon centre, exactly like
          the chat drawer's wordmark. */}
      <View style={[styles.header, { height: headerPadTop + headerRowHeight, paddingTop: headerPadTop }]}>
        <Text
          numberOfLines={1}
          style={[styles.brandTitle, { color: colors.textPrimary, paddingHorizontal: AiDrawer.contentPaddingH }]}>
          Account
        </Text>
      </View>

      <View style={styles.body}>
        {ROWS.map((row) => (
          <Pressable
            key={row.label}
            onPress={() => handleRow(row)}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: drawerColors.rowBg,
                borderColor: drawerColors.rowBorder,
              },
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons name={row.icon} size={20} color={row.signOut ? colors.accent : colors.textPrimary} />
            <Text style={[styles.rowTitle, { color: drawerColors.rowTitleText }]}>{row.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
  },
  brandTitle: {
    flex: 1,
    fontFamily: ChatFonts.bold,
    fontSize: AiDrawer.titleSize,
    includeFontPadding: false,
    lineHeight: AiDrawer.titleLineHeight,
  },
  body: {
    flex: 1,
    paddingTop: 2,
  },
  row: {
    alignItems: 'center',
    borderRadius: AiDrawer.activeRowRadius,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginVertical: 3,
    minHeight: 68,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowTitle: { fontFamily: ChatFonts.regular, fontSize: 18, lineHeight: 25 },
});