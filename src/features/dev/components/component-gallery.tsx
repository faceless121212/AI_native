import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Chip, PlanCard, RadioGroup, StepGuide, Text } from '@/components';
import { type ColorScheme, ThemeProvider, useTheme } from '@/theme';

// Development-only screen (app/dev/components.tsx redirects away in release builds), so its
// section headings are not translated. Every component inside uses real i18n strings.
// Prices below are sample store-formatted strings for the preview, never shipped copy.

const PREVIEWS: { scheme: ColorScheme; textScale: number; heading: string }[] = [
  { scheme: 'light', textScale: 1, heading: 'Light · normal text' },
  { scheme: 'dark', textScale: 1, heading: 'Dark · normal text' },
  { scheme: 'light', textScale: 2, heading: 'Light · 200% text' },
  { scheme: 'dark', textScale: 2, heading: 'Dark · 200% text' },
];

export function ComponentGallery() {
  return (
    <SafeAreaView style={styles.fill}>
      <ScrollView>
        {PREVIEWS.map((preview) => (
          <ThemeProvider
            key={preview.heading}
            scheme={preview.scheme}
            previewTextScale={preview.textScale}
          >
            <Gallery heading={preview.heading} />
          </ThemeProvider>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Gallery({ heading }: { heading: string }) {
  const theme = useTheme();
  const { t } = useTranslation(['common', 'keyboard', 'onboarding', 'paywall']);
  const [tone, setTone] = useState<'warm' | 'funny' | 'calm'>('warm');
  const [who, setWho] = useState<string[]>(['friend']);
  const [plan, setPlan] = useState<'weekly' | 'annual' | 'lifetime'>('annual');
  const [loading, setLoading] = useState(false);

  return (
    <View
      style={{
        backgroundColor: theme.colors.background,
        padding: theme.spacing.lg,
        gap: theme.spacing.lg,
      }}
    >
      <Text variant="title">{heading}</Text>

      <Text variant="display">{t('promise')}</Text>
      <Text tone="secondary">{t('aiDisclosure')}</Text>

      <Button
        label={t('actions.continue')}
        onPress={() => setLoading((v) => !v)}
        loading={loading}
      />
      <Button label={t('onboarding:actions.notNow')} onPress={() => {}} variant="secondary" />
      <Button label={t('actions.skip')} onPress={() => {}} variant="ghost" />
      <Button label={t('actions.skip')} onPress={() => {}} variant="secondary" disabled />

      <RadioGroup
        label={t('keyboard:chipRows.tone')}
        style={{ ...styles.wrap, gap: theme.spacing.sm }}
      >
        {(['warm', 'funny', 'calm'] as const).map((key) => (
          <Chip
            key={key}
            mode="single"
            label={t(`keyboard:tone.${key}`)}
            selected={tone === key}
            onPress={() => setTone(key)}
          />
        ))}
      </RadioGroup>

      <View style={[styles.wrap, { gap: theme.spacing.sm }]}>
        {(['match', 'partner', 'friend', 'colleague'] as const).map((key) => (
          <Chip
            key={key}
            mode="multi"
            label={t(`keyboard:relationship.${key}`)}
            selected={who.includes(key)}
            onPress={() =>
              setWho((current) =>
                current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
              )
            }
          />
        ))}
      </View>

      <Card>
        <Text variant="heading">{t('onboarding:whatWeSee.title')}</Text>
        <Text>{t('onboarding:whatWeSee.line1')}</Text>
        <Text>{t('onboarding:whatWeSee.line2')}</Text>
        <Text>{t('onboarding:whatWeSee.line3')}</Text>
      </Card>

      <Banner tone="info" message={t('keyboard:bar.noFullAccess')} />
      <Banner tone="success" message={t('aiSuggestion')} />
      <Banner tone="warning" message={t('keyboard:bar.quotaEmpty')} />
      <Banner
        tone="danger"
        message={t('keyboard:bar.providerDown')}
        action={{ label: t('actions.close'), onPress: () => {} }}
      />

      <RadioGroup label={t('paywall:plansLabel')} style={{ gap: theme.spacing.md }}>
        <PlanCard
          title="Weekly"
          price="€4.99"
          period="per week"
          secondaryLine={t('paywall:trialTimeline', { price: '€4.99' })}
          selected={plan === 'weekly'}
          onPress={() => setPlan('weekly')}
        />
        <PlanCard
          title="Annual"
          price="€39.99"
          period="per year"
          secondaryLine={t('paywall:perWeek', { price: '€0.77' })}
          selected={plan === 'annual'}
          onPress={() => setPlan('annual')}
        />
        <PlanCard
          title="Lifetime"
          price="€59.99"
          period=""
          details={[t('paywall:lifetimeLine'), t('paywall:fairUse')]}
          selected={plan === 'lifetime'}
          onPress={() => setPlan('lifetime')}
        />
      </RadioGroup>

      <StepGuide
        activeIndex={1}
        steps={[
          { title: t('keyboard:chipRows.who'), body: t('keyboard:relationship.friend') },
          { title: t('keyboard:chipRows.tone'), body: t('keyboard:tone.warm') },
          { title: t('keyboard:chipRows.formality'), body: t('keyboard:formality.casual') },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
