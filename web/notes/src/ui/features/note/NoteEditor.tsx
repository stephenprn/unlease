/**
 * The note editor: a text note or a checklist, edited in place and saved as
 * you type, on a sheet over the board (the whole screen on a phone). There is
 * no save button and no "discard?" prompt; leaving an empty new note discards
 * it, as Keep does. The note's colour washes the whole sheet, the way the card
 * is washed, so opening a note feels like lifting that card off the wall. A
 * note started from the Rappels view opens on its reminder, as on the phone.
 *
 * Under 720px it is the phone's screen (NoteScreen): a top bar (back, pin,
 * reminder, archive) and a bottom bar (Ajouter, Couleur et papier, Labels, the
 * date, Plus d'actions). Wider, Keep's dialog: the pin by the title, one bar of
 * actions at the foot, the date and "Fermer".
 *
 * The text takes bold, italic, underline and headings from the bar over the
 * words selected (`RichBody`). Photos come from the image button, a drop on
 * the sheet, or a paste. With focus outside the text fields, E archives and #
 * deletes; Ctrl+Entrée closes.
 */
import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { t } from '@unlease/core/i18n';
import { isLineColor, isNoteGradient, isRuledPattern } from '@unlease/design/colors';
import { TEXT_LIMITS } from '@unlease/notes/sync/types';
import { cutNotice, formatEdited, formatReminder } from '@unlease/core/services/format';
import { bodyText } from '@unlease/notes/services/noteBody';

import { useMinute } from '../../../app/hooks/useMinute';
import { attachFiles } from '../../../app/media/attach';
import {
  canDuplicate,
  convertToChecklist,
  convertToText,
  deleteForever,
  duplicateNote,
  isEmptyNote,
  restoreNotes,
  setArchived,
  setColor,
  setPattern,
  setLabels,
  setPinned,
  setReminder,
  trashNotes,
  saveTypedText,
  addCheck,
} from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { noteEditedAt } from '@unlease/notes/sync/entities';
import { showError, showSnack, showUndo, showWarning, takeEditorFocus } from '../../../app/store/ui';
import { onBeforePause } from '../../../app/sync/loop';
import { Button } from '../../components/Button';
import { Confirm } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { LabelMark } from '../../components/LabelMark';
import { Layer } from '../../components/Layer';
import { Menu, type MenuItem } from '../../components/Menu';
import { Popover } from '../../components/Popover';
import { currentPage, openNote } from '../../commands';
import { isEditable } from '../../dom';
import { parseRoute } from '../../router';
import { NARROW, useMedia } from '../../useMedia';
import { NoteFinishPicker } from './NoteFinishPicker';
import { DrawingSheet } from '../drawing/DrawingSheet';
import { ChecklistEditor } from './ChecklistEditor';
import styles from './editor.module.css';
import { LabelPicker } from './LabelPicker';
import { PhotoGrid } from './PhotoGrid';
import { ReminderPicker } from './ReminderPicker';
import { RichBody, type RichBodyHandle } from './RichBody';
import { useAutoGrow } from './useAutoGrow';
import { useKeptCaret } from './useKeptCaret';

const SAVE_DELAY_MS = 350;

type Picker = 'reminder' | 'color' | 'labels' | 'more' | 'add' | null;


/** How many editors show each note: StrictMode mounts twice, and a note is discarded only once nothing shows it. */
const shown = new Map<string, number>();

/** True when the editor opens over the Rappels view. */
function overReminders(): boolean {
  const route = parseRoute(new URL(currentPage(), location.origin).pathname);
  return route.name === 'board' && route.view === 'reminders';
}

/** The text of a note, for the clipboard. */
function noteText(id: string): string {
  const state = useLibraryStore.getState();
  const note = state.notes[id];
  if (!note) return '';
  const parts = [note.title.trim()];
  if (note.kind === 'text') parts.push(bodyText(note));
  for (const cid of state.checksByNote[id] ?? []) {
    const item = state.checks[cid];
    if (item) parts.push(`${item.checked ? '[x]' : '[ ]'} ${item.text}`);
  }
  return parts.filter(Boolean).join('\n');
}

