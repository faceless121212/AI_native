import '@/lib/i18n';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';

import { SessionBootstrap } from '@/features/auth/session-bootstrap';
import { createQueryClient } from '@/lib/query/query-client';
import { ThemeProvider } from '@/theme';

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionBootstrap />
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
