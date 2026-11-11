/**
 * Making and changing a collection: its name, the sentence Claude reads when it files a link
 * (which is what makes the filing reliable), its emblem and its gouache. "Non classé" keeps its
 * name and its tray; only its colour and sentence change. The code (a letter kept for search
 * and older clients) is written once at creation and never edited. A new collection can take
 * what belongs in it from "Non classé" (ticked by default, undone from the slip); an edit says
 * whether the name or sentence changed more than a typo, for its links to be checked again.
 */
import { useId, useState, type ReactNode } from 'react';

import { isBlank } from '@unlease/core/services/formChecks';

import { type CollectionEmblem, type Emblem as EmblemKey } from '@unlease/design/emblems';
import { t, tx } from '@unlease/core/i18n';
import { asLineColor, nextLineColor, type LineColor } from '@unlease/design/colors';
import { suggestionsFor, collectionEmblem, emblemOf, nextEmblem } from '@unlease/notes/models/collections';
import { INBOX_ID, lineTitleTaken, shownHint, shownTitle } from '@unlease/notes/models/entities';
import { meaningChanged, sortable } from '@unlease/notes/services/sorting';

import { useLines } from '../../../app/hooks/useLines';
import { createLine, updateNote } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { selectSorting, useNotesUiStore } from '../../../app/store/notesUi';
import { useServerFeature } from '@shared/app/store/serverSettings';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Emblem } from '@shared/ui/components/Emblem';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import { TextField } from '@shared/ui/components/TextField';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { useReportDirty } from '../reportDirty';
import { EmblemPicker } from './EmblemPicker';
import { LineColorPicker } from './LineColorPicker';
import styles from './lines.module.css';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { fillLineOnSlip } from './sortingSlips';

const HINT_LABEL = tx('Ce qui va dans cette collection');
const HINT_HELP = tx('Claude lit cette phrase pour choisir la bonne collection.');
const HINT_PREVIEW = tx('Une phrase sur ce qu’elle contient aide Claude à y ranger les bons liens.');

/** The collection as it will hang: a new emblem settles onto it as it is picked, a new colour comes over it. */
function Preview({ emblem, color, title, hint }: { emblem: CollectionEmblem; color: LineColor | null; title: string; hint: string }) {
  return (
    <OutlinedBox kind="card" className={`${styles.preview} paper`} aria-hidden="true">
      <span key={emblem} className={styles.previewMark}>
        <Emblem emblem={emblem} color={color} size={56} />
      </span>
      <span className={styles.previewText}>
        <span className={`${styles.previewTitle} t-body-strong`}>{title}</span>
        <span className={`${styles.previewHint} t-meta`}>{hint}</span>
      </span>
    </OutlinedBox>
  );
}

/** A group of choices: a fieldset whose legend is read out, not shown (the preview over them and the cut-outs and swatches themselves say what they choose). */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className={styles.group}>
      <legend className="sr-only">{label}</legend>
      {children}
    </fieldset>
  );
}

/** A collection's name: given, and not another collection's (`except`, the one being edited). */
const nameProblem = (title: string, lines: readonly { id: string; title: string }[], except: string | null = null): string | null =>
  isBlank(title) ? t('Donnez un nom à la collection.') : lineTitleTaken(lines, title, except) ? t('Une collection porte déjà ce nom : choisissez-en un autre.') : null;

interface FormProps {
  readonly titleId: string;
  /** Closes it, asking first when something was changed. */
  readonly onCancel: () => void;
  /** Closes it once saved. */
  readonly onDone: () => void;
  readonly onDirty: (dirty: boolean) => void;
}

