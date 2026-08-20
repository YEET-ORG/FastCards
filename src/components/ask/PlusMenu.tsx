import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font, space } from '@/design/tokens';

type Item = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  caption?: string;
  disabled?: boolean;
  onPress: () => void;
};

export function PlusMenu({ items, onDismiss }: { items: Item[]; onDismiss: () => void }) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.menu,
        {
          backgroundColor: colors.raised,
          borderColor: colors.line,
          shadowColor: colors.textPrimary,
        },
      ]}>
      {items.map((item, i) => (
        <Pressable
          key={item.key}
          onPress={() => {
            if (item.disabled) return;
            item.onPress();
            onDismiss();
          }}
          disabled={item.disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: item.disabled }}
          accessibilityLabel={item.disabled ? `${item.label}, ${item.caption ?? 'disabled'}` : item.label}
          style={({ pressed }) => [
            styles.row,
            i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
            pressed && !item.disabled && { backgroundColor: colors.inset },
            item.disabled && { opacity: 0.45 },
          ]}>
          <Ionicons name={item.icon} size={18} color={colors.textSecondary} />
          <View style={{ flex: 1 }}>
            <AppText variant="body" style={{ fontFamily: font.medium }}>
              {item.label}
            </AppText>
            {item.caption ? (
              <AppText variant="caption" tone={colors.textTertiary}>
                {item.caption}
              </AppText>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: {
    width: 220,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    paddingVertical: 10,
  },
});
