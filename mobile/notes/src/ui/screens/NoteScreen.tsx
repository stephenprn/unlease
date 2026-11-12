/**
 * The note editor: saved as you type, no save button; leaving an empty new note discards it,
 * as Keep does. The note's colour or gradient paints the whole sheet, its paper under the text.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Share, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackActions } from '@react-navigation/native';

import { APPS } from '@unlease/core/apps';
import { t, tc } from '@unlease/core/i18n';
import { cutNotice, formatEdited, formatReminder } from '@unlease/core/services/format';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import { useMinute } from '@shared/app/hooks/useMinute';
import { pickInto } from '@app/media';
import {
  convertToChecklist,
  convertToCollection,
  convertToText,
  canDuplicate,
  deleteForever,
  duplicateNote,
  isEmptyNote,
  restoreNotes,
  saveTypedText,
  setArchived,
  setColor,
  setLabels,
  setPattern,
  setPeople,
  setPinned,
  setReminder,
  trashNotes,
} from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { noteEditedAt } from '@unlease/notes/sync/entities';
import { showSnack } from '@shared/app/store/uiStore';
import { onBeforePause } from '@shared/app/sync/syncManager';
import { contactPlace, eventPlace, openInApp } from '@shared/app/openApp';
import { mentionName } from '@unlease/notes/services/noteMentions';
import { canBecomeCollection, listConvertedMessage, notLinksWords } from '@unlease/notes/services/listToCollection';

import { noteBackdrop, patternBackdrop } from '@unlease/design/backgrounds';
import { isRuledPattern } from '@unlease/design/colors';
import { SHAPES } from '@unlease/design/shapes';

import { AppText, Button, Dialog, EdgeScrollView, EmptyState, Grain, Ground, IconButton, LabelMark, ListRow, Menu, MentionSuggestions, Sheet, Tappable, TopBar, Icon } from '../components';
import { useGrowingInput } from '@shared/ui/components/useGrowingInput';
import { useKeyboardVisible } from '@shared/ui/components/useKeyboardVisible';
import { ChecklistEditor } from '../features/note/ChecklistEditor';
import { FormatBar } from '../features/note/FormatBar';
import { NoteColorSheet } from '../features/note/NoteColorSheet';
import { LabelsSheet } from '../features/note/LabelsSheet';
import { PeopleChips } from '../features/people/PeopleChips';
import { PeopleSheet } from '../features/people/PeopleSheet';
import { useHasPeople } from '@app/hooks/useNotePeople';
import { NoteHistoryContext, useNoteHistory } from '@app/hooks/useNoteHistory';
import { PhotoGrid } from '../features/note/PhotoGrid';
import { ReminderSheet } from '../features/note/ReminderSheet';
import { RichBody } from '../features/note/RichBody';
import { useNoteBody } from '../features/note/useNoteBody';
import { useMentionRows } from '../features/mentions/mentionRows';
import { EventsMentioning } from '../features/events/EventsMentioning';
import { navigationRef } from '../navigation/navigationRef';
import type { ScreenProps } from '../navigation/types';
import { accelerate, decelerate, duration } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { variantStyle } from '@shared/ui/theme/typography';
import { DrawingSheet } from '../features/drawing/DrawingSheet';

type Sheets = 'reminder' | 'color' | 'labels' | 'people' | 'add' | null;

/** Ruled lines on the editor's own lines: 26dp apart, under the baseline of each (8dp of padding above). */
const BODY_RULE = { pitch: 26, offset: 30 };
/** On a checklist, one rule under each 48dp row. */
const CHECK_RULE = { pitch: 48, offset: 47 };
/** How many rules a ruled paper reaches above the text it rules, up to the sheet's top (a whole number, so they stay in step). */
const RULED_REACH = 80;
/** The bottom bar turning into the selection's formatting, and back: one fades into the other in place. */
const BAR_IN = FadeIn.duration(duration.short).easing(decelerate);
const BAR_OUT = FadeOut.duration(duration.short).easing(accelerate);

