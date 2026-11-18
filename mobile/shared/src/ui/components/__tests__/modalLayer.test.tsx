/**
 * An open overlay holds TalkBack as it holds the hand: while a sheet, the drawer, a dialog or a menu
 * is open, Android is told to hide what lies beside it; once it closes, that comes back, and an
 * overlay opened over another gives TalkBack back to the one under it when it goes.
 */
import React from 'react';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Dialog } from '../Dialog';
import { Menu } from '../Menu';
import { Sheet } from '../Sheet';
import { ThemeProvider } from '../../theme/ThemeProvider';

/** What Android was told: the layers holding TalkBack, oldest first (the views exist: findNodeHandle has no tag under Jest). */
const held: { key: string; view: unknown }[] = [];
jest.mock('../../../platform/overlays', () => ({
  KEEP_REACHABLE: 'unlease-keep-reachable',
  holdAccessibility: (view: unknown, key: string) => held.push({ key, view }),
  releaseAccessibility: (key: string) => {
    const at = held.findIndex(layer => layer.key === key);
    if (at >= 0) held.splice(at, 1);
  },
}));

const noop = (): void => {};

function Screen({ sheet, dialog, menu }: { sheet: boolean; dialog: boolean; menu: boolean }): React.ReactElement {
  return (
    <GestureHandlerRootView>
      <SafeAreaProvider>
        <ThemeProvider>
          <Text>Behind</Text>
      <Sheet visible={sheet} onDismiss={noop} title="Sheet">
        <Text>In the sheet</Text>
      </Sheet>
      <Dialog visible={dialog} title="Dialog" confirmLabel="OK" onConfirm={noop} onCancel={noop} />
      <Menu visible={menu} items={[{ label: 'Item', icon: 'trash', onPress: noop }]} onDismiss={noop} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

async function render(props: { sheet: boolean; dialog: boolean; menu: boolean }, tree?: ReactTestRenderer): Promise<ReactTestRenderer> {
  let out = tree;
  await act(async () => {
    if (out) out.update(<Screen {...props} />);
    else out = create(<Screen {...props} />);
  });
  return out!;
}

describe('Overlays and TalkBack', () => {
  beforeEach(() => held.splice(0));

  it('hides what lies beside an open overlay, and gives it back once it closes', async () => {
    const tree = await render({ sheet: false, dialog: false, menu: false });
    expect(held).toHaveLength(0);
    await render({ sheet: true, dialog: false, menu: false }, tree);
    expect(held).toHaveLength(1);
    // The overlay's own root: mounted, unflattened.
    expect(held[0]!.view).toBeTruthy();
    await render({ sheet: false, dialog: false, menu: false }, tree);
    expect(held).toHaveLength(0);
  });

  it('lets the last overlay opened hold TalkBack, and the one under it take it back', async () => {
    const tree = await render({ sheet: true, dialog: false, menu: false });
    const sheet = held[0]!.key;
    await render({ sheet: true, dialog: true, menu: false }, tree);
    expect(held.map(layer => layer.key)).toEqual([sheet, expect.any(String)]);
    await render({ sheet: true, dialog: false, menu: false }, tree);
    expect(held.map(layer => layer.key)).toEqual([sheet]);
    await render({ sheet: true, dialog: false, menu: true }, tree);
    expect(held).toHaveLength(2);
    act(() => tree.unmount());
    expect(held).toHaveLength(0);
  });
});
