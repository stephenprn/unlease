import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { showUndo, useUiStore } from '../../../app/store/ui';
import { NARROW } from '../../useMedia';
import { Confirm } from '../Dialog';
import { Layer, type LayerProps } from '../Layer';
import { hasOpenLayer, resetLayers } from '../layers';
import { Menu } from '../Menu';
import { Popover } from '../Popover';
import { Snackbar } from '../Snackbar';

/** The phone layout (under 720px) or the desktop one; jsdom has no matchMedia of its own. */
function screenWidth(narrow: boolean): void {
  const matchMedia = (query: string) => ({
    matches: narrow && query === NARROW,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia });
}

/** The hand's clock: the gestures read their speed from `performance.now`. */
let now = 0;
const later = (ms: number): void => {
  now += ms;
};

function Harness({ onDismissed, ...props }: Partial<LayerProps> & { onDismissed?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Ouvrir
      </button>
      <Layer
        {...props}
        open={open}
        label="Essai"
        onDismiss={() => {
          onDismissed?.();
          setOpen(false);
        }}
      >
        <input aria-label="Nom" />
        <button type="button">Valider</button>
      </Layer>
    </>
  );
}

function Pickers() {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<'picker' | 'menu' | null>(null);
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen('picker')}>
        Choisir
      </button>
      <button type="button" onClick={() => setOpen('menu')}>
        Plus
      </button>
      <Popover open={open === 'picker'} anchor={anchor} onDismiss={() => setOpen(null)} label="Rappel">
        <button type="button">Demain matin</button>
      </Popover>
      <Menu open={open === 'menu'} anchor={anchor} onDismiss={() => setOpen(null)} label="Plus d’actions" items={[{ label: 'Dupliquer', icon: 'copy', onSelect: () => {} }]} />
    </>
  );
}

