import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { space } from '@/design/tokens';

export function UserBubble({ text }: { text: string }) {
  const colors = useColors();
  const isShort = text.trim().length < 40 && !text.includes('\n');
  return (
    <View
      style={[
        styles.userBubble,
        {
          backgroundColor: colors.textPrimary,
          borderRadius: isShort ? 24 : 16,
        },
      ]}>
      <AppText variant="body" tone={colors.textInverse} style={{ fontSize: 15, lineHeight: 22 }}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '80%',
    paddingHorizontal: space.l,
    paddingVertical: 12,
  },
});
