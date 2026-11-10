/**
 * "Classer un lien": by default Claude reads the link on the server and files it in the right
 * collection (the snip shows it happen); an emblem tab picks one by hand. Trackers come off the
 * address before it is kept, and the dialog says which. Without a server or a key, links are kept
 * plain, and the dialog says so with the way to the settings. A share lands here prefilled, and
 * keeps its first `MAX_SHARED_URLS` links; a share without a link asks before becoming a note.
 */
import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { isBlank } from '@unlease/core/services/formChecks';
import { fieldInput } from '@unlease/design/fields';

import { APP_NAME } from '@unlease/notes/brand';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { addedMessage, addedTone, capSharedUrls, MAX_SHARED_URLS } from '@unlease/notes/services/savedLinks';
import { cleanUrl, extractUrls } from '@unlease/core/services/url';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';

import { captureTitle, fileUrls, noteFromShare } from '../../../app/capture';
import { useLines } from '../../../app/hooks/useLines';
import { addLinks } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { useCanRead } from '../../../app/store/prefs';
import { showError, showSnack } from '@shared/app/store/ui';
import {
  closeCapture,
  closeSharedNote,
  selectCaptureOpen,
  selectCaptureText,
  selectCaptureTitle,
  selectSharedNote,
  useNotesUiStore,
} from '../../../app/store/notesUi';
import { Button } from '@shared/ui/components/Button';
import { Confirm, DialogFrame } from '@shared/ui/components/Dialog';
import { Emblem } from '@shared/ui/components/Emblem';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import { Layer } from '@shared/ui/components/Layer';
import { useForm } from '@shared/ui/components/useForm';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { BoundInput, FieldProblem } from '../BoundInput';
import { useReportDirty } from '../reportDirty';
import { adminPath, navigate } from '@shared/ui/router';
import { paths } from '../../routes';
import styles from './capture.module.css';

const AUTO = 'auto';

/** "utm_source, fbclid et 2 autres". */
function removedList(names: readonly string[]): string {
  if (names.length <= 3) return names.join(', ');
  return t('{names} et {count} autres', { names: names.slice(0, 2).join(', '), count: names.length - 2 });
}

const URL_INPUT = fieldInput('url').web;

