import { useTheme } from './theme';
import { spring, springSheet } from './tokens';

export { spring, springSheet };

export function useReduceMotion(): boolean {
  return useTheme().reduceMotion;
}

/** Duration for a motion that should snap under reduced motion. */
export function motionMs(reduceMotion: boolean, ms: number, snap = 80): number {
  return reduceMotion ? snap : ms;
}
