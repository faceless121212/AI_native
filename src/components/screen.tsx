import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Text } from './text';

type ScreenProps = {
  children: ReactNode;
  /** Screen title, rendered as the first heading so screen readers announce where they are. */
  title?: string;
  contentStyle?: ViewStyle;
};

/** Every screen scrolls, so content still fits at 200% text and the largest iOS sizes. */
export function Screen({ children, title, contentStyle }: ScreenProps) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={[{ padding: theme.spacing.lg, gap: theme.spacing.lg }, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {title ? <Text variant="title">{title}</Text> : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
