import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { type ColorName, useTheme } from '@/theme';

import { Button } from './button';
import { Text, type TextTone } from './text';

export type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const toneStyle: Record<
  BannerTone,
  {
    bg: ColorName;
    accent: ColorName;
    text: TextTone;
    symbol: string;
    word: 'status.info' | 'status.success' | 'status.warning' | 'status.error';
  }
> = {
  info: {
    bg: 'accentSoft',
    accent: 'accent',
    text: 'onAccentSoft',
    symbol: 'ℹ︎',
    word: 'status.info',
  },
  success: {
    bg: 'successSoft',
    accent: 'success',
    text: 'success',
    symbol: '✓',
    word: 'status.success',
  },
  warning: {
    bg: 'warningSoft',
    accent: 'warning',
    text: 'warning',
    symbol: '!',
    word: 'status.warning',
  },
  danger: { bg: 'dangerSoft', accent: 'danger', text: 'danger', symbol: '✕', word: 'status.error' },
};

type BannerProps = {
  message: string;
  title?: string;
  tone?: BannerTone;
  action?: { label: string; onPress: () => void };
  testID?: string;
};

/**
 * Short status message. Spoken by VoiceOver and TalkBack as soon as it appears or changes
 * (WCAG 4.1.3), with the severity as a word, so neither colour nor the symbol is the only signal.
 */
export function Banner({ message, title, tone = 'info', action, testID }: BannerProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const look = toneStyle[tone];
  const spoken = [t(look.word), title, message].filter(Boolean).join('. ');

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(spoken);
  }, [spoken]);

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      // One focus stop for the text; with an action the button must stay reachable on its own.
      accessible={!action}
      accessibilityLabel={action ? undefined : spoken}
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
        <Text
          variant="body"
          accessibilityLabel={action ? `${t(look.word)}. ${message}` : undefined}
        >
          {message}
        </Text>
        {action ? <Button label={action.label} onPress={action.onPress} variant="ghost" /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', borderLeftWidth: 4 },
  body: { flex: 1 },
});
