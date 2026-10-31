import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { readSupabaseConfig } from './config';
import { createChunkedStorage } from './secure-session-storage';

let client: SupabaseClient | null = null;

/** The app's Supabase client (Frankfurt). Created on first use so tests can mock it. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  // Expo inlines EXPO_PUBLIC_* only for direct `process.env.NAME` reads, so list them here.
  const { url, anonKey } = readSupabaseConfig({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  });
  client = createClient(url, anonKey, {
    auth: {
      storage: createChunkedStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  // Refresh tokens only while the app is in the foreground (Supabase's React Native guidance).
  const sb = client;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void sb.auth.startAutoRefresh();
    else void sb.auth.stopAutoRefresh();
  });
  return client;
}
