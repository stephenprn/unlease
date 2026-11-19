/**
 * The quick window over the home screen (android/.../widget/QuickActivity): one sheet, then the home
 * screen again. The link field, filled from the clipboard when it holds a link; the field a list's
 * widget adds items with (`item`); a new note, list, reminder or photo note (`new`: the widgets'
 * shortcuts, which never open the app); or the picker a widget is pointed with, as it is placed or
 * later from the widget itself (a lists widget's head: which of its label's notes). The window is its own scrim.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { t, tx } from '@unlease/core/i18n';
import { shownTitle } from '@unlease/notes/models/entities';
import { addedMessage, addedTone } from '@unlease/notes/services/savedLinks';
import { extractUrls } from '@unlease/core/services/url';
import { formatReminder } from '@unlease/core/services/format';
import type { MediaFile } from '@shared/platform/media';
import { captureNoteWith, pickPhotos } from '@app/media';
import { reconcileReminders } from '@app/hooks/useReminders';
import type { CapturedNote } from '@app/store/actions';
import { useAppLifecycle } from '@shared/app/hooks/useAppLifecycle';
import { useLibraryStore } from '@app/store/libraryStore';
import { showSnack } from '@shared/app/store/uiStore';
import { appScheme } from '@shared/app/variant';
import { leaveQuick, pointWidget } from '@app/widgets';
import { listsTarget } from '@app/widgetPayloads';
import { clearQuickScrim, quickClipboard, type WidgetKind } from '@platform/widgets';

import { SheetScrim, Snackbar, Tappable } from '../../components';
import { duration } from '@shared/ui/theme/motion';
import { LinkCaptureSheet, type LinkTarget } from '../capture/CaptureSheet';
import { MoveSheet } from '../lines/MoveSheet';
import { AddItemSheet } from './AddItemSheet';
import { LabelPickerSheet } from './LabelPickerSheet';
import { ListPickerSheet } from './ListPickerSheet';
import { NotePickerSheet } from './NotePickerSheet';
import { QuickNoteSheet } from './QuickNoteSheet';

export interface QuickLaunch {
  readonly mode: 'link' | 'item' | 'new' | WidgetKind;
  readonly widgetId: number;
  /** The collection a link goes to, the list an item goes to, what a new note is and its label (`note/<label>`), or what the widget shows now; '' for none. */
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
  lists: { placing: tx('Which label’s lists to show?'), changing: tx('Show another list') },
};

