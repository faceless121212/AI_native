import { contrastRatio } from '../contrast';
import { colors, type ColorScheme } from '../tokens';

// [foreground, background, minimum ratio]. 4.5 = WCAG 1.4.3 body text; 3 = 1.4.11 UI parts.
const pairs = [
  ['text', 'background', 4.5],
  ['text', 'surface', 4.5],
  ['text', 'surfaceRaised', 4.5],
  ['textSecondary', 'background', 4.5],
  ['textSecondary', 'surface', 4.5],
  ['textSecondary', 'surfaceRaised', 4.5],
  ['onAccent', 'accent', 4.5],
  ['onAccentSoft', 'accentSoft', 4.5],
  ['accent', 'background', 4.5],
  ['accent', 'surface', 4.5],
  ['text', 'accentSoft', 4.5],
  ['textSecondary', 'accentSoft', 4.5],
  ['text', 'successSoft', 4.5],
  ['text', 'warningSoft', 4.5],
  ['text', 'dangerSoft', 4.5],
  ['success', 'successSoft', 4.5],
  ['warning', 'warningSoft', 4.5],
  ['danger', 'dangerSoft', 4.5],
  ['success', 'background', 4.5],
  ['warning', 'background', 4.5],
  ['danger', 'background', 4.5],
  ['borderStrong', 'background', 3],
  ['borderStrong', 'surface', 3],
  ['focus', 'background', 3],
  ['focus', 'surface', 3],
  ['accent', 'accentSoft', 4.5],
  ['accent', 'successSoft', 4.5],
  ['accent', 'warningSoft', 4.5],
  ['accent', 'dangerSoft', 4.5],
  ['accent', 'surfaceRaised', 4.5],
  ['borderStrong', 'surfaceRaised', 3],
  ['borderStrong', 'accentSoft', 3],
] as const;

describe.each(['light', 'dark'] as ColorScheme[])('%s colours', (scheme) => {
  it.each(pairs)('%s on %s meets %s:1', (fg, bg, min) => {
    expect(contrastRatio(colors[scheme][fg], colors[scheme][bg])).toBeGreaterThanOrEqual(min);
  });

  it('defines the same colour names as the other scheme', () => {
    expect(Object.keys(colors[scheme]).sort()).toEqual(Object.keys(colors.light).sort());
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });
});
