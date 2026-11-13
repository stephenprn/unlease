/**
 * The quick window over the home screen (android/.../widget/QuickActivity): one sheet, then the home
 * screen again. The link field, filled from the clipboard when it holds a link; or the picker a widget
 * is pointed with, as it is placed or later from the widget itself. The window is its own scrim.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { shownTitle } from '@unlease/notes/models/entities';
import { addedMessage, addedTone } from '@unlease/notes/services/savedLinks';
import { extractUrls } from '@unlease/core/services/url';
import { useAppLifecycle } from '@shared/app/hooks/useAppLifecycle';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';
import { appScheme } from '@shared/app/variant';
import { leaveQuick, pointWidget } from '@app/widgets';
import { clearQuickScrim, quickClipboard, type WidgetKind } from '@platform/widgets';

import { SheetScrim, Snackbar, Tappable } from '../../components';
import { duration } from '@shared/ui/theme/motion';
import { LinkCaptureSheet, type LinkTarget } from '../capture/CaptureSheet';
import { MoveSheet } from '../lines/MoveSheet';
import { LabelPickerSheet } from './LabelPickerSheet';
import { NotePickerSheet } from './NotePickerSheet';

export interface QuickLaunch {
  readonly mode: 'link' | WidgetKind;
  readonly widgetId: number;
  /** The collection a link goes to, or what the widget shows now; '' for none. */
  readonly target: string;
  /** The widget is being placed: leaving without a choice cancels it. */
  readonly configuring: boolean;
}

/** Once a link is saved, the slip says so this long over the home screen, then the window goes. */
const CONFIRM_MS = 1_600;
/** A sheet's own exit, then the window. */
const EXIT_MS = duration.exit + 40;

const TITLES: Record<WidgetKind, { readonly placing: string; readonly changing: string }> = {
  collection: { placing: tx('Which collection to show?'), changing: tx('Change collection') },
  label: { placing: tx('Which label to show?'), changing: tx('Show another label') },
  note: { placing: tx('Which note to show?'), changing: tx('Show another note') },
};

export function QuickRoot({ launch }: { launch: QuickLaunch }) {
  return (
    <SheetScrim.Provider value={false}>
      <View style={styles.root}>
        {launch.mode === 'link' ? <QuickLink target={launch.target} /> : <QuickPicker launch={launch} kind={launch.mode} />}
        <Snackbar />
      </View>
    </SheetScrim.Provider>
  );
}

/** "Classer un lien" over the home screen: saved, a short slip says where, and the home screen is back. */
function QuickLink({ target }: { target: string }) {
  // The window syncs while it is up, and what was saved goes out as it closes.
  useAppLifecycle();
  // A collection widget's "+": the link goes to that collection.
  const preset = useLibraryStore(s => (target && s.notes[target]?.kind === 'links' && s.notes[target]?.trashedAt === null ? s.notes[target] : undefined));
  const [initial, setInitial] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    quickClipboard().then(clip => {
      if (live) setInitial(extractUrls(clip)[0] ?? '');
    });
    return () => {
      live = false;
    };
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    setTimeout(() => leaveQuick(false), EXIT_MS);
  }, []);

  const added = useCallback((placed: Parameters<typeof addedMessage>[0], into: LinkTarget) => {
    setOpen(false);
    setSaved(true);
    clearQuickScrim();
    const auto = into === 'auto';
    const message = addedMessage(placed, auto ? { into: null } : { into, announce: true }, useLibraryStore.getState().notes);
    showSnack(message ?? (placed.length > 1 ? t('Links kept: Claude is filing them') : t('Link kept: Claude is filing it')), undefined, { tone: addedTone(placed) });
    setTimeout(() => leaveQuick(false), CONFIRM_MS);
  }, []);

  return (
    <>
      <LinkCaptureSheet
        visible={open && initial !== null}
        initial={initial ?? ''}
        preset={preset?.id ?? null}
        title={preset ? (shownTitle(preset).trim() ? t('Add to {collection}', { collection: shownTitle(preset).trim() }) : t('Add to this collection')) : t('File a link')}
        offerClipboard={false}
        onDismiss={dismiss}
        onAdded={added}
        onAdmin={() => {
          Linking.openURL(`${appScheme('notes')}://admin`).catch(() => undefined);
          leaveQuick(false);
        }}
      />
      {saved ? <Tappable accessibilityLabel={t('Close')} noTint onPress={() => leaveQuick(false)} style={StyleSheet.absoluteFill} /> : null}
    </>
  );
}

/** The picker a widget is pointed with: a pick draws it at once, and placing it completes. */
function QuickPicker({ launch, kind }: { launch: QuickLaunch; kind: WidgetKind }) {
  const [open, setOpen] = useState(true);
  const picked = useRef(false);
  const dismiss = useCallback(() => {
    setOpen(false);
    // A pick comes in the same press, right after: the window waits for the sheet's exit either way.
    setTimeout(() => leaveQuick(picked.current), EXIT_MS);
  }, []);
  const pick = useCallback(
    (target: string) => {
      picked.current = true;
      pointWidget(launch.widgetId, kind, target);
    },
    [launch.widgetId, kind],
  );
  const current = launch.target || null;
  const title = t(launch.configuring ? TITLES[kind].placing : TITLES[kind].changing);
  if (kind === 'collection') return <MoveSheet visible={open} currentLineId={current} title={title} onDismiss={dismiss} onPick={pick} />;
  if (kind === 'label') return <LabelPickerSheet visible={open} current={current} title={title} onDismiss={dismiss} onPick={pick} />;
  return <NotePickerSheet visible={open} current={current} title={title} onDismiss={dismiss} onPick={pick} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
