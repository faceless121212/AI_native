import { StyleSheet, View } from 'react-native';

import { type ColorName, useTheme } from '@/theme';

import { Button } from './button';
import { Text, type TextTone } from './text';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const toneStyle: Record<
  BannerTone,
  { bg: ColorName; accent: ColorName; text: TextTone; symbol: string }
> = {
  info: { bg: 'accentSoft', accent: 'accent', text: 'onAccentSoft', symbol: 'ℹ︎' },
  success: { bg: 'successSoft', accent: 'success', text: 'success', symbol: '✓' },
  warning: { bg: 'warningSoft', accent: 'warning', text: 'warning', symbol: '!' },
  danger: { bg: 'dangerSoft', accent: 'danger', text: 'danger', symbol: '✕' },
};

type BannerProps = {
  message: string;
  title?: string;
  tone?: BannerTone;
  action?: { label: string; onPress: () => void };
  testID?: string;
};

/**
 * One-line or short status message. Announced by screen readers when it appears
 * (accessibilityRole "alert", polite live region on Android). The symbol repeats the tone
 * so colour is never the only signal.
 */
export function Banner({ message, title, tone = 'info', action, testID }: BannerProps) {
  const theme = useTheme();
  const look = toneStyle[tone];
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      // One focus stop for title + message; with an action the button must stay reachable.
      accessible={!action}
      accessibilityLiveRegion="polite"
      style={[
        styles.base,
        {
          backgroundColor: theme.colors[look.bg],
          borderLeftColor: theme.colors[look.accent],
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          gap: theme.spacing.md,
        },
      ]}
    >
      <Text
        variant="heading"
        tone={look.text}
        importantForAccessibility="no"
        accessibilityElementsHidden
      >
        {look.symbol}
      </Text>
      <View style={[styles.body, { gap: theme.spacing.xs }]}>
        {title ? (
          <Text variant="label" tone={look.text}>
            {title}
          </Text>
        ) : null}
        <Text variant="body">{message}</Text>
        {action ? <Button label={action.label} onPress={action.onPress} variant="ghost" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', borderLeftWidth: 4 },
  body: { flex: 1 },
});
