import type { Ref } from "react";
import type {
  StyleProp,
  TextInput,
  TextInputProps,
  TextStyle,
  ViewStyle,
} from "react-native";

interface IAnimatedInput extends Omit<TextInputProps, "placeholder"> {
  placeholders: string[];
  /** Ref to the underlying TextInput, so callers can focus/blur it directly. */
  readonly inputRef?: Ref<TextInput>;
  readonly animationInterval?: number;
  readonly containerStyle?: StyleProp<ViewStyle>;
  readonly inputWrapperStyle?: StyleProp<ViewStyle>;
  readonly inputStyle?: StyleProp<TextStyle>;
  readonly placeholderStyle?: StyleProp<TextStyle>;
  readonly characterEnterDuration?: number;
  readonly characterExitDuration?: number;
  readonly characterDelayIncrement?: number;
  readonly blurAnimationDuration?: number;
  readonly blurIntensityRange?: [number, number, number];
  readonly blurProgressRange?: [number, number, number];
}

interface ICharacter {
  char: string;
  index: number;
  enterDuration: number;
  exitDuration: number;
  delayIncrement: number;
  style?: TextStyle;
}

export type { IAnimatedInput, ICharacter };
