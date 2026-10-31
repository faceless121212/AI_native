import { Pressable, StyleSheet } from 'react-native';

import { minTouchTarget, useTheme } from '@/theme';

import { Text } from './text';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
};

/** A selectable chip. Selection is shown by colour, a ✓ and a thicker border, never colour alone. */
export function Chip({ label, selected = false, onPress, disabled = false, testID }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: minTouchTarget,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.pill,
          backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
          borderColor: selected ? theme.colors.accent : theme.colors.borderStrong,
          borderWidth: selected ? 2 : 1,
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
