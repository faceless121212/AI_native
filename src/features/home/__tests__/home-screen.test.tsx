import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from '../components/home-screen';

describe('HomeScreen', () => {
  it('shows the app name as a header and the promise, from i18n', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('header', { name: 'Replywise' })).toBeOnTheScreen();
    expect(screen.getByText('The right reply, in any chat')).toBeOnTheScreen();
  });
});
