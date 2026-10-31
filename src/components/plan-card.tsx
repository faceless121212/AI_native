import { Pressable, StyleSheet, View } from 'react-native';

import { minTouchTarget, useFocusRing, useTheme } from '@/theme';

import { Text } from './text';

type PlanCardProps = {
  /** Plan name, e.g. "Annual" (translated). */
  title: string;
  /** Price exactly as the store formats it in local currency. Never hard-coded. */
  price: string;
  /** Billing period, e.g. "per year" (translated). */
  period: string;
  /** Optional smaller line under the price, e.g. the per-week equivalent for Annual. */
  secondaryLine?: string;
  /** Extra plain lines, e.g. the lifetime fair-use note. */
  details?: string[];
  selected: boolean;
  onPress: () => void;
  testID?: string;
};

/** A selectable plan; behaves as a radio button. Put the plans inside a <RadioGroup>. */
export function PlanCard({
  title,
  price,
  period,
  secondaryLine,
  details = [],
  selected,
  onPress,
  testID,
}: PlanCardProps) {
  const theme = useTheme();
  const { focused, focusProps } = useFocusRing();
  const priceLine = [price, period].filter(Boolean).join(' ');
  const label = [title, priceLine, secondaryLine, ...details].filter(Boolean).join(', ');
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      {...focusProps}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: minTouchTarget(),
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.lg,
          borderWidth: selected || focused ? 2 : 1,
          borderColor: focused
            ? theme.colors.focus
            : selected
              ? theme.colors.accent
              : theme.colors.borderStrong,
          backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surfaceRaised,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        testID={testID ? `${testID}-radio` : undefined}
        style={[
          styles.radio,
          { borderColor: selected ? theme.colors.accent : theme.colors.borderStrong },
        ]}
      >
        {selected ? <View style={[styles.dot, { backgroundColor: theme.colors.accent }]} /> : null}
      </View>
      <View style={[styles.body, { gap: theme.spacing.xs }]}>
        <Text variant="heading">{title}</Text>
        <Text variant="body">
          {price}{' '}
          <Text variant="body" tone="secondary">
            {period}
          </Text>
        </Text>
        {secondaryLine ? (
          <Text variant="caption" tone="secondary">
            {secondaryLine}
          </Text>
        ) : null}
        {details.map((line) => (
          <Text key={line} variant="caption" tone="secondary">
            {line}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'flex-start' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  body: { flex: 1 },
});
