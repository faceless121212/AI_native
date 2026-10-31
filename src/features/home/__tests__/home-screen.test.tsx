import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from '../components/home-screen';

describe('HomeScreen', () => {
  it('shows the app name as a header', async () => {
    await render(<HomeScreen />);
    expect(screen.getByRole('header', { name: 'Replywise' })).toBeTruthy();
  });
});
