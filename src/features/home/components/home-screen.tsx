import { useTranslation } from 'react-i18next';

import { Screen, Text } from '@/components';

export function HomeScreen() {
  const { t } = useTranslation();
  return (
    <Screen>
      <Text variant="display" accessibilityRole="header">
        {t('appName')}
      </Text>
      <Text tone="secondary">{t('promise')}</Text>
    </Screen>
  );
}
