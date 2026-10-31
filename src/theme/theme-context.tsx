import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { colors, type ColorScheme, radius, spacing, typeScale } from './tokens';

export type Theme = {
  scheme: ColorScheme;
  colors: (typeof colors)[ColorScheme];
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof typeScale;
  /**
   * Extra text scale for previews only (the dev components screen). 1 in the real app, where
   * the system font-size setting scales text through allowFontScaling instead.
   */
  previewTextScale: number;
};

export function buildTheme(scheme: ColorScheme, previewTextScale = 1): Theme {
  return { scheme, colors: colors[scheme], spacing, radius, type: typeScale, previewTextScale };
}

const ThemeContext = createContext<Theme | null>(null);

type ThemeProviderProps = {
  children: ReactNode;
  /** Force a scheme (dev previews). Defaults to the system setting. */
  scheme?: ColorScheme;
  previewTextScale?: number;
};

export function ThemeProvider({ children, scheme, previewTextScale = 1 }: ThemeProviderProps) {
  const system = useColorScheme();
  const resolved: ColorScheme = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const theme = useMemo(() => buildTheme(resolved, previewTextScale), [resolved, previewTextScale]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  // Components rendered outside a provider (e.g. a test that forgot one) fall back to light.
  return theme ?? buildTheme('light');
}
