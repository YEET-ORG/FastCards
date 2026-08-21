import { type StyleProp, type ViewStyle } from 'react-native';

import { RollingNumber } from '@/design/RollingNumber';
import { font } from '@/design/tokens';
import { splitCurrency, useMoney, type CurrencyCode } from '@/domain/currency';

export const MONEY_MASK = '••••••';

/**
 * A money amount that rolls at digit level when it changes. Thin wrapper over
 * `RollingNumber`: this file owns the currency, that one owns the motion.
 *
 * `amount` is always the integer rupee figure the server stores — conversion
 * happens inside `splitCurrency`, at the last possible step.
 */
export function RollingMoney({
  amount,
  fontSize = 36,
  tone,
  fractionTone,
  fontFamily = font.displaySemibold,
  hidden,
  digitWidth,
  style,
  currency,
}: {
  amount: number;
  fontSize?: number;
  tone?: string;
  /** Ink for the cents. Defaults to the theme's secondary text; surfaces with
   * their own ink (the printed card face) pass their own. */
  fractionTone?: string;
  fontFamily?: string;
  hidden?: boolean;
  digitWidth?: number;
  style?: StyleProp<ViewStyle>;
  /** Pins the display currency, for surfaces that are rupee-native regardless
   * of the app-wide toggle (the onboarding budget flow). */
  currency?: CurrencyCode;
}) {
  const money = useMoney();
  const code = currency ?? money.code;

  // The symbol is painted as a separate, non-rolling affix, so it has to come
  // off the formatted string rather than being concatenated by hand.
  const { symbol, digits } = splitCurrency(code, amount);

  return (
    <RollingNumber
      value={amount}
      format={() => digits}
      prefix={symbol}
      // Only USD carries a fraction; INR is whole rupees.
      fractionDigits={code === 'USD' ? 2 : 0}
      fontSize={fontSize}
      fontFamily={fontFamily}
      tone={tone}
      fractionTone={fractionTone}
      hidden={hidden}
      maskText={MONEY_MASK}
      digitWidth={digitWidth}
      accessibilityLabel={hidden ? 'Balance hidden' : `${symbol}${digits}`}
      style={style}
    />
  );
}