function NewLineForm({ titleId, onCancel, onDone, onDirty, onCreated }: FormProps & { onCreated: (id: string) => void }) {
  const lines = useLines();
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  const [color, setColor] = useState<LineColor>(() => nextLineColor(lines.map(line => asLineColor(line.color))));
  const [emblem, setEmblem] = useState<EmblemKey>(() => nextEmblem(lines));
  const [opened] = useState(() => ({ color, emblem }));
  const [fill, setFill] = useState(true);
  const form = useForm({ title: nameProblem(title, lines) });
  useReportDirty(!isBlank(title) || !isBlank(hint) || color !== opened.color || emblem !== opened.emblem, onDirty);
  // Claude's sorting, once the server has said it has a key.
  const reading = useServerFeature('claude');
  const inboxLinks = useLibraryStore(s => (s.linksByNote[INBOX_ID] ?? []).filter(id => s.links[id] && sortable(s.links[id]!)).length);
  const sorting = useNotesUiStore(selectSorting);
  const offerFill = reading && inboxLinks > 0 && !sorting;
  const suggestions = suggestionsFor(lines);

  const create = (init: { id?: string; title: string; code?: string; hint: string; color: LineColor; emblem: EmblemKey }): void => {
    const id = createLine(init);
    onDone();
    onCreated(id);
    if (offerFill && fill) fillLineOnSlip(id);
  };

  return (
    <DialogFrame
      title={t('Nouvelle collection')}
      titleId={titleId}
      onClose={onCancel}
      onSubmit={form.onSubmit(() => create({ title, hint: hint.trim(), color, emblem }))}
      foot={
        <>
          <Button kind="text" onClick={onCancel}>
            {t('Annuler')}
          </Button>
          <Button type="submit" icon="plus">
            {t('Créer la collection')}
          </Button>
        </>
      }
    >
      {suggestions.length > 0 ? (
        <div className={styles.suggestions} role="group" aria-label={t('Collections suggérées')}>
          {suggestions.map(suggestion => (
            <button
              key={suggestion.id}
              type="button"
              className={`${styles.suggestion} paper`}
              aria-label={t('Créer la collection {title}', { title: suggestion.title })}
              onClick={() => create(suggestion)}
            >
              <Emblem emblem={suggestion.emblem} color={suggestion.color} size={22} />
              {suggestion.title}
            </button>
          ))}
        </div>
      ) : null}
      <Preview emblem={emblem} color={color} title={title.trim() || t('Nom de la collection')} hint={hint.trim() || t(HINT_PREVIEW)} />
      <TextField label={t('Nom')} kind="text" field={form.field('title')} value={title} onChange={setTitle} help={t('Ex. Cadeaux, Films à voir, Restaurants')} maxLength={60} autoFocus />
      <TextField label={t(HINT_LABEL)} kind="prose" value={hint} onChange={setHint} multiline maxLength={500} help={t('Claude lit cette phrase pour choisir la bonne collection. Ex. idées de cadeaux pour les proches.')} inputClassName={styles.hintInput} />
      <Group label={t('Emblème')}>
        <EmblemPicker value={emblem} color={color} onChange={setEmblem} />
      </Group>
      <Group label={t('Couleur')}>
        <LineColorPicker value={color} onChange={next => next && setColor(next)} label={t('Couleur de la collection')} />
      </Group>
      {offerFill ? (
        <button type="button" role="checkbox" aria-checked={fill} className={styles.fillOption} onClick={() => setFill(!fill)}>
          <span className={styles.box}>
            <Icon name={fill ? 'boxChecked' : 'box'} size={20} />
          </span>
          <span className={styles.moveText}>
            <span className="t-body">{t('Y ranger les liens de Non classé qui lui correspondent')}</span>
            <span className="t-meta">{inboxLinks === 1 ? t('Claude choisit parmi le lien de Non classé.') : t('Claude choisit parmi les {count} liens de Non classé.', { count: inboxLinks })}</span>
          </span>
        </button>
      ) : null}
    </DialogFrame>
  );
}

export function NewLineDialog({ open, onDismiss, onCreated }: { open: boolean; onDismiss: () => void; onCreated: (id: string) => void }) {
  const titleId = useId();
  const [dirty, setDirty] = useState(false);
  const unsaved = useUnsaved(dirty);
  const cancel = unsaved.guard(onDismiss);
  return (
    <>
      <Layer open={open} onDismiss={cancel} labelledBy={titleId}>
        <NewLineForm titleId={titleId} onCancel={cancel} onDone={onDismiss} onDirty={setDirty} onCreated={onCreated} />
      </Layer>
      {unsaved.dialog}
    </>
  );
}