/** A row of the phone's "Ajouter" sheet (its ListRow): the glyph, what it adds, and what that does. */
function AddRow({ icon, label, supporting, onSelect }: { icon: GlyphName; label: string; supporting?: string; onSelect: () => void }) {
  return (
    <button type="button" className={styles.addRow} onClick={onSelect}>
      <Icon name={icon} size={24} />
      <span className={styles.addText}>
        <span className="t-body">{label}</span>
        {supporting ? <span className="t-meta">{supporting}</span> : null}
      </span>
    </button>
  );
}

/** `closing`: the route has moved on and the layer is animating out; the editor unmounts (saving) once it has left. */
/** A paste the field's limit cuts, which the browser does without a word: say so. */
function noticeCut(event: ClipboardEvent<HTMLTextAreaElement>, limit: number, what: 'Texte' | 'Titre'): void {
  const field = event.currentTarget;
  const room = limit - field.value.length + (field.selectionEnd - field.selectionStart);
  if (event.clipboardData.getData('text').length > room) showWarning(cutNotice(what, limit));
}

export function NoteEditor({ id, closing = false, onClose }: { id: string; closing?: boolean; onClose: () => void }) {
  const live = useLibraryStore(s => s.notes[id]);
  // Editing an item of the list or adding a photo changes the note too.
  const editedAt = useLibraryStore(s => {
    const current = s.notes[id];
    if (!current) return 0;
    return noteEditedAt(current, (s.checksByNote[id] ?? []).flatMap(cid => s.checks[cid] ?? []), (s.attachmentsByNote[id] ?? []).flatMap(aid => s.attachments[aid] ?? []));
  });
  // Sent away by what it did (archived, binned, deleted for good), the note leaves looking as it was, as on the phone.
  const [parting, setParting] = useState<typeof live>(undefined);
  // Opened again while it was leaving, it shows the note as it is now.
  const [wasClosing, setWasClosing] = useState(closing);
  if (closing !== wasClosing) {
    setWasClosing(closing);
    if (!closing) setParting(undefined);
  }
  const note = parting ?? live;
  const part = (): void => setParting(useLibraryStore.getState().notes[id]);
  const labels = useLibraryStore(s => s.labels);
  const now = useMinute();
  const narrow = useMedia(NARROW);
  const titleId = useId();
  const [focus] = useState(takeEditorFocus);
  const [picker, setPicker] = useState<Picker>(null);
  const [dropping, setDropping] = useState(false);
  const [confirmForever, setConfirmForever] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  /** The text's words as they stand, unsaved ones included (the body saves itself). */
  const [bodyWords, setBodyWords] = useState<string | null>(null);
  const typed = useRef<{ title: string | null }>({ title: null });
  /** What the title held when its draft began: the base for merging an edit from another device. */
  const typedFrom = useRef<{ title: string | null }>({ title: null });
  const timers = useRef<{ title: ReturnType<typeof setTimeout> | null }>({ title: null });
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyApi = useRef<RichBodyHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const reminderAnchor = useRef<HTMLButtonElement>(null);
  const colorAnchor = useRef<HTMLButtonElement>(null);
  const labelsAnchor = useRef<HTMLButtonElement>(null);
  const moreAnchor = useRef<HTMLButtonElement>(null);
  const addAnchor = useRef<HTMLButtonElement>(null);
  const dragDepth = useRef(0);

  const title = titleDraft ?? note?.title ?? '';
  useAutoGrow(titleRef, title);
  useKeptCaret(titleRef, title);

  // A note just started from Rappels asks when first; opened once the editor's own layer is in, so the picker stacks over it.
  useEffect(() => {
    if (focus === null || !overReminders()) return;
    const timer = setTimeout(() => setPicker('reminder'), 0);
    return () => clearTimeout(timer);
  }, [focus]);

  /** Write what is typed now, and show the stored text again (the body writes its own). */
  const flush = (field: 'title' | 'body'): void => {
    if (field === 'body') {
      bodyApi.current?.flush();
      return;
    }
    const timer = timers.current.title;
    if (timer) clearTimeout(timer);
    timers.current.title = null;
    const value = typed.current.title;
    const from = typedFrom.current.title;
    typed.current.title = null;
    typedFrom.current.title = null;
    // An edit from another device that landed while typing is merged in, not overwritten.
    if (value !== null) saveTypedText('note', id, 'title', from, value);
    setTitleDraft(null);
  };

  const editTitle = (value: string): void => {
    if (typed.current.title === null) typedFrom.current.title = useLibraryStore.getState().notes[id]?.title ?? '';
    typed.current.title = value;
    setTitleDraft(value);
    const timer = timers.current.title;
    if (timer) clearTimeout(timer);
    timers.current.title = setTimeout(() => flush('title'), SAVE_DELAY_MS);
  };

  // Leaving the tab: what is typed is saved before the last push (the body saves its own).
  useEffect(
    () =>
      onBeforePause(() => {
        const timer = timers.current.title;
        if (timer) clearTimeout(timer);
        timers.current.title = null;
        const value = typed.current.title;
        const from = typedFrom.current.title;
        typed.current.title = null;
        typedFrom.current.title = null;
        if (value !== null) saveTypedText('note', id, 'title', from, value);
        setTitleDraft(null);
      }),
    [id],
  );

  // Save what is typed on the way out (Back included; the body saves its own), and discard a note left empty.
  useEffect(() => {
    shown.set(id, (shown.get(id) ?? 0) + 1);
    const pending = typed.current;
    const pendingFrom = typedFrom.current;
    const pendingTimers = timers.current;
    return () => {
      if (pendingTimers.title) clearTimeout(pendingTimers.title);
      const value = pending.title;
      const from = pendingFrom.title;
      pending.title = null;
      pendingFrom.title = null;
      if (value !== null) saveTypedText('note', id, 'title', from, value);
      shown.set(id, (shown.get(id) ?? 1) - 1);
      setTimeout(() => {
        if ((shown.get(id) ?? 0) === 0 && isEmptyNote(id)) deleteForever([id]);
      }, 0);
    };
  }, [id]);

  if (!note || note.deletedAt !== null) {
    return (
      <Layer open={!closing} onDismiss={onClose} label={t('Note introuvable')} routed>
        <div className={styles.gone}>
          <Icon name="info" size={28} />
          <p className="t-body">{t('Cette note n’existe plus.')}</p>
          <Button onClick={onClose}>{t('Fermer')}</Button>
        </div>
      </Layer>
    );
  }

  const editable = note.trashedAt === null;
  // A drawing has no lines of text to rule: every paper lies still over its sheet.
  const ruled = note.pattern && isRuledPattern(note.pattern) && note.kind !== 'drawing' ? note.pattern : null;
  const noteLabels = note.labelIds.map(lid => labels[lid]).filter(label => !!label && label.deletedAt === null);

  const close = (): void => {
    flush('title');
    flush('body');
    onClose();
  };

  const archive = (): void => {
    close();
    // An empty note is discarded on the way out: no « Annuler » that could not work.
    if (isEmptyNote(id)) return;
    part();
    const undo = setArchived(id, !note.archived);
    showUndo(note.archived ? t('Note désarchivée') : t('Note archivée'), undo);
  };

  const trash = (): void => {
    flush('title');
    flush('body');
    if (isEmptyNote(id)) {
      onClose();
      return;
    }
    part();
    const undo = trashNotes([id]);
    onClose();
    showUndo(t('Note placée dans la corbeille'), undo);
  };

  const addPhotos = async (files: readonly File[]): Promise<void> => {
    const images = files.filter(file => file.type.startsWith('image/'));
    if (images.length === 0) return;
    const outcome = await attachFiles(id, images);
    if (outcome.refused > 0) {
      if (outcome.added > 0) showWarning(t('Certains fichiers ne sont pas des images acceptées.'));
      else showError(t('Ce fichier n’est pas une image acceptée (25 Mo au plus).'));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      close();
      return;
    }
    // Typing in the text never acts on the note (its editable is found by its attribute where nothing is laid out).
    if (!editable || isEditable(event.target) || (event.target as Element).closest?.('[contenteditable="true"]') || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'e' || event.key === 'E') {
      event.preventDefault();
      archive();
    } else if (event.key === '#') {
      event.preventDefault();
      trash();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    if (!editable) return;
    const files = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
    if (files.length === 0) return;
    event.preventDefault();
    void addPhotos(files);
  };

  const hasFiles = (event: DragEvent): boolean => [...event.dataTransfer.types].includes('Files');

  const duplicate: MenuItem = {
    label: t('Dupliquer'),
    icon: 'copy',
    // An empty note's copy would be discarded the moment it was left: nothing to duplicate yet.
    disabled: !canDuplicate(id, { title, body: bodyWords ?? undefined }),
    onSelect: () => {
      flush('title');
      flush('body');
      if (!canDuplicate(id)) return;
      const copy = duplicateNote(id);
      if (copy) showSnack(t('Note dupliquée'), { label: t('Ouvrir'), run: () => openNote(copy) }, { tone: 'success' });
    },
  };
  // A text note's lines become items, or a checklist's items lines again.
  const checkboxes: MenuItem & { readonly supporting: string } =
    note.kind === 'text'
      ? {
          label: t('Cases à cocher'),
          supporting: t('Chaque ligne devient un élément'),
          icon: 'checklist',
          onSelect: () => {
            flush('body');
            convertToChecklist(id);
          },
        }
      : { label: t('Masquer les cases à cocher'), supporting: t('La liste redevient du texte'), icon: 'note', onSelect: () => convertToText(id) };
  // The web's "Partager": the note's text on the clipboard.
  const copyText: MenuItem = {
    label: t('Copier le texte'),
    icon: 'share',
    onSelect: () => {
      flush('title');
      flush('body');
      if (!navigator.clipboard) {
        showError(t('Impossible de copier le texte'));
        return;
      }
      void navigator.clipboard.writeText(noteText(id)).then(
        () => showSnack(t('Texte copié'), undefined, { tone: 'success' }),
        () => showError(t('Impossible de copier le texte')),
      );
    },
  };
  const remove: MenuItem = { label: t('Supprimer'), icon: 'trash', danger: true, shortcut: '#', separatorBefore: true, onSelect: trash };
  // On a phone the checkboxes are added with the rest, under "Ajouter", and the menu keeps the phone's order.
  const menuItems: MenuItem[] = note.kind === 'drawing' ? [duplicate, remove] : narrow ? [copyText, duplicate, remove] : [duplicate, checkboxes, copyText, remove];

  const pin = (
    <IconButton
      icon="pin"
      label={note.pinned ? t('Retirer des épinglées') : t('Épingler')}
      pressed={note.pinned}
      className={narrow ? undefined : styles.pin}
      onClick={() => setPinned(id, !note.pinned)}
    />
  );
  const reminderButton = (
    <IconButton
      ref={reminderAnchor}
      icon={note.reminderAt !== null ? 'bell' : 'bellPlus'}
      label={t('Rappel')}
      // Neighbours take different pebbles: the phone's in its top bar, alternating in the wide toolbar.
      shape={narrow ? 1 : 0}
      pressed={note.reminderAt !== null}
      hasPopup="dialog"
      expanded={picker === 'reminder'}
      onClick={() => setPicker('reminder')}
    />
  );
  const archiveButton = <IconButton icon={note.archived ? 'unarchive' : 'archive'} label={note.archived ? t('Désarchiver') : t('Archiver')} shape={narrow ? 2 : 1} shortcut="E" onClick={archive} />;
  const colorButton = <IconButton ref={colorAnchor} icon="palette" label={t('Couleur et papier')} shape={1} hasPopup="dialog" expanded={picker === 'color'} onClick={() => setPicker('color')} />;
  const labelsButton = <IconButton ref={labelsAnchor} icon="tag" label={t('Labels')} shape={2} hasPopup="dialog" expanded={picker === 'labels'} onClick={() => setPicker('labels')} />;
  const moreButton = <IconButton ref={moreAnchor} icon="more" label={t('Plus d’actions')} shape={narrow ? 1 : 2} hasPopup="menu" expanded={picker === 'more'} onClick={() => setPicker('more')} />;
  const forever = <IconButton icon="trash" label={t('Supprimer définitivement')} onClick={() => setConfirmForever(true)} />;
  const edited = <p className={`${styles.edited} t-meta`}>{formatEdited(Math.max(editedAt, note.editedAt), now)}</p>;

  return (
    <Layer
      open={!closing}
      onDismiss={close}
      full
      routed
      labelledBy={titleId}
      panelClassName={styles.panel}
      // A new note starts in its text; an opened one focuses the dialog itself, so E and # work at once.
      initialFocus={focus === 'body' && note.kind === 'text' ? bodyRef : focus === 'check' ? undefined : surfaceRef}
    >
      <div
        ref={surfaceRef}
        tabIndex={-1}
        className={`${styles.surface} ${narrow ? styles.phone : ''} paper`}
        data-line={isLineColor(note.color) ? note.color : undefined}
        data-gradient={isNoteGradient(note.color) ? note.color : undefined}
        data-dropping={dropping || undefined}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDragEnter={event => {
          if (!editable || !hasFiles(event)) return;
          dragDepth.current += 1;
          setDropping(true);
        }}
        onDragOver={event => {
          if (editable && hasFiles(event)) event.preventDefault();
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDropping(false);
        }}
        onDrop={event => {
          if (!editable || !hasFiles(event)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDropping(false);
          void addPhotos([...event.dataTransfer.files]);
        }}
      >
        {narrow ? (
          <div className={styles.topBar}>
            <IconButton icon="back" label={t('Retour')} onClick={close} />
            <span className={styles.barSpace} />
            {editable ? (
              <>
                {pin}
                {reminderButton}
                {archiveButton}
              </>
            ) : null}
          </div>
        ) : null}
        {!editable ? (
            <div className={styles.banner}>
              <p className={`${styles.bannerText} t-meta`}>{t('Une note dans la corbeille ne peut pas être modifiée.')}</p>
              <Button kind="tonal" small icon="restore" onClick={() => restoreNotes([id])}>
                {t('Restaurer')}
              </Button>
            </div>
          ) : null}
          {/* Covering papers lie still over the whole sheet; ruled ones scroll with the text they rule. */}
          {note.pattern && !ruled ? <span className={styles.paperLayer} data-pattern={note.pattern} aria-hidden="true" /> : null}
          <div className={styles.scroll}>
            <div className={styles.sheet} data-kind={note.kind}>
            <PhotoGrid noteId={id} editable={editable} />
            <div className={styles.head}>
              <textarea
                ref={titleRef}
                id={titleId}
                className={`${styles.titleInput} t-editor-title`}
                value={title}
                rows={1}
                readOnly={!editable}
                placeholder={t('Titre')}
                maxLength={TEXT_LIMITS.note.title}
                aria-label={t('Titre')}
                onPaste={event => noticeCut(event, TEXT_LIMITS.note.title, 'Titre')}
                onChange={event => editTitle(event.target.value.replace(/\r?\n/g, ' '))}
                onBlur={() => flush('title')}
                onKeyDown={event => {
                  // Ctrl+Entrée closes the note (the sheet's own keys): it must not start an item first.
                  if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.ctrlKey || event.metaKey) return;
                  event.preventDefault();
                  if (note.kind === 'text') bodyApi.current?.focus('start');
                  else if (note.kind === 'drawing') event.currentTarget.blur();
                  else {
                    const first = document.querySelector<HTMLTextAreaElement>(`[data-note-editor='${id}'] textarea[aria-label='${t('Texte de l’élément')}']`);
                    if (first) first.focus();
                    else addCheck(id, '');
                  }
                }}
              />
              {editable && !narrow ? pin : null}
            </div>
            <div data-note-editor={id} className={styles.writing}>
              {note.kind === 'drawing' ? (
                <DrawingSheet noteId={id} editable={editable} />
              ) : note.kind === 'text' ? (
                <div className={styles.bodyWrap} data-ruled={ruled ? '' : undefined}>
                  {ruled ? <span className={styles.ruledPaper} data-pattern={ruled} aria-hidden="true" /> : null}
                  <RichBody
                    handle={bodyApi}
                    inputRef={bodyRef}
                    noteId={id}
                    editable={editable}
                    className={`${styles.bodyInput} t-editor-body`}
                    placeholder={t('Note')}
                    label={t('Texte de la note')}
                    takesPictures
                    onText={setBodyWords}
                    still={parting !== undefined}
                  />
                </div>
              ) : (
                <div className={styles.checkWrap} data-ruled={ruled ? '' : undefined}>
                  {ruled ? <span className={styles.ruledPaper} data-pattern={ruled} aria-hidden="true" /> : null}
                  <ChecklistEditor noteId={id} editable={editable} autoFocusFirst={focus === 'check'} />
                </div>
              )}
            </div>
            </div>
          </div>
          {/* What the note wears, at its foot above the bar that changes it, as on its card: never lost mid-sheet or after the ticked items. */}
          {note.reminderAt !== null || noteLabels.length > 0 ? (
            <div className={styles.chips}>
              {note.reminderAt !== null ? (
                <button
                  type="button"
                  className={styles.chip}
                  data-past={note.reminderAt < now || undefined}
                  onClick={() => setPicker('reminder')}
                  aria-label={t('Rappel : {when}. Modifier', { when: formatReminder(note.reminderAt, now) })}
                  disabled={!editable}
                >
                  <Icon name="bell" size={16} />
                  {formatReminder(note.reminderAt, now)}
                </button>
              ) : null}
              {noteLabels.map(label => (
                <button key={label!.id} type="button" className={styles.chip} onClick={() => setPicker('labels')} aria-label={t('Label {name}. Modifier', { name: label!.name })} disabled={!editable}>
                  <LabelMark name={label!.name} color={label!.color} />
                </button>
              ))}
            </div>
          ) : null}
          {narrow ? (
            // The phone's bottom bar; in the bin it keeps the date and "Supprimer définitivement", as on the phone.
            <div className={styles.bottomBar} role="toolbar" aria-label={t('Actions de la note')}>
              {editable ? (
                <>
                  <IconButton ref={addAnchor} icon="plus" label={t('Ajouter')} hasPopup="dialog" expanded={picker === 'add'} onClick={() => setPicker('add')} />
                  {colorButton}
                  {labelsButton}
                </>
              ) : (
                forever
              )}
              {edited}
              {editable ? moreButton : <span className={styles.barEnd} aria-hidden="true" />}
            </div>
          ) : (
            <div className={styles.toolbar} role="toolbar" aria-label={t('Actions de la note')}>
              {editable ? (
                <>
                  {reminderButton}
                  {colorButton}
                  {labelsButton}
                  <IconButton icon="image" label={t('Ajouter une image')} onClick={() => fileInput.current?.click()} />
                  {archiveButton}
                  {moreButton}
                </>
              ) : (
                forever
              )}
              {edited}
              <Button kind="text" onClick={close}>
                {t('Fermer')}
              </Button>
            </div>
          )}
          {editable ? (
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={event => {
                const files = [...(event.target.files ?? [])];
                event.target.value = '';
                void addPhotos(files);
              }}
            />
          ) : null}
      </div>

      <ReminderPicker
        open={picker === 'reminder'}
        anchor={reminderAnchor}
        current={note.reminderAt}
        now={now}
        onDismiss={() => setPicker(null)}
        onSet={time => {
          const undo = setReminder(id, time);
          if (time) showSnack(t('Rappel : {when}', { when: formatReminder(time, Date.now()) }), undefined, { tone: 'success' });
          else showUndo(t('Rappel supprimé'), undo);
        }}
      />
      <Popover open={picker === 'color'} anchor={colorAnchor} onDismiss={() => setPicker(null)} label={t('Couleur et papier')} width={344}>
        <div className={styles.picker}>
          <h2 className={`${styles.pickerTitle} ${narrow ? 't-title' : 't-label'}`}>{t('Couleur et papier')}</h2>
          <div className={styles.pickerBody}>
            <NoteFinishPicker color={note.color} pattern={note.pattern} onColor={color => setColor(id, color)} onPattern={pattern => setPattern(id, pattern)} />
          </div>
        </div>
      </Popover>
      <LabelPicker open={picker === 'labels'} anchor={labelsAnchor} selected={note.labelIds} onDismiss={() => setPicker(null)} onChange={ids => setLabels(id, ids)} />
      <Menu open={picker === 'more'} anchor={moreAnchor} onDismiss={() => setPicker(null)} items={menuItems} label={t('Plus d’actions')} />
      <Popover open={narrow && picker === 'add'} anchor={addAnchor} onDismiss={() => setPicker(null)} label={t('Ajouter')} width={320}>
        <div className={styles.addSheet}>
          <AddRow
            icon="image"
            label={t('Ajouter une image')}
            onSelect={() => {
              setPicker(null);
              fileInput.current?.click();
            }}
          />
          {note.kind === 'drawing' ? null : (
            <AddRow
              icon={checkboxes.icon}
              label={checkboxes.label}
              supporting={checkboxes.supporting}
              onSelect={() => {
                setPicker(null);
                checkboxes.onSelect();
              }}
            />
          )}
        </div>
      </Popover>
      <Confirm
        open={confirmForever}
        title={t('Supprimer définitivement ?')}
        message={t('Cette note disparaîtra de tous vos appareils. Cette action est irréversible.')}
        confirmLabel={t('Supprimer')}
        danger
        onCancel={() => setConfirmForever(false)}
        onConfirm={() => {
          setConfirmForever(false);
          part();
          deleteForever([id]);
          onClose();
          showSnack(t('Note supprimée définitivement'), undefined, { tone: 'success' });
        }}
      />
    </Layer>
  );
}
