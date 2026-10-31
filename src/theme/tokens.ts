// Design tokens: the single source for colours, spacing, type and radius.
// Pure data with no imports, so scripts/export-tokens.ts can read it with plain Node and
// write the same colours to Swift (iOS keyboard) and Android resources (IME).
// Every text/background pair used by components is checked for WCAG contrast in
// src/theme/__tests__/tokens.test.ts.

export const colors = {
  light: {
    background: '#FFFFFF',
    surface: '#F4F5F7',
    surfaceRaised: '#FFFFFF',
    border: '#D5D9E0',
    borderStrong: '#7C8494',
    text: '#14161A',
    textSecondary: '#5A6170',
    accent: '#4338CA',
    onAccent: '#FFFFFF',
    accentSoft: '#E8E7FB',
    onAccentSoft: '#2E2591',
    success: '#1E7A46',
    successSoft: '#E5F4EC',
    warning: '#8A5300',
    warningSoft: '#FDF1DC',
    danger: '#B42318',
    dangerSoft: '#FDECEA',
    focus: '#4338CA',
  },
  dark: {
    background: '#0F1115',
    surface: '#181B21',
    surfaceRaised: '#20242C',
    border: '#353B47',
    borderStrong: '#7D8596',
    text: '#F2F4F7',
    textSecondary: '#A8AFBD',
    accent: '#9AA2FF',
    onAccent: '#0F1115',
    accentSoft: '#272B52',
    onAccentSoft: '#D4D7FF',
    success: '#5BD38A',
    successSoft: '#13291D',
    warning: '#F5C04A',
    warningSoft: '#2E2410',
    danger: '#FF8A80',
    dangerSoft: '#341614',
    focus: '#9AA2FF',
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type ColorName = keyof (typeof colors)['light'];

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Sizes in points at the default text size. React Native scales them with the user's
// font-size setting (allowFontScaling), so layouts must wrap rather than clip.
export const typeScale = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '700' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TypeVariant = keyof typeof typeScale;

// Minimum touch target (Apple HIG 44 pt; Android 48 dp is applied via hitSlop where needed).
export const minTouchTarget = 44;
