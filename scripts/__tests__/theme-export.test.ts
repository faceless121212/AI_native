import { colors } from '../../src/theme/tokens.ts';
import { generateSwiftTheme, HIGH_CONTRAST } from '../lib/theme-export.ts';

describe('keyboard theme for Increase Contrast', () => {
  it('maps secondary text to the primary text colour, using existing tokens only', () => {
    expect(HIGH_CONTRAST.textSecondary).toBe('text');
    for (const strong of Object.values(HIGH_CONTRAST)) expect(colors.light).toHaveProperty(strong);
  });

  it('writes a high-contrast value for every colour', () => {
    const swift = generateSwiftTheme();
    const hex = (v: string) => `0x${v.replace('#', '').toUpperCase()}`;
    expect(swift).toContain(
      `static let textSecondary = dynamic(light: ${hex(colors.light.textSecondary)}, dark: ${hex(colors.dark.textSecondary)}, lightHighContrast: ${hex(colors.light.text)}, darkHighContrast: ${hex(colors.dark.text)})`,
    );
    expect(swift).toContain('traits.accessibilityContrast == .high');
    const lines = swift.split('\n').filter((l) => l.includes('static let '));
    expect(lines).toHaveLength(Object.keys(colors.light).length);
    for (const line of lines) expect(line).toContain('darkHighContrast:');
  });
});
