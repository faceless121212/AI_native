import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../button';

describe('Button', () => {
  it('is an accessible button that calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the 44 pt minimum touch target', async () => {
    await render(<Button label="Continue" onPress={() => {}} />);
    expect(screen.getByRole('button')).toHaveStyle({ minHeight: 44 });
  });

  it('announces loading as busy and ignores presses while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} loading />);
    const button = screen.getByRole('button', { name: 'Continue, Loading' });
    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Close" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'ghost'] as const)('renders the %s variant', async (variant) => {
    await render(<Button label="Skip" onPress={() => {}} variant={variant} />);
    expect(screen.getByText('Skip')).toBeOnTheScreen();
  });
});
