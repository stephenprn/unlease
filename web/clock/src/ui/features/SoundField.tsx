/**
 * An alarm's sound, chosen as a field is (its label above, the field's paper and edge, the chosen
 * sound's name and the chevron), opening the app's menu grouped by mood (« Doux », « Classique »,
 * « Énergique »), then « Silencieux (vibreur seul) » apart; the play button beside it plays the
 * chosen sound once, and again stops it. A sound picked on a phone (`phone:…`) shows its name and
 * « (ce téléphone) »: it is that phone's, so the web never offers it, nor plays it.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import { t } from '@unlease/core/i18n';
import { isPhoneSound, MOOD_NAMES, SILENT, soundName, SOUNDS, type SoundMood } from '@unlease/clock/services/sounds';

import { showError } from '@shared/app/store/ui';
import controls from '@shared/ui/components/controls.module.css';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton } from '@shared/ui/components/IconButton';
import layers from '@shared/ui/components/layers.module.css';
import { Popover } from '@shared/ui/components/Popover';
import { playPreview, soundUrl, stopPreview, usePreviewStore } from '../../app/sounds';
import styles from '../clock.module.css';

const MOODS: readonly SoundMood[] = ['gentle', 'classic', 'lively'];

/** The name a field shows: a phone's own sound says whose it is. */
export const shownSound = (key: string): string => (isPhoneSound(key) ? t('{sound} (this phone)', { sound: soundName(key) }) : soundName(key));

/** Plays the sound once, or stops it; nothing to play for silence or a phone's own sound. */
export function PlayButton({ sound }: { sound: string }) {
  const playing = usePreviewStore(s => s.playing === sound);
  const playable = soundUrl(sound) !== null;
  return (
    <IconButton
      icon="play"
      label={playing ? t('Stop the sound') : playable ? t('Play the sound') : isPhoneSound(sound) ? t('This sound plays on its phone only') : t('No sound to play')}
      pressed={playing}
      disabled={!playable}
      onClick={() => {
        if (playing) {
          stopPreview();
          return;
        }
        void playPreview(sound).then(heard => {
          if (!heard) showError(t('This browser can’t play the sound.'));
        });
      }}
    />
  );
}

function SoundMenu({ open, anchor, value, width, label, onPick, onDismiss }: { open: boolean; anchor: RefObject<HTMLButtonElement | null>; value: string; width: number | undefined; label: string; onPick: (key: string) => void; onDismiss: () => void }) {
  const chosen = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const headId = useId();
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const rows = [...(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    const move = (next: number): void => {
      event.preventDefault();
      rows[(next + rows.length) % rows.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(at + 1);
    else if (event.key === 'ArrowUp') move(at - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(rows.length - 1);
    else if (event.key === 'Tab') onDismiss();
  };
  const row = (key: string) => (
    <button
      key={key}
      ref={key === value ? chosen : undefined}
      type="button"
      role="menuitemradio"
      aria-checked={key === value}
      className={layers.menuItem}
      onClick={() => {
        onDismiss();
        onPick(key);
      }}
    >
      {key === value ? <Icon name="check" size={22} /> : <span className={controls.menuBlank} aria-hidden="true" />}
      <span>{soundName(key)}</span>
    </button>
  );
  return (
    <Popover open={open} anchor={anchor} onDismiss={onDismiss} label={label} role="menu" align="start" className={layers.menu} width={width && width > 210 ? width : undefined} initialFocus={chosen}>
      <div ref={list} className={layers.menuList} onKeyDown={onKeyDown}>
        {MOODS.map(mood => (
          <div key={mood} role="group" aria-labelledby={`${headId}-${mood}`} className={styles.soundGroup}>
            <p id={`${headId}-${mood}`} className={`${styles.soundMood} t-label-small`}>
              {MOOD_NAMES[mood]}
            </p>
            {SOUNDS.filter(sound => sound.mood === mood).map(sound => row(sound.key))}
          </div>
        ))}
        <div className={layers.menuSeparator} role="separator" />
        {row(SILENT)}
      </div>
    </Popover>
  );
}

export function SoundField({ label, value, onChange, help }: { label: string; value: string; onChange: (key: string) => void; help?: string }) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const phone = isPhoneSound(value);
  const note = phone ? t('Picked on a phone: that phone rings it, the others their own sound.') : help;
  // A sound changed while the last one plays: it stops, so what is heard is what is chosen.
  useEffect(() => stopPreview, [value]);
  return (
    <div className={controls.field}>
      <label htmlFor={id} className={`${controls.fieldLabel} t-meta-strong`}>
        {label}
      </label>
      <div className={styles.soundLine}>
        <button
          ref={anchor}
          id={id}
          type="button"
          className={`${controls.input} ${controls.select}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-describedby={note ? `${id}-note` : undefined}
          onClick={() => {
            setWidth(anchor.current?.offsetWidth);
            setOpen(true);
          }}
        >
          <Icon name="music" size={18} className={controls.selectIcon} />
          <span className={controls.selectValue}>{shownSound(value)}</span>
          <Icon name="chevronDown" size={18} className={controls.selectIcon} />
        </button>
        <PlayButton sound={value} />
      </div>
      {note ? (
        <p id={`${id}-note`} className={`${controls.help} ${controls.fieldNoteAlone} t-meta`}>
          {note}
        </p>
      ) : null}
      <SoundMenu open={open} anchor={anchor} value={value} width={width} label={label} onPick={onChange} onDismiss={() => setOpen(false)} />
    </div>
  );
}