function EditLineForm({ id, titleId, onCancel, onDone, onDirty, onSaved }: FormProps & { id: string; onSaved?: (meaningChanged: boolean) => void }) {
  const line = useLibraryStore(s => s.notes[id]);
  const [title, setTitle] = useState(line?.title ?? '');
  const [hint, setHint] = useState(line ? shownHint(line) : '');
  const [color, setColor] = useState<LineColor | null>(asLineColor(line?.color ?? null));
  const [emblem, setEmblem] = useState<EmblemKey>(() => emblemOf(id, line?.emblem ?? null));
  // The form as it opened: only what the person changed is written, so an edit made elsewhere meanwhile stands.
  const [opened] = useState<Record<string, unknown>>(() => ({ title: line?.title ?? '', hint: line ? shownHint(line) : '', color: asLineColor(line?.color ?? null), emblem: emblemOf(id, line?.emblem ?? null) }));
  const inbox = id === INBOX_ID;
  const lines = useLines();
  // A name it already had is never refused (two collections that came to share one keep it until renamed).
  const form = useForm({ title: inbox ? null : title.trim() === String(opened.title).trim() ? nameProblem(title, [], id) : nameProblem(title, lines, id) });
  useReportDirty(title !== opened.title || hint !== opened.hint || color !== opened.color || emblem !== opened.emblem, onDirty);
  if (!line) return null;
  return (
    <DialogFrame
      title={t('Modifier la collection')}
      titleId={titleId}
      onClose={onCancel}
      foot={
        <>
          <Button kind="text" onClick={onCancel}>
            {t('Annuler')}
          </Button>
          <Button type="submit">{t('Enregistrer')}</Button>
        </>
      }
      onSubmit={form.onSubmit(() => {
        const values: Record<string, unknown> = inbox ? { hint: hint.trim(), color } : { title: title.trim(), emblem, hint: hint.trim(), color };
        const changed = Object.fromEntries(Object.entries(values).filter(([field, value]) => value !== opened[field]));
        if (Object.keys(changed).length > 0) updateNote(id, changed);
        onDone();
        if (Object.keys(changed).length > 0) {
          const before = { title: String(opened.title), hint: String(opened.hint) };
          onSaved?.(!inbox && meaningChanged(before, { title: title.trim(), hint: hint.trim() }));
        }
      })}
    >
      <Preview emblem={inbox ? collectionEmblem(id, null) : emblem} color={color} title={(inbox ? shownTitle(line) : title.trim()) || t('Sans nom')} hint={hint.trim() || t(HINT_PREVIEW)} />
      {!inbox ? <TextField label={t('Nom')} kind="text" field={form.field('title')} value={title} onChange={setTitle} maxLength={60} autoFocus /> : null}
      <TextField label={t(HINT_LABEL)} kind="prose" value={hint} onChange={setHint} multiline maxLength={500} help={t(HINT_HELP)} inputClassName={styles.hintInput} />
      {!inbox ? (
        <Group label={t('Emblème')}>
          <EmblemPicker value={emblem} color={color} onChange={setEmblem} />
        </Group>
      ) : null}
      <Group label={t('Couleur')}>
        <LineColorPicker value={color} onChange={next => next && setColor(next)} label={t('Couleur de la collection')} />
      </Group>
    </DialogFrame>
  );
}

export function EditLineDialog({ id, open, onDismiss, onSaved }: { id: string; open: boolean; onDismiss: () => void; onSaved?: (meaningChanged: boolean) => void }) {
  const titleId = useId();
  const [dirty, setDirty] = useState(false);
  const unsaved = useUnsaved(dirty);
  const cancel = unsaved.guard(onDismiss);
  return (
    <>
      <Layer open={open} onDismiss={cancel} labelledBy={titleId}>
        <EditLineForm id={id} titleId={titleId} onCancel={cancel} onDone={onDismiss} onDirty={setDirty} onSaved={onSaved} />
      </Layer>
      {unsaved.dialog}
    </>
  );
}
