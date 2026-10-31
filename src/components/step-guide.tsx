import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Text } from './text';

export type GuideStep = { title: string; body: string };

type StepGuideProps = {
  steps: GuideStep[];
  /** Index of the step the user is on; earlier steps show as done. */
  activeIndex: number;
  testID?: string;
};

/**
 * Numbered setup steps (keyboard and Full Access guides). Every step is always written out as
 * text; animation only adds a staggered fade-in, and is skipped entirely with Reduce Motion.
 */
export function StepGuide({ steps, activeIndex, testID }: StepGuideProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  return (
    <View testID={testID} style={{ gap: theme.spacing.md }}>
      {steps.map((step, index) => {
        const active = index === activeIndex;
        const done = index < activeIndex;
        const entering = reduceMotion ? undefined : FadeInDown.delay(index * 120).duration(260);
        return (
          <Animated.View
            key={step.title}
            entering={entering}
            accessible
            accessibilityLabel={`${t('status.stepOf', { current: index + 1, total: steps.length })}. ${step.title}. ${step.body}`}
            accessibilityState={{ selected: active }}
            style={[
              styles.row,
              {
                gap: theme.spacing.md,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                borderWidth: active ? 2 : 1,
                borderColor: active ? theme.colors.accent : theme.colors.border,
                backgroundColor: active ? theme.colors.accentSoft : theme.colors.surface,
              },
            ]}
          >
            <View
              style={[
                styles.badge,
                done || active
                  ? { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
                  : {
                      backgroundColor: theme.colors.surfaceRaised,
                      borderColor: theme.colors.borderStrong,
                    },
              ]}
            >
              <Text variant="label" tone={done || active ? 'onAccent' : 'default'}>
                {done ? '✓' : String(index + 1)}
              </Text>
            </View>
            <View style={[styles.body, { gap: theme.spacing.xs }]}>
              <Text variant="label" tone={active ? 'onAccentSoft' : 'default'}>
                {step.title}
              </Text>
              <Text variant="body" tone={active ? 'onAccentSoft' : 'secondary'}>
                {step.body}
              </Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
});
