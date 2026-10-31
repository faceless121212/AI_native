import { fireEvent, render, screen } from '@testing-library/react-native';

import { PlanCard } from '../plan-card';
import { RadioGroup } from '../radio-group';

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

  it('sits in a named radio group with one plan checked', async () => {
    await render(
      <RadioGroup label="Choose a plan">
        <PlanCard
          title="Weekly"
          price="€4.99"
          period="per week"
          selected={false}
          onPress={() => {}}
        />
        <PlanCard title="Annual" price="€39.99" period="per year" selected onPress={() => {}} />
      </RadioGroup>,
    );
    expect(screen.getByLabelText('Choose a plan')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(
      screen.getAllByRole('radio').filter((r) => r.props.accessibilityState?.checked),
    ).toHaveLength(1);
  });

  it('leaves no stray separator when there is no billing period', async () => {
    await render(
      <PlanCard title="Lifetime" price="€59.99" period="" selected={false} onPress={() => {}} />,
    );
    expect(screen.getByRole('radio', { name: 'Lifetime, €59.99' })).toBeOnTheScreen();
  });

  it('calls onPress', async () => {
    const onPress = jest.fn();
    await render(<PlanCard {...lifetime} selected={false} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('radio'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
