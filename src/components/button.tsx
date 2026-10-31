import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { minTouchTarget, useTheme } from '@/theme';

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
  const inactive = disabled || loading;

  const looks: Record<ButtonVariant, { bg: string; border: string; tone: TextTone }> = {
    primary: { bg: theme.colors.accent, border: theme.colors.accent, tone: 'onAccent' },
    secondary: { bg: theme.colors.surface, border: theme.colors.borderStrong, tone: 'default' },
    ghost: { bg: 'transparent', border: 'transparent', tone: 'accent' },
  };
  const look = looks[variant];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={loading ? `${label}, ${t('status.loading')}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: minTouchTarget,
          backgroundColor: look.bg,
          borderColor: look.border,
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
  base: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  label: { textAlign: 'center', flexShrink: 1 },
});
