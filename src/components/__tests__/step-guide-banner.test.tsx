import { render, screen } from '@testing-library/react-native';

import { Banner } from '../banner';
import { StepGuide } from '../step-guide';

describe('StepGuide', () => {
  const steps = [
    { title: 'Open Settings', body: 'Tap Open Settings below.' },
    { title: 'Keyboards', body: 'Tap Keyboards.' },
    { title: 'Turn on Replywise', body: 'Switch Replywise on.' },
  ];

  it('writes every step out as text with its position', async () => {
    await render(<StepGuide steps={steps} activeIndex={1} />);
    expect(screen.getByLabelText('Step 2 of 3. Keyboards. Tap Keyboards.')).toBeSelected();
    expect(screen.getByText('Turn on Replywise')).toBeOnTheScreen();
    // Finished steps are marked with a check mark, not only a colour.
    expect(screen.getByText('✓')).toBeOnTheScreen();
  });
});

describe('Banner', () => {
  it('is announced as an alert and shows the message', async () => {
    await render(<Banner tone="warning" message="No connection. AI replies need the internet." />);
    expect(screen.getByRole('alert')).toBeOnTheScreen();
    expect(screen.getByText('No connection. AI replies need the internet.')).toBeOnTheScreen();
  });
});