export function QuickRoot({ launch }: { launch: QuickLaunch }) {
  return (
    <SheetScrim.Provider value={false}>
      <View style={styles.root}>
        {launch.mode === 'link' ? (
          <QuickLink target={launch.target} />
        ) : launch.mode === 'item' ? (
          <QuickItem target={launch.target} />
        ) : launch.mode === 'new' ? (
          <QuickNew target={launch.target} />
        ) : (
          <QuickPicker launch={launch} kind={launch.mode} />
        )}
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

/** « + » on a list's widget: items added one after another, synced while the window is up and as it closes. */
function QuickItem({ target }: { target: string }) {
  useAppLifecycle();
  const [open, setOpen] = useState(true);
  const dismiss = useCallback(() => {
    setOpen(false);
    setTimeout(() => leaveQuick(false), EXIT_MS);
  }, []);
  return <AddItemSheet visible={open} noteId={target} onDismiss={dismiss} />;
}

/** What a widget's shortcut starts over the home screen. */
type NewKind = 'note' | 'checklist' | 'reminder' | 'photo' | 'camera';
const NEW_KINDS: readonly NewKind[] = ['note', 'checklist', 'reminder', 'photo', 'camera'];

/**
 * A widget's shortcut (Actions rapides, a label's « + »): the note written in a sheet over the home
 * screen, the photos picked or taken first; saved, a slip says so and the home screen is back.
 */
function QuickNew({ target }: { target: string }) {
  useAppLifecycle();
  const [what, labelId = ''] = target.split('/');
  const kind: NewKind = NEW_KINDS.includes(what as NewKind) ? (what as NewKind) : 'note';
  const photographed = kind === 'photo' || kind === 'camera';
  // The photos come before the sheet: picked, it opens on them; let go, the home screen is back.
  const [photos, setPhotos] = useState<readonly MediaFile[] | null>(photographed ? null : []);
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!photographed) return;
    let live = true;
    pickPhotos(kind === 'camera' ? 'camera' : 'gallery').then(outcome => {
      if (!live) return;
      if (outcome.status === 'ok') {
        setPhotos(outcome.files);
        return;
      }
      if (outcome.status === 'cancelled') {
        leaveQuick(false);
        return;
      }
      clearQuickScrim();
      showSnack(outcome.message, undefined, { tone: 'error' });
      setTimeout(() => leaveQuick(false), CONFIRM_MS);
    });
    return () => {
      live = false;
    };
  }, [photographed, kind]);

  const dismiss = useCallback(() => {
    setOpen(false);
    setTimeout(() => leaveQuick(false), EXIT_MS);
  }, []);

  const save = useCallback(
    (note: Omit<CapturedNote, 'photos'>) => {
      captureNoteWith(note, photos ?? []);
      setOpen(false);
      setSaved(true);
      clearQuickScrim();
      let armed: Promise<void> = Promise.resolve();
      if (note.reminderAt !== null) {
        // Armed before the window goes: the app may not open before it rings, and the first reminder
        // asks Android for notifications, whose answer comes back to this window.
        armed = reconcileReminders(useLibraryStore.getState().notes).catch(() => undefined);
        showSnack(t('Reminder: {when}', { when: formatReminder(note.reminderAt, Date.now()) }), undefined, { tone: 'success' });
      } else {
        showSnack(note.kind === 'checklist' ? t('List saved') : t('Note saved'), undefined, { tone: 'success' });
      }
      Promise.all([armed, new Promise(done => setTimeout(done, CONFIRM_MS))]).then(() => leaveQuick(false));
    },
    [photos],
  );

  if (photos === null) return null;
  return (
    <>
      <QuickNoteSheet
        visible={open}
        kind={kind === 'checklist' ? 'checklist' : 'text'}
        labelId={labelId}
        photos={photos}
        askReminder={kind === 'reminder'}
        onDismiss={dismiss}
        onSave={save}
      />
      {saved ? <Tappable accessibilityLabel={t('Close')} noTint onPress={() => leaveQuick(false)} style={StyleSheet.absoluteFill} /> : null}
    </>
  );
}

/** The picker a widget is pointed with: a pick draws it at once, and placing it completes. */
function QuickPicker({ launch, kind }: { launch: QuickLaunch; kind: WidgetKind }) {
  // A lists widget's head shows its label's notes; « Show another label » turns it into the label picker.
  const [labels, setLabels] = useState(false);
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
  if (kind === 'lists') {
    const { label, note } = listsTarget(launch.target);
    // Placed (or pointed again from the launcher): its label, its first note shown until another is picked.
    if (launch.configuring || !label || labels) {
      return <LabelPickerSheet visible={open} current={label || null} title={t(TITLES.lists.placing)} onDismiss={dismiss} onPick={pick} />;
    }
    return (
      <ListPickerSheet
        visible={open}
        label={label}
        current={note || null}
        title={title}
        onDismiss={dismiss}
        onPick={id => pick(`${label}/${id}`)}
        onOtherLabel={() => setLabels(true)}
      />
    );
  }
  if (kind === 'collection') return <MoveSheet visible={open} currentLineId={current} title={title} onDismiss={dismiss} onPick={pick} />;
  if (kind === 'label') return <LabelPickerSheet visible={open} current={current} title={title} onDismiss={dismiss} onPick={pick} />;
  return <NotePickerSheet visible={open} current={current} title={title} onDismiss={dismiss} onPick={pick} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
