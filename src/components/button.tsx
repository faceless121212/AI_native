import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { minTouchTarget, useFocusRing, useTheme } from '@/theme';

import { Text, type TextTone } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { focused, focusProps } = useFocusRing();
  const inactive = disabled || loading;

  // A focused element's changed label isn't re-read, so say "Loading" when it starts.
  const wasLoading = useRef(loading);
  useEffect(() => {
    if (loading && !wasLoading.current)
      AccessibilityInfo.announceForAccessibility(t('status.loading'));
    wasLoading.current = loading;
  }, [loading, t]);

  const looks: Record<ButtonVariant, { bg: string; border: string; tone: TextTone }> = {
    primary: { bg: theme.colors.accent, border: theme.colors.accent, tone: 'onAccent' },
    secondary: { bg: theme.colors.surface, border: theme.colors.borderStrong, tone: 'default' },
    ghost: { bg: 'transparent', border: 'transparent', tone: 'accent' },
  };
  const look = looks[variant];
  const size = minTouchTarget();

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={loading ? `${label}, ${t('status.loading')}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      {...focusProps}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: size,
          minWidth: size,
          backgroundColor: look.bg,
          borderColor: focused ? theme.colors.focus : look.border,
          borderWidth: focused ? 2 : 1,
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={[styles.row, { gap: theme.spacing.sm }]}>
        {loading ? (
          <ActivityIndicator
            color={variant === 'primary' ? theme.colors.onAccent : theme.colors.accent}
          />
        ) : null}
        <Text variant="label" tone={look.tone} style={styles.label}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  label: { textAlign: 'center', flexShrink: 1 },
});
