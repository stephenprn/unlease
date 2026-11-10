import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Segmented, type SegmentedOption } from '../Segmented';

type Theme = 'system' | 'light' | 'dark';

const OPTIONS: readonly SegmentedOption<Theme>[] = [
  { value: 'system', label: 'Système', icon: 'settings' },
  { value: 'light', label: 'Clair', icon: 'sun' },
  { value: 'dark', label: 'Sombre', icon: 'moon' },
];

function Harness({ disabled = false, initial = 'system' }: { disabled?: boolean; initial?: Theme }) {
  const [value, setValue] = useState<Theme>(initial);
  return <Segmented label="Thème" options={OPTIONS} value={value} onChange={setValue} disabled={disabled} />;
}

const radio = (name: string): HTMLElement => screen.getByRole('radio', { name });

describe('the segmented control', () => {
  it('is one track whose matcha pebble slides to the choice, the tick and inks following halfway', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const group = screen.getByRole('radiogroup', { name: 'Thème' });
    // One pebble for the whole track, placed by the choice's index.
    expect(group.style.getPropertyValue('--segments')).toBe('3');
    expect(group.style.getPropertyValue('--at')).toBe('0');
    expect(within(group).getAllByRole('radio')).toHaveLength(3);

    await user.click(radio('Sombre'));
    expect(radio('Sombre')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Système')).toHaveAttribute('aria-checked', 'false');
    expect(group.style.getPropertyValue('--at')).toBe('2');
    // The tick changes hands as the pebble passes halfway, not before it has left.
    expect(radio('Système')).toHaveAttribute('data-shown');
    await waitFor(() => expect(radio('Sombre')).toHaveAttribute('data-shown'));
    expect(radio('Système')).not.toHaveAttribute('data-shown');
  });

  it('is one tab stop whose arrows, Home and End move the choice, the focus following', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(radio('Système')).toHaveAttribute('tabindex', '0');
    expect(radio('Clair')).toHaveAttribute('tabindex', '-1');
    await user.tab();
    expect(radio('Système')).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(radio('Clair')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Clair')).toHaveFocus();
    expect(radio('Clair')).toHaveAttribute('tabindex', '0');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    // Round the end, as a radio group does.
    expect(radio('Sombre')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Sombre')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(radio('Système')).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{End}');
    expect(radio('Sombre')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Sombre')).toHaveFocus();
  });

  it('holds still while a change is on its way, and keeps its focus', async () => {
    const user = userEvent.setup();
    render(<Harness disabled initial="light" />);
    expect(screen.getByRole('radiogroup', { name: 'Thème' })).toHaveAttribute('aria-disabled', 'true');
    await user.click(radio('Sombre'));
    expect(radio('Clair')).toHaveAttribute('aria-checked', 'true');
    radio('Clair').focus();
    await user.keyboard('{ArrowRight}');
    expect(radio('Clair')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Clair')).toHaveFocus();
  });
});
