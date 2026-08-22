import { StyleSheet, View } from 'react-native';

import { AppText } from '@/design/AppText';
import { useColors, useDepth } from '@/design/theme';
import { font, radius } from '@/design/tokens';
import SegmentedControl from '@/shared/ui/organisms/segmented-control';

export function Segments({
  labels,
  index,
  onChange,
  dense = false,
}: {
  labels: string[];
  index: number;
  onChange: (i: number) => void;
  dense?: boolean;
}) {
  const colors = useColors();
  const well = useDepth('well');
  // The track is a recessed well the active thumb sits raised inside — the
  // control's own background is made transparent so this wrapper owns it.
  return (
    <View style={[styles.track, { backgroundColor: colors.inset, boxShadow: well }]}>
      <SegmentedControl
        currentIndex={index}
        onChange={onChange}
        segmentedControlBackgroundColor="transparent"
        activeSegmentBackgroundColor={colors.raised}
        dividerColor={colors.line}
        borderRadius={radius.control}
        paddingVertical={dense ? 6 : 10}
        marginVertical={dense ? 12 : 20}>
        {labels.map((l) => (
          <AppText
            key={l}
            variant="secondary"
            tone={colors.textPrimary}
            style={{ textAlign: 'center', fontFamily: font.medium }}>
            {l}
          </AppText>
        ))}
      </SegmentedControl>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.control + 2,
    overflow: 'hidden',
  },
});
