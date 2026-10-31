import { fireEvent, render, screen } from '@testing-library/react-native';

import { PlanCard } from '../plan-card';

const lifetime = {
  title: 'Lifetime',
  price: '£52.99',
  period: 'once',
  details: ['Pay once.', 'Fair use: up to 100 replies a day.'],
};

describe('PlanCard', () => {
  it('is a radio button whose checked state follows `selected`', async () => {
    const { rerender } = await render(
      <PlanCard {...lifetime} selected={false} onPress={() => {}} />,
    );
    expect(screen.getByRole('radio')).not.toBeChecked();
    await rerender(<PlanCard {...lifetime} selected onPress={() => {}} />);
    expect(screen.getByRole('radio')).toBeChecked();
  });

  it('shows the store price exactly as given, and the detail lines', async () => {
    await render(<PlanCard {...lifetime} selected={false} onPress={() => {}} />);
    expect(screen.getByText(/£52\.99/)).toBeOnTheScreen();
    expect(screen.getByText('Fair use: up to 100 replies a day.')).toBeOnTheScreen();
  });

  it('reads title, price, secondary line and details in one label', async () => {
    await render(
      <PlanCard
        title="Annual"
        price="€39.99"
        period="per year"
        secondaryLine="€0.77 a week"
        selected
        onPress={() => {}}
      />,
    );
    expect(
      screen.getByRole('radio', { name: 'Annual, €39.99 per year, €0.77 a week' }),
    ).toBeOnTheScreen();
  });

  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<PlanCard {...lifetime} selected={false} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('radio'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
