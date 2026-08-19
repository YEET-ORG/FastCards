import { AppText } from '@/design/AppText';
import { color, font } from '@/design/tokens';
import SegmentedControl from '@/shared/ui/organisms/segmented-control';

// Product-themed wrapper over the Reacticx segmented control (blurred
// sliding pill + haptics) used for scope and filter switching.

export function Segments({
  labels,
  index,
  onChange,
}: {
  labels: string[];
  index: number;
  onChange: (i: number) => void;
}) {
  return (
    <SegmentedControl
      currentIndex={index}
      onChange={onChange}
      segmentedControlBackgroundColor={color.surface1}
      activeSegmentBackgroundColor={color.surface3}
      dividerColor={color.borderSoft}
      borderRadius={14}
      paddingVertical={10}>
      {labels.map((l) => (
        <AppText
          key={l}
          variant="secondary"
          tone={color.textPrimary}
          style={{ textAlign: 'center', fontFamily: font.medium }}>
          {l}
        </AppText>
      ))}
    </SegmentedControl>
  );
}
