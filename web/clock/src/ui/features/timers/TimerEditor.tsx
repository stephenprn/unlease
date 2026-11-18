/**
 * A timer's form, over the page it was opened from (`/clock/timers/new`, `/clock/timer/<id>`): a
 * dialog, the phone's sheet under 720 (the phone's `TimerScreen`). Its length typed on the keypad as
 * on a microwave, or from the keyboard (the digits, Backspace; Delete clears), with the lengths
 * started lately (or the usual ones) one click away above it for a new timer; a label (« Pâtes »);
 * what it rings with. At its foot, « Démarrer » starts it now (Enter too) and a new one is gone once
 * it has rung (an instant timer, nothing kept); « Enregistrer » keeps it among the saved timers, on
 * every device. A saved timer's form saves its changes, starts it as changed, and « Supprimer »
 * takes it away. Started from over another page, the timers come forward, where it runs.
 */
import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type RefObject } from 'react';

import { t, tc } from '@unlease/core/i18n';
import { TIMER_LIMITS, type Timer } from '@unlease/clock/models/timer';
import { SILENT } from '@unlease/clock/services/sounds';
import { digitsOf, eraseDigit, keypadSeconds, lengthWords, quickLengths, typeDigits } from '@unlease/clock/services/timers';

import { showSnack, showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Layer } from '@shared/ui/components/Layer';
import { TextField } from '@shared/ui/components/TextField';
import { useUnsaved } from '@shared/ui/components/useUnsaved';
import { isEditable } from '@shared/ui/dom';
import { navigate, parseRoute } from '@shared/ui/router';
import { stopPreview } from '../../../app/sounds';
import { createTimer, deleteTimer, saveTimer, type TimerDraft } from '../../../app/store/actions';
import { useClockStore } from '../../../app/store/library';
import { usePrefsStore } from '../../../app/store/prefs';
import { startTimer, useToolsStore } from '../../../app/store/tools';
import styles from '../../clock.module.css';
import { paths } from '../../routes';
import { SoundField } from '../SoundField';
import { ToggleRow } from '../ToggleRow';
import tools from '../tools.module.css';
import { Keypad, LengthDisplay } from './Keypad';

interface FormProps {
  readonly timer: Timer | undefined;
  readonly closing: boolean;
  readonly titleId: string;
  /** The page under it, where Back lands when the history has nothing before it. */
  readonly under: string;
  readonly onClose: () => void;
}

