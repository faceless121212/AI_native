import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { Chip } from '../chip';
import { RadioGroup } from '../radio-group';

describe('Chip', () => {
  it('in multi mode is a toggle whose checked state follows `selected`', async () => {
    const { rerender } = await render(<Chip mode="multi" label="Match" onPress={() => {}} />);
    // RNTL's toBeChecked() doesn't accept the togglebutton role, so read the state directly.
    const checked = () =>
      screen.getByRole('togglebutton', { name: 'Match' }).props.accessibilityState?.checked;
    expect(checked()).toBe(false);
    await rerender(<Chip mode="multi" label="Match" selected onPress={() => {}} />);
    expect(checked()).toBe(true);
  });

  it('in single mode is a radio inside a named group', async () => {
    await render(
      <RadioGroup label="Tone">
        <Chip mode="single" label="Warm" selected onPress={() => {}} />
        <Chip mode="single" label="Calm" onPress={() => {}} />
      </RadioGroup>,
    );
    // The group isn't a single accessibility element (that would hide its chips), so RNTL's
    // role query skips it; check the container's role and name directly.
    expect(screen.getByLabelText('Tone')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(screen.getByRole('radio', { name: 'Warm' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Calm' })).not.toBeChecked();
  });

  it('shows a check mark when selected, not just colour', async () => {
    await render(<Chip mode="multi" label="Warm" selected onPress={() => {}} />);
    expect(screen.getByText('✓ Warm')).toBeOnTheScreen();
  });

  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Chip mode="multi" label="Funny" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('togglebutton', { name: 'Funny' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is at least 44 × 44 pt on iOS', async () => {
    await render(<Chip mode="multi" label="Funny" onPress={() => {}} />);
    expect(screen.getByRole('togglebutton')).toHaveStyle({ minHeight: 44, minWidth: 44 });
  });

  it('is at least 48 × 48 dp on Android', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    try {
      await render(<Chip mode="multi" label="Funny" onPress={() => {}} />);
      expect(screen.getByRole('togglebutton')).toHaveStyle({ minHeight: 48, minWidth: 48 });
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  });
});
