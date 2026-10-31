import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

type RadioGroupProps = {
  /** What the group chooses, read by screen readers (e.g. "Choose a plan"). */
  label: string;
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
};

/** Container for PlanCards or single-choice Chips, so screen readers say "1 of 3". */
export function RadioGroup({ label, children, style, testID }: RadioGroupProps) {
  return (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label} style={style}>
      {children}
    </View>
  );
}