/** « @ » asks for a person or an event only while this phone holds some (Contacts' and Agenda's records, synced as Carnet reads them). */
const hasPeople = (): boolean => {
  const state = useLibraryStore.getState();
  return state.people.liveContacts.length > 0 || Object.values(state.agenda.events).some(event => event.deletedAt === null && event.trashedAt === null);
};

export function NoteScreen({ navigation, route }: ScreenProps<'Note'>) {
  const { id, focus, reminder } = route.params;
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  const note = useLibraryStore(s => s.notes[id]);
  const labels = useLibraryStore(s => s.labels);
  // People are offered once this phone holds some (Contacts' records, synced as Carnet reads them).
  const peopleHere = useHasPeople();
  // Editing an item of the list or adding a photo changes the note too.
  const edited = useLibraryStore(s => {
    const current = s.notes[id];
    if (!current) return 0;
    return noteEditedAt(current, (s.checksByNote[id] ?? []).flatMap(cid => s.checks[cid] ?? []), (s.attachmentsByNote[id] ?? []).flatMap(aid => s.attachments[aid] ?? []));
  });
  const now = useMinute();
  const [sheet, setSheet] = useState<Sheets>(reminder ? 'reminder' : null);
  const [menu, setMenu] = useState(false);
  const [confirmForever, setConfirmForever] = useState(false);
  /** « Transformer en collection » refused: which items are not links. */
  const [refusal, setRefusal] = useState<ReturnType<typeof notLinksWords> | null>(null);
  const closeRefusal = useCallback(() => setRefusal(null), []);
  // A checklist with an item, or a text note with a line, may become a collection (a text note's typed words count too).
  const convertible = useLibraryStore(s => {
    const current = s.notes[id];
    return !!current && canBecomeCollection(current, s);
  });
  /** Deleted for good from here: the screen leaves without announcing it. */
  const [leaving, setLeaving] = useState(false);
  const [title, setTitle] = useState(note?.title ?? '');
  const saved = useRef({ title: note?.title ?? '' });
  // The title grows with its lines, which stay still as one is added.
  const titleGrowing = useGrowingInput();
  const timers = useRef<{ title?: ReturnType<typeof setTimeout> }>({});
  const editable = !!note && note.trashedAt === null && note.deletedAt === null;
  // « Annuler » and « Rétablir »: this session's changes to the note, what is typed saved first (a drawing's strokes keep their own pair).
  const flushTyped = useRef<() => void>(() => undefined);
  const history = useNoteHistory(id, editable && note.kind !== 'drawing', useCallback(() => flushTyped.current(), []));
  // A text note's body: its lines, formatted or plain, saved as they are typed (an edit from another device comes in there too).
  const body = useNoteBody(id, note, hasPeople, history);
  const flushBody = body.flush;
  // « @word » typed: whom or what to mention rides on the keyboard, over the note's bar.
  const mentionRows = useMentionRows(body.mentionQuery?.query ?? null, body.mention);

  // Bring in an edit from another device to the title when it is not being typed in.
  useEffect(() => {
    if (!note) return;
    if (note.title !== saved.current.title && timers.current.title === undefined) {
      saved.current.title = note.title;
      setTitle(note.title);
    }
  }, [note]);

  const flushTitle = useCallback(
    (value: string) => {
      clearTimeout(timers.current.title);
      timers.current.title = undefined;
      if (saved.current.title === value) return;
      // Another device's edit that landed while typing is merged in, not overwritten.
      const stored = saveTypedText('note', id, 'title', saved.current.title, value);
      saved.current.title = stored;
      if (stored !== value) setTitle(stored);
    },
    [id],
  );

  const editTitle = (value: string) => {
    history.keystroke();
    // A paste the limit cut, which the field does without a word.
    const limit = TEXT_LIMITS.note.title;
    if (value.length >= limit && value.length - title.length > 1) showSnack(cutNotice('Titre', limit), undefined, { tone: 'warning' });
    setTitle(value);
    clearTimeout(timers.current.title);
    timers.current.title = setTimeout(() => flushTitle(value), 350);
  };

  // Save what is typed on the way out, and discard a note left empty.
  const latest = useRef({ title });
  latest.current = { title };
  flushTyped.current = () => {
    flushTitle(latest.current.title);
    flushBody();
  };
  // Leaving the app: what is typed is saved before the last push.
  useEffect(
    () =>
      onBeforePause(() => {
        flushTitle(latest.current.title);
        flushBody();
      }),
    [flushTitle, flushBody],
  );
  useEffect(
    () => () => {
      flushTitle(latest.current.title);
      flushBody();
      if (isEmptyNote(id)) deleteForever([id]);
    },
    [flushTitle, flushBody, id],
  );

  if (!note || note.deletedAt !== null) {
    if (leaving) return <View style={styles.screen} />;
    return (
      <View style={styles.screen}>
        <Ground />
        <TopBar onBack={() => navigation.goBack()} />
        <EmptyState scene="trash" title={t('Introuvable')} text={t('Cette note n’existe plus.')} />
      </View>
    );
  }

  // Dots and grids lie still over the sheet; ruled papers (lines, Seyès) scroll with the text they rule, from the sheet's top to its foot.
  // A drawing has no lines of text to rule: every paper lies still over its sheet.
  const ruled = isRuledPattern(note.pattern) && note.kind !== 'drawing';
  const backdrop = noteBackdrop(theme.mode, note.color, ruled ? null : note.pattern);
  // The keyboard would cover a sheet opened over a focused field.
  const openSheet = (next: Exclude<Sheets, null>) => {
    Keyboard.dismiss();
    setSheet(next);
  };
  const back = () => navigation.goBack();
  const noteLabels = note.labelIds.map(lid => labels[lid]).filter(l => !!l && l.deletedAt === null);
  const formatting = note.kind === 'text' && editable ? body.range : null;

  /** Saves what is typed; true when the note is empty, so leaving discards it and there is nothing to undo. */
  const discarding = () => {
    flushTitle(title);
    flushBody();
    return isEmptyNote(id);
  };

  const trash = () => {
    if (discarding()) {
      back();
      return;
    }
    const undo = trashNotes([id]);
    back();
    showSnack(t('Note placée dans la corbeille'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };

  const archive = () => {
    if (discarding()) {
      back();
      return;
    }
    const undo = setArchived(id, !note.archived);
    back();
    showSnack(note.archived ? t('Note désarchivée') : t('Note archivée'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
  };

  /**
   * « Transformer en collection »: every item an address, a collection of them takes the note's place
   * (the note to the bin), opened over it; else the items that are not links, said in a dialog.
   */
  const toCollection = () => {
    flushTitle(title);
    flushBody();
    const outcome = convertToCollection(id);
    if (outcome.status === 'notLinks') {
      setRefusal(notLinksWords(note.kind, outcome.lines));
      return;
    }
    if (outcome.status !== 'ok') return;
    navigation.replace('Line', { id: outcome.collectionId });
    showSnack(
      listConvertedMessage(outcome.title, outcome.links),
      {
        label: tc('undo', 'Annuler'),
        run: () => {
          outcome.undo();
          // Still on the collection: the note comes back in its place.
          const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
          if (route?.name === 'Line' && (route.params as { id?: string } | undefined)?.id === outcome.collectionId) navigationRef.dispatch(StackActions.replace('Note', { id }));
        },
      },
      { tone: 'success' },
    );
  };

  const deleteNow = () => {
    setConfirmForever(false);
    setLeaving(true);
    deleteForever([id]);
    back();
    showSnack(t('Note supprimée définitivement'), undefined, { tone: 'success' });
  };

  const shareText = () => {
    // The words alone: a formatted note's marks and headings stay here.
    const parts = [note.title, note.kind === 'text' ? body.text : ''];
    if (note.kind === 'checklist') {
      const s = useLibraryStore.getState();
      for (const cid of s.checksByNote[id] ?? []) {
        const item = s.checks[cid];
        if (item) parts.push(`${item.checked ? '☑' : '☐'} ${item.text}`);
      }
    }
    Share.share({ message: parts.filter(Boolean).join('\n'), title: note.title || undefined }).catch(() => {});
  };

  return (
    <NoteHistoryContext.Provider value={history}>
      <View style={[styles.screen, backdrop]}>
        <Grain />
        <TopBar
          onBack={back}
          actions={
            editable ? (
              <>
                <IconButton
                  icon="pin"
                  label={note.pinned ? t('Retirer des épinglées') : t('Épingler')}
                  selected={note.pinned}
                  tone="ink"
                  shape={0}
                  onPress={() => setPinned(id, !note.pinned)}
                />
                <IconButton icon={note.reminderAt ? 'bell' : 'bellPlus'} label={t('Rappel')} selected={note.reminderAt !== null} tone="ink" shape={1} onPress={() => openSheet('reminder')} />
                <IconButton icon={note.archived ? 'unarchive' : 'archive'} shape={2} label={note.archived ? t('Désarchiver') : t('Archiver')} onPress={archive} />
              </>
            ) : null
          }
        />
        {!editable ? (
          <View style={styles.trashBanner}>
            <AppText variant="meta" style={styles.trashText}>
              {t('Une note dans la corbeille ne peut pas être modifiée.')}
            </AppText>
            <Button kind="tonal" label={t('Restaurer')} icon="restore" onPress={() => restoreNotes([id])} />
          </View>
        ) : null}
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          <EdgeScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <PhotoGrid noteId={id} editable={editable} />
            <View style={styles.text}>
              <TextInput
                ref={titleGrowing.attach}
                value={title}
                onChangeText={editTitle}
                onBlur={() => flushTitle(title)}
                editable={editable}
                placeholder={t('Titre')}
                placeholderTextColor={theme.color.inkFaint}
                selectionColor={theme.color.highlight}
                selectionHandleColor={theme.color.focus}
                cursorColor={theme.color.focus}
                multiline
                submitBehavior="blurAndSubmit"
                autoFocus={focus === 'title'}
                style={[variantStyle(theme, 'editorTitle'), styles.title, note.kind === 'text' ? styles.textTitle : null]}
                maxLength={TEXT_LIMITS.note.title}
                accessibilityLabel={t('Titre')}
              />
              {note.kind === 'drawing' ? (
                <DrawingSheet noteId={id} editable={editable} />
              ) : note.kind === 'text' ? (
                <View style={styles.writing}>
                  {ruled ? <View pointerEvents="none" style={[styles.paper, { top: -BODY_RULE.pitch * RULED_REACH }, patternBackdrop(theme.mode, note.pattern, BODY_RULE)]} /> : null}
                  <RichBody editor={body} editable={editable} autoFocus={focus === 'body'} style={styles.body} />
                </View>
              ) : (
                <View style={styles.writing}>
                  {ruled ? <View pointerEvents="none" style={[styles.paper, { top: -CHECK_RULE.pitch * RULED_REACH }, patternBackdrop(theme.mode, note.pattern, CHECK_RULE)]} /> : null}
                  <ChecklistEditor noteId={id} editable={editable} autoFocusFirst={focus === 'check'} />
                </View>
              )}
            </View>
            {/* The events that mention the note, in Agenda. */}
            {keyboard ? null : <EventsMentioning type="note" id={id} />}
          </EdgeScrollView>
          {/* What the note wears, at its foot above the bar that changes it, as on its card (aside while typing). */}
          {!keyboard && (note.reminderAt !== null || noteLabels.length > 0 || note.contactIds.length > 0) ? (
            <View style={styles.chips}>
              {note.reminderAt !== null ? (
                <Tappable onPress={() => openSheet('reminder')} disabled={!editable} ownDisabled hitSlop={CHIP_SLOP} style={[styles.chip, CHIP, { borderColor: theme.color.outline }]} accessibilityLabel={t('Modifier le rappel')}>
                  <Icon name="bell" size={16} color={note.reminderAt < now ? theme.color.danger : theme.color.inkMuted} />
                  <AppText variant="label" color={note.reminderAt < now ? theme.color.danger : undefined}>
                    {formatReminder(note.reminderAt, now)}
                  </AppText>
                </Tappable>
              ) : null}
              {noteLabels.map(label => (
                <Tappable key={label!.id} onPress={() => openSheet('labels')} disabled={!editable} ownDisabled hitSlop={CHIP_SLOP} style={[styles.chip, CHIP, { borderColor: theme.color.outline }]} accessibilityLabel={t('Label {name}', { name: label!.name })}>
                  <LabelMark name={label!.name} color={label!.color} />
                </Tappable>
              ))}
              <PeopleChips ids={note.contactIds} />
            </View>
          ) : null}
          {body.mentionQuery && editable ? (
            <MentionSuggestions
              rows={mentionRows}
              label={t('Mentionner un contact ou un événement')}
              empty={mentionRows.length === 0 && !/\s/.test(body.mentionQuery.query) ? (body.mentionQuery.query.trim() ? t('Aucun contact ni événement ne s’appelle ainsi.') : t('Aucun contact pour l’instant.')) : null}
            />
          ) : null}
          {/* Lifted onto the keyboard, the bar is already clear of the gesture bar: no second inset. */}
          <View style={[styles.toolbar, { paddingBottom: keyboard ? 0 : insets.bottom, borderTopColor: theme.color.hairline }]}>
            {/* Words selected in the text: the bar turns into their formatting in place, and back once nothing is selected. */}
            <View style={styles.toolbarSlot}>
              <LayoutAnimationConfig skipEntering>
                {formatting ? (
                  <Animated.View key="format" entering={BAR_IN} exiting={BAR_OUT} style={styles.toolbarRow} accessibilityRole="toolbar" accessibilityLabel={t('Mise en forme')}>
                    <FormatBar lines={body.lines} range={formatting} onFormat={body.format} />
                  </Animated.View>
                ) : (
                  <Animated.View key="note" entering={BAR_IN} exiting={BAR_OUT} style={styles.toolbarRow}>
                    {editable ? (
                      <>
                        {body.mentionAtCaret?.type === 'event' ? (
                          // The caret on an event: a tap away in Agenda.
                          <IconButton icon="calendar" label={t('Ouvrir {name} dans {app}', { name: mentionName(body.mentionAtCaret), app: APPS.calendar.name })} onPress={() => openInApp('calendar', eventPlace(body.mentionAtCaret!.id)).catch(() => undefined)} shape={2} />
                        ) : body.mentionAtCaret ? (
                          // The caret on a mention: its person, a tap away in Contacts.
                          <IconButton icon="person" label={t('Ouvrir {name} dans {app}', { name: mentionName(body.mentionAtCaret), app: APPS.contacts.name })} onPress={() => openInApp('contacts', contactPlace(body.mentionAtCaret!.id)).catch(() => undefined)} shape={2} />
                        ) : null}
                        <IconButton icon="plus" label={t('Ajouter')} onPress={() => openSheet('add')} shape={0} />
                        <IconButton icon="palette" label={t('Couleur et papier')} onPress={() => openSheet('color')} shape={1} />
                        <IconButton icon="tag" label={t('Labels')} onPress={() => openSheet('labels')} shape={2} />
                      </>
                    ) : (
                      // In the bin nothing is edited: the note comes back (the banner) or goes for good.
                      <IconButton icon="trash" label={t('Supprimer définitivement')} onPress={() => setConfirmForever(true)} shape={0} />
                    )}
                    {/* The date, until something is done to the note: then « Annuler » and « Rétablir » take its place for the session, as in Keep, each disabled at its end of the history. */}
                    <View style={styles.middle}>
                      {history.started ? (
                        <Animated.View key="history" entering={BAR_IN} exiting={BAR_OUT} style={styles.middleRow}>
                          <IconButton icon="undo" label={tc('undo', 'Annuler')} shape={3} disabled={!history.canUndo} onPress={history.undo} />
                          <IconButton icon="undo" label={t('Rétablir')} shape={0} disabled={!history.canRedo} onPress={history.redo} style={styles.mirrored} />
                        </Animated.View>
                      ) : (
                        <Animated.View key="date" entering={BAR_IN} exiting={BAR_OUT} style={styles.middleRow}>
                          <AppText variant="meta" style={styles.edited} numberOfLines={1}>
                            {formatEdited(edited, now)}
                          </AppText>
                        </Animated.View>
                      )}
                    </View>
                    {editable ? (
                      <IconButton icon="more" label={t('Plus d’actions')} shape={1} onPress={() => {
                          Keyboard.dismiss();
                          setMenu(true);
                        }} />
                    ) : (
                      <View style={styles.toolbarEnd} />
                    )}
                  </Animated.View>
                )}
              </LayoutAnimationConfig>
            </View>
          </View>
        </KeyboardAvoidingView>

        <Menu
          visible={menu}
          onDismiss={() => setMenu(false)}
          bottom={56}
          items={[
            // A drawing's words are its title alone: there is nothing to share as text (as on the web, where it has no « Copier le texte »).
            ...(note.kind === 'drawing' ? [] : [{ label: t('Partager'), icon: 'share' as const, onPress: shareText }]),
            {
              label: t('Dupliquer'),
              icon: 'copy',
              // An empty note's copy would be discarded the moment it was left: nothing to duplicate yet.
              disabled: !canDuplicate(id, { title, body: body.text }),
              onPress: () => {
                flushTitle(title);
                flushBody();
                if (!canDuplicate(id)) return;
                const copy = duplicateNote(id);
                // As on the web: the copy is a tap away, opened over this note (Back comes back to it).
                if (copy) showSnack(t('Note dupliquée'), { label: t('Ouvrir'), run: () => navigationRef.isReady() && navigationRef.dispatch(StackActions.push('Note', { id: copy })) }, { tone: 'success' });
              },
            },
            // A checklist's items, or a text note's lines, all addresses: a collection of them.
            ...(note.kind === 'text' || note.kind === 'checklist'
              ? [{ label: t('Transformer en collection'), icon: 'collections' as const, disabled: !(convertible || (note.kind === 'text' && body.text.trim().length > 0)), onPress: toCollection }]
              : []),
            { label: t('Supprimer'), icon: 'trash', onPress: trash, danger: true },
          ]}
        />
        <ReminderSheet
          visible={sheet === 'reminder'}
          current={note.reminderAt}
          onDismiss={() => setSheet(null)}
          onSet={time => {
            const undo = setReminder(id, time);
            if (time) showSnack(t('Rappel : {when}', { when: formatReminder(time, Date.now()) }), undefined, { tone: 'success' });
            else showSnack(t('Rappel supprimé'), { label: tc('undo', 'Annuler'), run: undo }, { tone: 'success' });
          }}
        />
        <NoteColorSheet
          visible={sheet === 'color'}
          color={note.color}
          pattern={note.pattern}
          onDismiss={() => setSheet(null)}
          onColor={color => setColor(id, color)}
          onPattern={pattern => setPattern(id, pattern)}
        />
        <LabelsSheet visible={sheet === 'labels'} selected={note.labelIds} onDismiss={() => setSheet(null)} onChange={ids => setLabels(id, ids)} />
        <PeopleSheet visible={sheet === 'people'} selected={note.contactIds} onDismiss={() => setSheet(null)} onChange={ids => setPeople('note', id, ids)} />
        <Sheet visible={sheet === 'add'} onDismiss={() => setSheet(null)}>
          <ListRow
            icon="camera"
            title={t('Prendre une photo')}
            onPress={async () => {
              setSheet(null);
              const outcome = await pickInto(id, 'camera');
              if (outcome.status === 'error') showSnack(outcome.message, undefined, { tone: 'error' });
            }}
          />
          <ListRow
            icon="image"
            title={t('Ajouter une image')}
            onPress={async () => {
              setSheet(null);
              const outcome = await pickInto(id, 'gallery');
              if (outcome.status === 'error') showSnack(outcome.message, undefined, { tone: 'error' });
            }}
          />
          {peopleHere || note.contactIds.length > 0 ? (
            <ListRow icon="personPlus" title={t('Personnes')} supporting={t('Pour qui, ou à propos de qui')} onPress={() => setSheet('people')} />
          ) : null}
          {note.kind === 'text' ? (
            <ListRow
              icon="checklist"
              title={t('Cases à cocher')}
              supporting={t('Chaque ligne devient un élément')}
              onPress={() => {
                flushBody();
                convertToChecklist(id);
                setSheet(null);
              }}
            />
          ) : note.kind === 'checklist' ? (
            <ListRow
              icon="note"
              title={t('Masquer les cases à cocher')}
              supporting={t('La liste redevient du texte')}
              onPress={() => {
                convertToText(id);
                setSheet(null);
              }}
            />
          ) : null}
        </Sheet>
        <Dialog
          visible={confirmForever}
          title={t('Supprimer définitivement ?')}
          message={t('Cette note disparaîtra de tous vos appareils. Cette action est irréversible.')}
          confirmLabel={t('Supprimer')}
          danger
          onCancel={() => setConfirmForever(false)}
          onConfirm={deleteNow}
        />
        {/* « Transformer en collection » refused: which items are not links, and one « OK ». */}
        <Dialog visible={refusal !== null} title={refusal?.title ?? ''} message={refusal?.message} confirmLabel={t('OK')} cancelLabel={null} onConfirm={closeRefusal} onCancel={closeRefusal}>
          <View style={styles.refusal}>
            {(refusal?.items ?? []).map((item, index) => (
              <AppText key={`${index}:${item}`} variant="body" numberOfLines={2}>
                {`• ${item}`}
              </AppText>
            ))}
            {refusal?.more ? <AppText variant="meta">{refusal.more}</AppText> : null}
          </View>
        </Dialog>
      </View>
    </NoteHistoryContext.Provider>
  );
}

/** habits-garden's chips: neighbours never share a shape. */
const CHIP = corners(SHAPES.chip);
/** A 40 high chip reaches 48 under a finger, within the 8 between chips. */
const CHIP_SLOP = 4;

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.paper },
    fill: { flex: 1 },
    // The items that are not links, one a line under the refusal's message.
    refusal: { gap: 4 },
    // At least as tall as the screen, so a ruled paper runs on to its foot; the sheet cuts it.
    content: { flexGrow: 1, overflow: 'hidden' },
    text: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8 },
    title: { paddingVertical: 8, paddingHorizontal: 0, color: theme.color.ink },
    // A text note's title ends on the body's rules, then one line is skipped: on every paper, so picking one never moves the words.
    textTitle: { paddingBottom: 16 },
    writing: { flexGrow: 1, paddingBottom: 32 },
    paper: { position: 'absolute', left: -16, right: -16, bottom: 0 },
    // A press anywhere under the text writes at its end.
    body: { flexGrow: 1, paddingVertical: 8, paddingHorizontal: 0, minHeight: 200, color: theme.color.ink },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
    chip: { minHeight: 40, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
    toolbar: { borderTopWidth: StyleSheet.hairlineWidth },
    // The note's actions and the selection's formatting take turns in it, laid over each other while one fades into the other.
    toolbarSlot: { height: 56 },
    toolbarRow: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
    // Between the bar's two groups: the date, or the history's pair, one fading into the other in place.
    middle: { flex: 1, alignSelf: 'stretch' },
    middleRow: { ...StyleSheet.absoluteFill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    edited: { flex: 1, textAlign: 'center' },
    // « Rétablir » is undo's glyph, mirrored.
    mirrored: { transform: [{ scaleX: -1 }] },
    // As wide as the pebble on the left, so the date sits in the middle of the bar.
    toolbarEnd: { width: 48 },
    trashBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.color.paperHigh },
    trashText: { flex: 1 },
  });
