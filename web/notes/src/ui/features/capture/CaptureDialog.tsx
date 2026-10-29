/**
 * "Classer un lien": by default Claude reads the link on the server and files it in the right
 * collection (the snip shows it happen); an emblem tab picks one by hand. Trackers come off the
 * address before it is kept, and the dialog says which. Without a server or a key, links are kept
 * plain, and the dialog says so with the way to the settings.
 */
import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { addedMessage } from '@unlease/notes/services/savedLinks';
import { cleanUrl, extractUrls } from '@unlease/core/services/url';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';

import { classifyText } from '../../../app/capture';
import { useLines } from '../../../app/hooks/useLines';
import { addLinks } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { selectCanRead, selectServer, useSettingsStore } from '../../../app/store/settings';
import { addedTone, closeCapture, selectCaptureOpen, selectCaptureText, showError, showSnack, useUiStore } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { Emblem } from '../../components/Emblem';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Layer } from '../../components/Layer';
import { navigate, paths } from '../../router';
import styles from './capture.module.css';

const AUTO = 'auto';

/** "utm_source, fbclid et 2 autres". */
function removedList(names: readonly string[]): string {
  if (names.length <= 3) return names.join(', ');
  return t('{names} et {count} autres', { names: names.slice(0, 2).join(', '), count: names.length - 2 });
}

function CaptureForm({ initial }: { initial: string }) {
  const lines = useLines();
  const titleId = useId();
  const reading = useSettingsStore(selectCanRead);
  const server = useSettingsStore(selectServer);
  const [text, setText] = useState(initial);
  const [target, setTarget] = useState<string>(() => (reading ? AUTO : INBOX_ID));
  const tabs = useRef<HTMLDivElement>(null);
  const urls = extractUrls(text);
  const removed = [...new Set(urls.flatMap(url => cleanUrl(url).removed))];
  // Reading on: "Non classé" is what Automatique falls back to, so it is not offered. Off: it is the default, so it leads.
  const others = lines.filter(line => line.id !== INBOX_ID);
  const targets = reading ? others : [...lines.filter(line => line.id === INBOX_ID), ...others];
  const choices = [...(reading ? [AUTO] : []), ...targets.map(line => line.id)];
  // A choice can vanish while the dialog is open (reading turned off, a collection deleted).
  const chosen = choices.includes(target) ? target : choices[0]!;

  const submit = (): void => {
    if (urls.length === 0) {
      showError(t('Collez une adresse qui commence par http'));
      return;
    }
    if (chosen === AUTO) {
      classifyText(text);
    } else {
      const placed = addLinks(urls, { noteId: chosen });
      const message = addedMessage(placed, { into: chosen, announce: true }, useLibraryStore.getState().notes);
      if (message) showSnack(message, undefined, { tone: addedTone(placed) });
    }
    closeCapture();
  };

  const paste = async (): Promise<void> => {
    try {
      setText((await navigator.clipboard.readText()).trim());
    } catch {
      showError(t('Le navigateur refuse la lecture du presse-papiers : collez avec Ctrl+V.'));
    }
  };

  const openAdmin = (): void => {
    closeCapture();
    navigate(server ? `${paths.admin}#reading` : `${paths.admin}#server`);
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
      onClose={closeCapture}
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
      foot={
        <>
          {!reading ? (
            <Button kind="text" icon="server" onClick={openAdmin}>
              {t('Administration')}
            </Button>
          ) : null}
          <Button type="submit" icon="check" disabled={urls.length === 0}>
            {reading ? t('Classer') : t('Ajouter')}
          </Button>
        </>
      }
    >
      <div className={styles.address}>
        <div className={styles.field}>
          <Icon name="link" size={20} />
          <input
            className={styles.input}
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder="https://…"
            aria-label={t('Adresse du lien')}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            data-autofocus
          />
          {typeof navigator.clipboard?.readText === 'function' ? <IconButton icon="copy" label={t('Coller le lien copié')} onClick={() => void paste()} /> : null}
        </div>
        <p className={`${styles.cleaned} t-meta`} aria-live="polite">
          {removed.length > 0 ? (
            <>
              <Icon name="broom" size={18} />
              {removed.length > 1 ? t('Nettoyé : {names} seront retirés de l’adresse.', { names: removedList(removed) }) : t('Nettoyé : {names} sera retiré de l’adresse.', { names: removedList(removed) })}
            </>
          ) : null}
        </p>
      </div>
      <div className={styles.group}>
        <p className="t-meta-strong" id={`${titleId}-collection`}>
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

export function CaptureDialog() {
  const open = useUiStore(selectCaptureOpen);
  const initial = useUiStore(selectCaptureText);
  return (
    <Layer open={open} onDismiss={closeCapture} label={t('Classer un lien')}>
      <CaptureForm initial={initial} />
    </Layer>
  );
}
