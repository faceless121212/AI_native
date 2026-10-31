import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { type ColorName, type TypeVariant, useTheme } from '@/theme';

export type TextTone =
  | 'default'
  | 'secondary'
  | 'accent'
  | 'onAccent'
  | 'onAccentSoft'
  | 'success'
  | 'warning'
  | 'danger';

const toneColor: Record<TextTone, ColorName> = {
  default: 'text',
  secondary: 'textSecondary',
  accent: 'accent',
  onAccent: 'onAccent',
  onAccentSoft: 'onAccentSoft',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  tone?: TextTone;
};

/**
 * Themed text. Scales with the system font size (never pass allowFontScaling={false} for
 * reading text); layouts around it must wrap, not clip.
 */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  const theme = useTheme();
  const t = theme.type[variant];
  const scale = theme.previewTextScale;
  return (
    <RNText
      // In dev previews the scale is applied manually, so system scaling would double it.
      allowFontScaling={scale === 1}
      style={[
        {
          color: theme.colors[toneColor[tone]],
          fontSize: t.fontSize * scale,
          lineHeight: t.lineHeight * scale,
          fontWeight: t.fontWeight,
        },
        style,
      ]}
      {...rest}
    />
  );
}
