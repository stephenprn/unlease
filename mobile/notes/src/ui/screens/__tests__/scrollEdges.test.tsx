/**
 * How a scroller meets what stands around it: under a head, no fade, but the head's line, which comes
 * in once content has gone under the scroller's top (Android says so, `onUnder`) and leaves at the top
 * again; a box capped mid-content and a strip that scrolls sideways fade their ends instead, and draw
 * no line.
 */
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { lightTheme } from '@shared/ui/theme/theme';
import { EDGE_FADE, EdgeFlatList, EdgeScrollView, HEAD_LINE_ID, ScrollEdges } from '@shared/ui/components/ScrollEdges';
import { SheetScroll } from '@shared/ui/components/Sheet';
import { RevealScrollView } from '@shared/ui/components/RevealScroll';

/** The native view around the scroller (a plain View under Jest), with the props Android reads. */
function edgesOf(tree: ReactTestRenderer): ReactTestInstance {
  const found = tree.root.findAll(node => typeof node.type === 'string' && node.props.length === EDGE_FADE && 'fadeStart' in node.props);
  expect(found).toHaveLength(1);
  return found[0]!;
}

function lineOf(tree: ReactTestRenderer): ReactTestInstance | null {
  const found = tree.root.findAll(node => typeof node.type === 'string' && node.props.testID === HEAD_LINE_ID);
  return found[0] ?? null;
}

const styleOf = (node: ReactTestInstance) => StyleSheet.flatten(node.props.style) as { opacity?: number; top?: number; height?: number; backgroundColor?: string; left?: number; right?: number };

async function tell(tree: ReactTestRenderer, under: boolean): Promise<void> {
  await act(async () => {
    edgesOf(tree).props.onUnder({ nativeEvent: { under } });
  });
}

async function render(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });
  return tree;
}

describe('Scroll edges', () => {
  it('shows the head’s line once content goes under the scroller’s top, and takes it away at the top again', async () => {
    const tree = await render(
      <EdgeScrollView>
        <Text>Rows</Text>
      </EdgeScrollView>,
    );
    const edges = edgesOf(tree);
    // No fade under a head: Android only says what goes under it.
    expect(edges.props).toMatchObject({ top: true, horizontal: false, fadeStart: false, fadeEnd: false });
    const line = lineOf(tree)!;
    // Across the whole width, 1 high, in the hairline's ink (a footer's edge), at the scroller's top; unseen at rest.
    expect(styleOf(line)).toMatchObject({ top: 0, left: 0, right: 0, height: 1, backgroundColor: lightTheme.color.hairline, opacity: 0 });

    await tell(tree, true);
    expect(styleOf(lineOf(tree)!).opacity).toBe(1);

    await tell(tree, false);
    expect(styleOf(lineOf(tree)!).opacity).toBe(0);
  });

  it('stands its line under a band inside the list (a pinned day), where content goes under it', async () => {
    const tree = await render(
      <EdgeFlatList data={['a', 'b']} renderItem={({ item }) => <Text>{item}</Text>} insetTop={44} />,
    );
    expect(edgesOf(tree).props.insetTop).toBe(44);
    await tell(tree, true);
    expect(styleOf(lineOf(tree)!)).toMatchObject({ top: 44, opacity: 1 });
  });

  it('draws the line under a sheet’s head and a form’s bar too', async () => {
    for (const element of [
      <SheetScroll key="sheet">
        <Text>Choices</Text>
      </SheetScroll>,
      <RevealScrollView key="form">
        <Text>Fields</Text>
      </RevealScrollView>,
    ]) {
      const tree = await render(element);
      expect(styleOf(lineOf(tree)!).opacity).toBe(0);
      await tell(tree, true);
      expect(styleOf(lineOf(tree)!).opacity).toBe(1);
    }
  });

  it('has no line where nothing stands over the top', async () => {
    const tree = await render(
      <ScrollEdges top={false}>
        <Text>Rows</Text>
      </ScrollEdges>,
    );
    expect(edgesOf(tree).props).toMatchObject({ top: false, fadeStart: false, fadeEnd: false });
    expect(edgesOf(tree).props.onUnder).toBeUndefined();
    expect(lineOf(tree)).toBeNull();
  });

  it('fades both ends of a box capped mid-content, with no line', async () => {
    const tree = await render(
      <EdgeScrollView capped style={{ maxHeight: 200 }}>
        <Text>Suggestions</Text>
      </EdgeScrollView>,
    );
    const edges = edgesOf(tree);
    expect(edges.props).toMatchObject({ top: false, horizontal: false, fadeStart: true, fadeEnd: true });
    // The cap lays the box out: it goes to the wrapper Android draws around.
    expect(StyleSheet.flatten(edges.props.style)).toMatchObject({ maxHeight: 200 });
    expect(lineOf(tree)).toBeNull();
  });

  it('fades the sides of a strip that scrolls sideways, one side where a held column stands at its start', async () => {
    const strip = await render(
      <EdgeScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text>Chips</Text>
      </EdgeScrollView>,
    );
    expect(edgesOf(strip).props).toMatchObject({ horizontal: true, top: false, fadeStart: true, fadeEnd: true });
    expect(lineOf(strip)).toBeNull();
    // The scroller itself still runs sideways.
    expect(strip.root.findAll(node => typeof node.type === 'string' && node.props.horizontal === true && node !== edgesOf(strip)).length).toBeGreaterThan(0);

    const table = await render(
      <EdgeScrollView horizontal fade="end">
        <Text>Columns</Text>
      </EdgeScrollView>,
    );
    expect(edgesOf(table).props).toMatchObject({ horizontal: true, fadeStart: false, fadeEnd: true });
  });
});
