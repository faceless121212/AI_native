import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { Banner } from '../banner';
import { StepGuide } from '../step-guide';

describe('StepGuide', () => {
  const steps = [
    { title: 'Open Settings', body: 'Tap Open Settings below.' },
    { title: 'Keyboards', body: 'Tap Keyboards.' },
    { title: 'Turn on Replywise', body: 'Switch Replywise on.' },
  ];

  it('writes every step out with its position and tells screen readers done / current', async () => {
    await render(<StepGuide steps={steps} activeIndex={1} />);
    const done = screen.getByLabelText('Step 1 of 3. Open Settings. Tap Open Settings below.');
    const current = screen.getByLabelText('Step 2 of 3. Keyboards. Tap Keyboards.');
    const next = screen.getByLabelText('Step 3 of 3. Turn on Replywise. Switch Replywise on.');
    expect(done).toHaveAccessibilityValue({ text: 'done' });
    expect(current).toHaveAccessibilityValue({ text: 'current step' });
    expect(next.props.accessibilityValue).toBeUndefined();
    // Finished steps are marked with a check mark, not only a colour.
    expect(screen.getByText('✓')).toBeOnTheScreen();
  });

  it('never fixes the badge height, so numbers do not clip at large text', async () => {
    await render(<StepGuide steps={steps} activeIndex={0} />);
    expect(screen.getByText('2').parent?.parent).not.toHaveStyle({ height: 28 });
  });
});

describe('Banner', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is one alert element that reads severity, title and message', async () => {
    await render(
      <Banner
        tone="warning"
        title="Offline"
        message="No connection. AI replies need the internet."
      />,
    );
    expect(
      screen.getByRole('alert', {
        name: 'Warning. Offline. No connection. AI replies need the internet.',
      }),
    ).toBeOnTheScreen();
  });

  it('is announced when it appears and when the message changes', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { rerender } = await render(
      <Banner tone="danger" message="AI replies are having trouble." />,
    );
    expect(announce).toHaveBeenLastCalledWith('Error. AI replies are having trouble.');
    await rerender(<Banner tone="danger" message="No connection." />);
    expect(announce).toHaveBeenLastCalledWith('Error. No connection.');
  });

  it('keeps the action button reachable', async () => {
    await render(
      <Banner
        tone="info"
        message="Out of free replies."
        action={{ label: 'Close', onPress: () => {} }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Info. Out of free replies.')).toBeOnTheScreen();
  });
});
