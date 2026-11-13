/**
 * A page's drawing block, drawn on the whole screen: on the ground, a top bar (back, « Dessin »,
 * undo and redo), the canvas on a sheet (of paper, or of the drawing's own background: « Fond », in
 * its block's `color`), and the same tools as a drawing note at the foot. Every stroke and the
 * background are saved as they change, into the page's own undo too, so Back leaves with
 * everything kept. A drawing in the bin reads as it is and takes nothing.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { DRAWING_NONE, drawingBackgroundOf } from '@unlease/notes/models/drawing';
import { isInBin } from '@unlease/pages/services/blocks';
import { useLibraryStore } from '@app/store/libraryStore';
import { saveBlockText, updateBlock } from '@app/store/pages';

import { EmptyState, Grain, Ground, IconButton, Organic, TopBar } from '@shared/ui/components';
import { DrawingCanvas } from '@carnet/ui/features/drawing/DrawingCanvas';
import { backgroundColorOf, DrawingBackgroundSheet } from '@carnet/ui/features/drawing/DrawingBackgroundSheet';
import { DrawingTools } from '@carnet/ui/features/drawing/DrawingTools';
import { useDrawingEditor } from '@carnet/ui/features/drawing/useDrawingEditor';
import type { ScreenProps } from '../navigation/types';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';

export function DrawingScreen({ navigation, route }: ScreenProps<'Drawing'>) {
  const { page, block } = route.params;
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [choosing, setChoosing] = useState(false);
  const exists = useLibraryStore(s => s.blocks[block]?.kind === 'drawing' && s.blocks[block]?.deletedAt === null);
  const binned = useLibraryStore(s => isInBin(s.blocks, block));
  const stored = useLibraryStore(s => s.blocks[block]?.drawing ?? '');
  const background = useLibraryStore(s => drawingBackgroundOf(s.blocks[block]?.color));
  const read = useCallback(() => useLibraryStore.getState().blocks[block]?.drawing ?? '', [block]);
  const save = useCallback((since: string, typed: string) => saveBlockText(page, block, since, typed, {}, 'drawing'), [page, block]);
  const editable = exists && !binned;
  const editor = useDrawingEditor({ stored, read, save, editable });
  const back = () => navigation.goBack();

  if (!exists) {
    return (
      <View style={styles.screen}>
        <Ground />
        <TopBar onBack={back} />
        <EmptyState scene="trash" title={t('Not found')} text={t('This drawing no longer exists.')} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        onBack={back}
        title={t('Drawing')}
        actions={
          editable ? (
            <>
              <IconButton icon="undo" label={t('Undo')} shape={1} disabled={!editor.canUndo} onPress={editor.undo} />
              <IconButton icon="undo" label={t('Redo')} shape={2} disabled={!editor.canRedo} onPress={editor.redo} style={styles.mirrored} />
            </>
          ) : null
        }
      />
      <View style={[styles.body, editable ? null : { paddingBottom: insets.bottom + 12 }]}>
        <Organic outline="card" style={styles.sheet}>
          <Organic outline="card" style={[styles.clip, background !== DRAWING_NONE ? { backgroundColor: backgroundColorOf(theme, background) } : null]}>
            <Grain />
            <DrawingCanvas editor={editor} style={styles.canvas} />
          </Organic>
        </Organic>
      </View>
      {editable ? <DrawingTools editor={editor} tone="accent" history={false} inset={insets.bottom} background={{ value: background, onPress: () => setChoosing(true) }} /> : null}
      <DrawingBackgroundSheet visible={editable && choosing} value={background} onDismiss={() => setChoosing(false)} onChange={color => updateBlock(page, block, { color })} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    mirrored: { transform: [{ scaleX: -1 }] },
    body: { flex: 1, paddingHorizontal: 12, paddingTop: 4 },
    // The sheet lifts off the ground; what is drawn is clipped by an inner layer, never the shadow.
    sheet: { flex: 1, boxShadow: theme.lift.card },
    clip: { flex: 1, overflow: 'hidden', backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline },
    canvas: { flex: 1 },
  });
