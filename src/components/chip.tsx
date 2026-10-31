import { Pressable, StyleSheet } from 'react-native';

import { minTouchTarget, useFocusRing, useTheme } from '@/theme';

import { Text } from './text';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /**
   * "multi": one of several chips that can each be on (a toggle, e.g. onboarding "Who do you
   * text most?"). "single": one choice in a row (a radio; wrap the row in <RadioGroup>).
   */
  mode: 'multi' | 'single';
  disabled?: boolean;
  testID?: string;
};

/** A selectable chip. Selection is shown by colour, a ✓ and a thicker border, never colour alone. */
export function Chip({
  label,
  selected = false,
  onPress,
  mode,
  disabled = false,
  testID,
}: ChipProps) {
  const theme = useTheme();
  const { focused, focusProps } = useFocusRing();
  const size = minTouchTarget();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={mode === 'multi' ? 'togglebutton' : 'radio'}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      {...focusProps}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: size,
          minWidth: size,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.pill,
          backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
          borderColor: focused
            ? theme.colors.focus
            : selected
              ? theme.colors.accent
              : theme.colors.borderStrong,
          borderWidth: selected || focused ? 2 : 1,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text variant="label" tone={selected ? 'onAccentSoft' : 'default'}>
        {selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
});
