/**
 * A page's drawing block, drawn on the whole screen: on the ground, a top bar (back, « Dessin »,
 * undo and redo), the canvas on a sheet of paper, and the same tools as a drawing note at the foot.
 * Every stroke is saved as it is let go, into the page's own undo too, so Back leaves with
 * everything kept. A drawing in the bin reads as it is and takes nothing.
 */
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t, tc } from '@unlease/core/i18n';
import { isInBin } from '@unlease/notes/services/blocks';
import { useLibraryStore } from '@app/store/libraryStore';
import { saveBlockText } from '@app/store/pages';

import { AppText, Grain, Ground, IconButton, Organic, TopBar } from '../components';
import { DrawingCanvas } from '../features/drawing/DrawingCanvas';
import { DrawingTools } from '../features/drawing/DrawingTools';
import { useDrawingEditor } from '../features/drawing/useDrawingEditor';
import type { ScreenProps } from '../navigation/types';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { Theme } from '../theme/theme';

export function DrawingScreen({ navigation, route }: ScreenProps<'Drawing'>) {
  const { page, block } = route.params;
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const exists = useLibraryStore(s => s.blocks[block]?.kind === 'drawing' && s.blocks[block]?.deletedAt === null);
  const binned = useLibraryStore(s => isInBin(s.blocks, block));
  const stored = useLibraryStore(s => s.blocks[block]?.drawing ?? '');
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
        <View style={styles.gone}>
          <AppText variant="body">{t('Ce dessin n’existe plus.')}</AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar
        onBack={back}
        title={t('Dessin')}
        actions={
          editable ? (
            <>
              <IconButton icon="undo" label={tc('undo', 'Annuler')} shape={1} disabled={!editor.canUndo} onPress={editor.undo} />
              <IconButton icon="undo" label={t('Rétablir')} shape={2} disabled={!editor.canRedo} onPress={editor.redo} style={styles.mirrored} />
            </>
          ) : null
        }
      />
      <View style={[styles.body, editable ? null : { paddingBottom: insets.bottom + 12 }]}>
        <Organic outline="card" style={styles.sheet}>
          <Organic outline="card" style={styles.clip}>
            <Grain />
            <DrawingCanvas editor={editor} style={styles.canvas} />
          </Organic>
        </Organic>
      </View>
      {editable ? <DrawingTools editor={editor} tone="accent" history={false} inset={insets.bottom} /> : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    gone: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    mirrored: { transform: [{ scaleX: -1 }] },
    body: { flex: 1, paddingHorizontal: 12, paddingTop: 4 },
    // The sheet lifts off the ground; what is drawn is clipped by an inner layer, never the shadow.
    sheet: { flex: 1, boxShadow: theme.lift.card },
    clip: { flex: 1, overflow: 'hidden', backgroundColor: theme.color.paper, borderWidth: 1, borderColor: theme.color.hairline },
    canvas: { flex: 1 },
  });