describe('overlays', () => {
  beforeEach(() => {
    now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    // jsdom knows the `inert` attribute but not what it does: as in a browser, nothing under it takes focus
    // (React's commit would otherwise put focus back in a layer that is leaving).
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      if (!this.closest('[inert]')) focus.call(this, options);
    });
    useUiStore.setState({ snack: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, 'matchMedia');
    resetLayers();
  });

  it('holds the focus while open, leaves on Escape, and stays drawn while its exit plays', async () => {
    const user = userEvent.setup();
    const root = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'root' }));
    render(<Harness />, { container: root });
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Essai' });
    expect(dialog).toHaveClass('centerPanel');
    expect(within(dialog).getByRole('textbox', { name: 'Nom' })).toHaveFocus();
    // The page under it is out of reach.
    expect(root.inert).toBe(true);

    await user.keyboard('{Escape}');
    // Off the stack and the page awake at once, focus back on what opened it...
    expect(hasOpenLayer()).toBe(false);
    expect(root.inert).toBe(false);
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toHaveFocus();
    // ...while the panel stays, out of reach, to play its exit (jsdom has no animationend: its timeout ends it), then goes.
    const leaving = document.querySelector<HTMLElement>('[data-state="closed"]');
    expect(leaving?.querySelector('.centerPanel')).not.toBeNull();
    expect(leaving).toHaveAttribute('inert');
    await waitFor(() => expect(document.querySelector('[data-state="closed"]')).toBeNull());
    root.remove();
  });

  it('rises as a bottom sheet with a handle under 720px, and leaves on the scrim as on Escape', async () => {
    screenWidth(true);
    const user = userEvent.setup();
    const onDismissed = vi.fn();
    render(<Harness onDismissed={onDismissed} />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const sheet = screen.getByRole('dialog', { name: 'Essai' });
    expect(sheet).toHaveClass('sheetPanel');
    expect(sheet.querySelector('.sheetHandle')).toHaveAttribute('aria-hidden', 'true');
    expect(within(sheet).getByRole('textbox', { name: 'Nom' })).toHaveFocus();

    fireEvent.pointerDown(sheet.closest('[data-state]')!.querySelector('.scrim')!);
    expect(onDismissed).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-state="closed"] .sheetPanel')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    await user.keyboard('{Escape}');
    expect(onDismissed).toHaveBeenCalledTimes(2);
  });

  it('keeps a confirmation and a whole page as they are under 720px', () => {
    screenWidth(true);
    render(<Confirm open title="Vider la corbeille ?" confirmLabel="Vider" danger onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.getByRole('alertdialog', { name: 'Vider la corbeille ?' })).toHaveClass('centerPanel');
  });

  it('keeps a whole page full screen under 720px, and a wide screen’s dialog in the middle', async () => {
    screenWidth(true);
    const user = userEvent.setup();
    const { unmount } = render(<Harness full />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('dialog', { name: 'Essai' })).toHaveClass('centerPanel');
    unmount();
    screenWidth(false);
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('dialog', { name: 'Essai' })).toHaveClass('centerPanel');
  });

  it('stands a sheet and a whole page on the on-screen keyboard under 720px', async () => {
    screenWidth(true);
    // The keyboard covers the window's last 300px: the visual viewport is that much shorter.
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: Object.assign(new EventTarget(), { height: window.innerHeight - 300, offsetTop: 0, scale: 1 }) });
    try {
      const user = userEvent.setup();
      const { unmount } = render(<Harness full />);
      await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
      expect(screen.getByRole('dialog', { name: 'Essai' }).closest('[data-state]')).toHaveStyle({ paddingBottom: '300px' });
      unmount();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
      expect(screen.getByRole('dialog', { name: 'Essai' }).closest('[data-state]')).toHaveStyle({ paddingBottom: '300px' });
    } finally {
      Reflect.deleteProperty(window, 'visualViewport');
    }
  });

  it('drops a picker as a sheet under 720px, while a menu stays by its button', async () => {
    screenWidth(true);
    const user = userEvent.setup();
    render(<Pickers />);
    await user.click(screen.getByRole('button', { name: 'Choisir' }));
    const picker = screen.getByRole('dialog', { name: 'Rappel' });
    expect(picker).toHaveClass('sheetPanel');
    expect(within(picker).getByRole('button', { name: 'Demain matin' })).toHaveFocus();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Plus' }));
    expect(screen.getByRole('menu', { name: 'Plus d’actions' })).toHaveClass('popover');
  });

  it('follows its handle down, resists going up, springs back from a short pull and is thrown off by a long one', async () => {
    screenWidth(true);
    const user = userEvent.setup();
    const onDismissed = vi.fn();
    render(<Harness onDismissed={onDismissed} />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const sheet = screen.getByRole('dialog', { name: 'Essai' });
    const handle = sheet.querySelector('.sheetHandle')!;
    const press = (y: number) => fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, button: 0, clientY: y });
    const move = (y: number, ms: number) => {
      later(ms);
      fireEvent.pointerMove(handle, { pointerId: 1, isPrimary: true, clientY: y });
    };
    const lift = (y: number) => {
      later(50);
      fireEvent.pointerUp(handle, { pointerId: 1, isPrimary: true, clientY: y });
    };

    // A short, slow pull: it follows the finger, and back it goes.
    press(500);
    move(530, 200);
    move(560, 200);
    expect(sheet.style.translate).toBe('0 60px');
    lift(560);
    expect(sheet.style.translate).toBe('');
    expect(onDismissed).not.toHaveBeenCalled();

    // Pushed up 100, it gives 20.
    press(500);
    move(400, 300);
    expect(sheet.style.translate).toBe('0 -20px');
    lift(400);
    expect(sheet.style.translate).toBe('');

    // Pulled far, it is thrown off, and the layer goes once it is gone.
    press(300);
    move(400, 300);
    move(500, 300);
    lift(500);
    expect(onDismissed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.querySelector('.sheetPanel')).toBeNull());
    expect(screen.getByRole('button', { name: 'Ouvrir' })).toHaveFocus();
  });

  it('is thrown off by a quick flick, however short', async () => {
    screenWidth(true);
    const user = userEvent.setup();
    const onDismissed = vi.fn();
    render(<Harness onDismissed={onDismissed} />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    const handle = screen.getByRole('dialog', { name: 'Essai' }).querySelector('.sheetHandle')!;
    fireEvent.pointerDown(handle, { pointerId: 1, isPrimary: true, button: 0, clientY: 500 });
    later(20);
    fireEvent.pointerMove(handle, { pointerId: 1, isPrimary: true, clientY: 530 });
    later(20);
    fireEvent.pointerMove(handle, { pointerId: 1, isPrimary: true, clientY: 560 });
    later(5);
    fireEvent.pointerUp(handle, { pointerId: 1, isPrimary: true, clientY: 562 });
    expect(onDismissed).toHaveBeenCalledTimes(1);
  });

  it('throws the slip off when it is swiped sideways, while a press that stays put reaches its action', async () => {
    const user = userEvent.setup();
    const undo = vi.fn();
    render(<Snackbar />);
    act(() => showUndo('Note archivée', undo));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().snack).toBeNull();

    act(() => showUndo('Label supprimé', undo));
    const slip = screen.getByText('Label supprimé').parentElement!;
    // jsdom lays nothing out: the slip is as wide as on a phone.
    Object.defineProperty(slip, 'offsetWidth', { configurable: true, value: 360 });
    const action = within(slip).getByRole('button', { name: 'Annuler' });
    const swipe = (target: Element, xs: readonly number[]) => {
      fireEvent.pointerDown(target, { pointerId: 2, isPrimary: true, button: 0, clientX: xs[0], clientY: 400 });
      for (const x of xs.slice(1)) {
        later(100);
        fireEvent.pointerMove(target, { pointerId: 2, isPrimary: true, clientX: x, clientY: 401 });
      }
      later(200);
      fireEvent.pointerUp(target, { pointerId: 2, isPrimary: true, clientX: xs[xs.length - 1], clientY: 401 });
    };

    // Short of a third of its width, it springs back, and the press that ends the swipe is not a press on "Annuler".
    swipe(action, [100, 130, 160]);
    fireEvent.click(action);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(slip.style.translate).toBe('');
    expect(useUiStore.getState().snack?.message).toBe('Label supprimé');

    // Past it, it is thrown off and the message goes.
    swipe(slip, [100, 160, 260]);
    expect(useUiStore.getState().snack).toBeNull();
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