function CaptureForm({ initial, initialTitle, onClose, onDirty }: { initial: string; initialTitle: string; onClose: () => void; onDirty: (dirty: boolean) => void }) {
  const lines = useLines();
  const titleId = useId();
  const reading = useCanRead();
  const server = useSettingsStore(selectServer);
  const [text, setText] = useState(initial);
  const [target, setTarget] = useState<string>(() => (reading ? AUTO : INBOX_ID));
  const tabs = useRef<HTMLDivElement>(null);
  const urls = extractUrls(text);
  // A share (or a paste) offering more links than one share takes: the first ones, and the dialog says so.
  const { urls: kept, more } = capSharedUrls(urls);
  const removed = [...new Set(kept.flatMap(url => cleanUrl(url).removed))];
  // Reading on: "Non classé" is what Automatique falls back to, so it is not offered. Off: it is the default, so it leads.
  const others = lines.filter(line => line.id !== INBOX_ID);
  const targets = reading ? others : [...lines.filter(line => line.id === INBOX_ID), ...others];
  const choices = [...(reading ? [AUTO] : []), ...targets.map(line => line.id)];
  // A choice can vanish while the dialog is open (reading turned off, a collection deleted).
  const chosen = choices.includes(target) ? target : choices[0]!;
  const form = useForm({ link: !isBlank(text) && urls.length === 0 ? t('Aucun lien ici : collez une adresse, comme https://example.org/page.') : null });
  useReportDirty(!isBlank(text) && text.trim() !== initial.trim(), onDirty);

  const submit = (): void => {
    // The page title a share sent stands for the link's only while the text is as it came.
    const title = captureTitle(text, urls, text.trim() === initial.trim() ? initialTitle : '');
    if (chosen === AUTO) {
      fileUrls(kept, title);
    } else {
      const placed = addLinks(kept, { noteId: chosen, title });
      const message = addedMessage(placed, { into: chosen, announce: true }, useLibraryStore.getState().notes);
      if (message) showSnack(message, undefined, { tone: addedTone(placed) });
    }
    closeCapture();
  };

  const paste = async (): Promise<void> => {
    try {
      setText((await navigator.clipboard.readText()).trim());
      form.field('link').edited();
    } catch {
      showError(t('Le navigateur refuse la lecture du presse-papiers : collez avec Ctrl+V.'));
    }
  };

  const openAdmin = (): void => {
    closeCapture();
    navigate(adminPath(server ? 'reading' : 'server'));
  };

  const onTabsKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = choices[(choices.indexOf(chosen) + step + choices.length) % choices.length];
    if (!next) return;
    setTarget(next);
    tabs.current?.querySelector<HTMLButtonElement>(`[data-target='${next}']`)?.focus();
  };

  const help = !server
    ? t('Sans serveur, le lien est gardé tel quel. Claude lit les liens depuis votre serveur {app} : connectez-le dans l’administration.', { app: APP_NAME })
    : !reading
      ? t('Le lien est gardé tel quel : ajoutez une clé API Claude dans l’administration pour qu’il soit lu et rangé.')
      : chosen === AUTO
        ? t('Claude lit la page et range le lien dans la bonne collection, ou dans Non classé.')
        : t('Claude lit la page ; le lien reste dans cette collection.');

  return (
    <DialogFrame
      title={t('Classer un lien')}
      titleId={titleId}
      onClose={onClose}
      onSubmit={form.onSubmit(submit)}
      foot={
        <>
          {!reading ? (
            <Button kind="text" icon="server" onClick={openAdmin}>
              {t('Administration')}
            </Button>
          ) : null}
          <Button type="submit" icon="check" disabled={isBlank(text)}>
            {reading ? t('Classer') : t('Ajouter')}
          </Button>
        </>
      }
    >
      <div className={styles.address}>
        <div className={styles.field} data-invalid={form.error('link') ? '' : undefined}>
          <Icon name="link" size={20} />
          <BoundInput
            field={form.field('link')}
            problemId={`${titleId}-problem`}
            className={styles.input}
            value={text}
            onChange={setText}
            placeholder="https://…"
            aria-label={t('Adresse du lien')}
            inputMode={URL_INPUT.inputMode}
            autoComplete={URL_INPUT.autoComplete}
            autoCapitalize={URL_INPUT.autoCapitalize}
            autoCorrect={URL_INPUT.autoCorrect}
            spellCheck={URL_INPUT.spellCheck}
            data-autofocus
          />
          {typeof navigator.clipboard?.readText === 'function' ? <IconButton icon="copy" label={t('Coller le lien copié')} onClick={() => void paste()} /> : null}
        </div>
        <FieldProblem field={form.field('link')} id={`${titleId}-problem`} className={styles.problem} />
        <p className={`${styles.cleaned} t-meta`} aria-live="polite">
          {removed.length > 0 ? (
            <>
              <Icon name="broom" size={18} />
              {removed.length > 1 ? t('Nettoyé : {names} seront retirés de l’adresse.', { names: removedList(removed) }) : t('Nettoyé : {names} sera retiré de l’adresse.', { names: removedList(removed) })}
            </>
          ) : null}
        </p>
        {more > 0 ? (
          <p className={`${styles.cleaned} t-meta`} role="status">
            <Icon name="alert" size={18} />
            {t('Seuls les {kept} premiers des {offered} liens seront gardés.', { kept: MAX_SHARED_URLS, offered: urls.length })}
          </p>
        ) : null}
      </div>
      <div className={styles.group}>
        {/* Read out, not shown: the chips are the collections (their cut-outs, « Automatique »), and the line under them says where the link goes. */}
        <p className="sr-only" id={`${titleId}-collection`}>
          {t('Collection')}
        </p>
        <div ref={tabs} className={styles.targets} role="radiogroup" aria-labelledby={`${titleId}-collection`} onKeyDown={onTabsKey}>
          {reading ? (
            <button
              type="button"
              role="radio"
              aria-checked={chosen === AUTO}
              tabIndex={chosen === AUTO ? 0 : -1}
              data-target={AUTO}
              className={styles.target}
              onClick={() => setTarget(AUTO)}
            >
              <Icon name="sparkle" size={22} />
              {t('Automatique')}
            </button>
          ) : null}
          {targets.map(line => (
            <button
              key={line.id}
              type="button"
              role="radio"
              aria-checked={chosen === line.id}
              tabIndex={chosen === line.id ? 0 : -1}
              data-target={line.id}
              className={styles.target}
              onClick={() => setTarget(line.id)}
            >
              <Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={24} />
              <span className={styles.targetName}>{shownTitle(line)}</span>
            </button>
          ))}
        </div>
      </div>
      <p className={`${styles.help} t-meta`}>{help}</p>
    </DialogFrame>
  );
}

/** A share without a link: what it holds, kept as a note only on the person's say. */
function SharedNoteQuestion() {
  const shared = useNotesUiStore(selectSharedNote);
  const preview = shared ? [shared.title.trim(), shared.body.trim()].filter(Boolean).join(' — ') : '';
  const create = (): void => {
    if (!shared) return;
    closeSharedNote();
    navigate(paths.note(noteFromShare(shared)), { background: paths.board });
  };
  return (
    <Confirm
      open={shared !== null}
      title={t('Garder ce partage en note ?')}
      message={preview.length > 280 ? `${preview.slice(0, 279)}…` : preview}
      confirmLabel={t('Créer la note')}
      onConfirm={create}
      onCancel={closeSharedNote}
    />
  );
}

export function CaptureDialog() {
  const open = useNotesUiStore(selectCaptureOpen);
  const initial = useNotesUiStore(selectCaptureText);
  const initialTitle = useNotesUiStore(selectCaptureTitle);
  // A link typed and not filed is asked about before the dialog closes on it.
  const [dirty, setDirty] = useState(false);
  const unsaved = useUnsaved(dirty);
  const close = unsaved.guard(closeCapture);
  return (
    <>
      <Layer open={open} onDismiss={close} label={t('Classer un lien')}>
        <CaptureForm initial={initial} initialTitle={initialTitle} onClose={close} onDirty={setDirty} />
      </Layer>
      {unsaved.dialog}
      <SharedNoteQuestion />
    </>
  );
}
