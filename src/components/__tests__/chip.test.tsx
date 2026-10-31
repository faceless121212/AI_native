import { fireEvent, render, screen } from '@testing-library/react-native';

import { Chip } from '../chip';

describe('Chip', () => {
  it('exposes its selected state and shows a check mark, not just colour', async () => {
    await render(<Chip label="Warm" selected onPress={() => {}} />);
    const chip = screen.getByRole('button', { name: 'Warm' });
    expect(chip).toBeSelected();
    expect(screen.getByText('✓ Warm')).toBeOnTheScreen();
  });

  it('is not selected by default and has no check mark', async () => {
    await render(<Chip label="Calm" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Calm' })).not.toBeSelected();
    expect(screen.getByText('Calm')).toBeOnTheScreen();
  });

  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Funny" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Funny' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the 44 pt minimum touch target', async () => {
    await render(<Chip label="Funny" onPress={() => {}} />);
    expect(screen.getByRole('button')).toHaveStyle({ minHeight: 44 });
  });
});