function TimerForm({ timer, closing, titleId, under, onClose }: FormProps) {
  const prefs = usePrefsStore();
  const recent = useToolsStore(s => s.recent);
  const [initial] = useState(() => ({
    digits: timer ? digitsOf(timer.seconds) : '',
    label: timer?.label ?? '',
    sound: timer?.sound ?? prefs.timerSound,
    vibrate: timer?.vibrate ?? prefs.timerVibrate,
  }));
  const [digits, setDigits] = useState(initial.digits);
  const [label, setLabel] = useState(initial.label);
  const [sound, setSound] = useState(initial.sound);
  const [vibrate, setVibrate] = useState(initial.vibrate);
  const display = useRef<HTMLDivElement>(null);

  const seconds = keypadSeconds(digits);
  const draft: TimerDraft = { label, seconds, sound, vibrate };
  // A new timer is a length to start: only a saved one's changes are worth asking about.
  const dirty = timer !== undefined && (digits !== initial.digits || label !== initial.label || sound !== initial.sound || vibrate !== initial.vibrate);
  const unsaved = useUnsaved(dirty && !closing, { page: under });
  const cancel = unsaved.guard(onClose);
  const quick = useMemo(() => quickLengths(recent), [recent]);

  useEffect(() => {
    if (closing) stopPreview();
  }, [closing]);
  useEffect(() => stopPreview, []);

  /** Closes the form; a timer started from over another page brings the timers forward, where it runs. */
  const leave = (started: boolean): void => {
    unsaved.saved();
    if (started && parseRoute(new URL(under, location.origin).pathname).name !== 'clockTimers') navigate(paths.timers, { replace: true });
    else onClose();
  };
  const save = (): string | null => {
    if (seconds <= 0) return null;
    if (timer) {
      saveTimer(timer.id, draft);
      return timer.id;
    }
    return createTimer(draft);
  };
  const start = (): void => {
    if (seconds <= 0) return;
    // A saved timer starts as changed (and keeps the change); a new one runs once, with what was typed.
    const id = timer ? save() : null;
    const saved = id ? useClockStore.getState().timers[id] : undefined;
    if (saved) startTimer({ seconds, timer: saved });
    else startTimer({ seconds, label: label.replace(/\s+/g, ' ').trim().slice(0, TIMER_LIMITS.label), sound, vibrate });
    leave(true);
  };
  const keep = (): void => {
    if (!save()) return;
    leave(false);
    showSnack(t('Timer saved'), undefined, { tone: 'success' });
  };
  const remove = (): void => {
    if (!timer) return;
    const undo = deleteTimer(timer.id);
    leave(false);
    showUndo(t('Timer deleted'), undo);
  };

  // The keyboard types the length as the keys do, but in a field (the label), whose words are its own.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (closing || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return;
    if (/^[0-9]$/.test(event.key)) setDigits(before => typeDigits(before, event.key));
    else if (event.key === 'Backspace') setDigits(eraseDigit);
    else if (event.key === 'Delete') setDigits('');
    else return;
    event.preventDefault();
  });
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => onKey(event);
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, []);

  const silentAndStill = sound === SILENT && !vibrate;
  return (
    <>
      <Layer open={!closing} onDismiss={cancel} routed labelledBy={titleId} initialFocus={display as RefObject<HTMLElement | null>}>
        <DialogFrame
          title={timer ? t('Edit timer') : t('New timer')}
          titleId={titleId}
          onClose={cancel}
          className={styles.editor}
          onSubmit={event => {
            event.preventDefault();
            start();
          }}
          foot={
            <>
              {timer ? (
                <Button kind="dangerText" icon="trash" className={styles.footStart} onClick={remove}>
                  {t('Delete')}
                </Button>
              ) : null}
              <Button kind="tonal" disabled={seconds <= 0} onClick={keep}>
                {timer ? t('Save') : t('Save for later')}
              </Button>
              <Button type="submit" icon="go" disabled={seconds <= 0}>
                {tc('timer', 'Start')}
              </Button>
            </>
          }
        >
          {/* Focused as it opens: the digits typed go to the keypad. */}
          <div ref={display} className={tools.lengthBlock} tabIndex={-1} aria-label={t('Timer')}>
            <LengthDisplay digits={digits} />
          </div>
          {timer ? null : (
            <div className={tools.quickRow} role="group" aria-label={t('Usual lengths')}>
              {quick.map(length => (
                <button key={length} type="button" className={styles.choice} aria-pressed={seconds === length} onClick={() => setDigits(digitsOf(length))}>
                  {lengthWords(length)}
                </button>
              ))}
            </div>
          )}
          <Keypad empty={digits === ''} onKey={key => setDigits(before => typeDigits(before, key))} onErase={() => setDigits(eraseDigit)} onClear={() => setDigits('')} />
          <TextField label={t('Label')} kind="text" optional value={label} onChange={setLabel} maxLength={TIMER_LIMITS.label} enterKeyHint="go" placeholder={t('Pasta, green tea…')} />
          <SoundField label={t('Sound')} value={sound} onChange={setSound} />
          <div className={styles.toggles}>
            <ToggleRow icon="phone" title={t('Vibrate')} meta={silentAndStill ? t('Silent and without vibration, it only shows on the screen.') : undefined} on={vibrate} onChange={setVibrate} />
          </div>
        </DialogFrame>
      </Layer>
      {unsaved.dialog}
    </>
  );
}

/** An address of a saved timer that is not there (deleted, or never synced here). */
function Gone({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  return (
    <Layer open={!closing} onDismiss={onClose} label={t('Timer not found')} routed>
      <DialogFrame
        title={t('Timer not found')}
        onClose={onClose}
        className={styles.goneFrame}
        foot={
          <Button kind="filled" onClick={onClose}>
            {t('Close')}
          </Button>
        }
      >
        <p className="t-body">{t('This timer no longer exists.')}</p>
      </DialogFrame>
    </Layer>
  );
}

export function TimerEditor({ id, closing, under, onClose }: { id: string | null; closing: boolean; under: string; onClose: () => void }) {
  const titleId = useId();
  const timer = useClockStore(s => (id === null ? undefined : s.timers[id]));
  const live = timer && timer.deletedAt === null ? timer : undefined;
  // The timer as it opened: deleted from here, it keeps its form while the dialog leaves.
  const [opened] = useState(live);
  const shown = live ?? (closing ? opened : undefined);
  if (id !== null && !shown) return <Gone closing={closing} onClose={onClose} />;
  return <TimerForm timer={shown} closing={closing} titleId={titleId} under={under} onClose={onClose} />;
}
