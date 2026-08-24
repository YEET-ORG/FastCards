import { useTheme } from './theme';

export function useReduceMotion(): boolean {
  return useTheme().reduceMotion;
}

