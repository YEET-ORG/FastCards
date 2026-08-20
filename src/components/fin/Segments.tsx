import { AppText } from '@/design/AppText';
import { useColors } from '@/design/theme';
import { font } from '@/design/tokens';
import SegmentedControl from '@/shared/ui/organisms/segmented-control';

export function Segments({
  labels,
  index,
  onChange,
}: {
  labels: string[];
  index: number;
  onChange: (i: number) => void;
}) {
  const colors = useColors();
  return (
    <SegmentedControl
      currentIndex={index}
      onChange={onChange}
      segmentedControlBackgroundColor={colors.inset}
      activeSegmentBackgroundColor={colors.raised}
      dividerColor={colors.line}
      borderRadius={14}
      paddingVertical={10}>
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
  );
}
