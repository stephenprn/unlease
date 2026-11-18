/**
 * A timer's length, typed as on a microwave (the phone's `Keypad`): digits come in on the right,
 * `5 0 0` is 5 minutes. The display shows hours, minutes and seconds large, what was typed in ink and
 * the zeros before it faint; the keypad is twelve keys on the raised paper at the tab radius; « ⌫ »
 * takes the last digit back, held it clears them all. The form also takes the digits and Backspace
 * from the keyboard (`TimerEditor`). A screen reader hears the length whole.
 */
import { memo, useRef } from 'react';

import { t } from '@unlease/core/i18n';
import { keypadFields, keypadSeconds, lengthSentence } from '@unlease/clock/services/timers';

import { Icon } from '@shared/ui/components/Icon';
import tools from '../tools.module.css';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'erase'] as const;

/** How long « ⌫ » is held to clear everything. */
const HOLD_MS = 500;

/** `00h 05m 00s`: the typed digits in ink, the zeros before them faint. */
export const LengthDisplay = memo(function LengthDisplay({ digits }: { digits: string }) {
  const fields = keypadFields(digits);
  // Of the six places, those from here on were typed.
  const typedFrom = 6 - digits.length;
  const units = [t('h [hours]'), t('m [minutes]'), t('s [seconds]')];
  const seconds = keypadSeconds(digits);
  return (
    <div className={tools.display}>
      <span className="sr-only" role="status">
        {seconds > 0 ? lengthSentence(seconds) : t('No length yet')}
      </span>
      {fields.map((field, index) => (
        <span key={index} className={tools.displayGroup} aria-hidden="true">
          {[...field].map((digit, at) => (
            <span key={at} className={tools.displayDigit} data-typed={index * 2 + at >= typedFrom || undefined}>
              {digit}
            </span>
          ))}
          <span className={`${tools.displayUnit} t-body-strong`} data-typed={index * 2 + 1 >= typedFrom || undefined}>
            {units[index]}
          </span>
        </span>
      ))}
    </div>
  );
});

interface KeypadProps {
  readonly onKey: (key: string) => void;
  readonly onErase: () => void;
  readonly onClear: () => void;
  /** Nothing typed: « ⌫ » has nothing to take back. */
  readonly empty: boolean;
}

export const Keypad = memo(function Keypad({ onKey, onErase, onClear, empty }: KeypadProps) {
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; cleared: boolean } | null>(null);
  const release = (): void => {
    if (hold.current) clearTimeout(hold.current.timer);
  };
  return (
    <div className={tools.pad}>
      {KEYS.map(key =>
        key === 'erase' ? (
          <button
            key={key}
            type="button"
            className={`${tools.key} ${tools.eraseKey}`}
            disabled={empty}
            aria-label={t('Erase a digit')}
            data-tip={t('Hold to erase everything')}
            onPointerDown={() => {
              release();
              const state = { cleared: false, timer: setTimeout(() => {
                state.cleared = true;
                onClear();
              }, HOLD_MS) };
              hold.current = state;
            }}
            onPointerUp={release}
            onPointerLeave={release}
            onPointerCancel={release}
            onClick={() => {
              // Held long enough, it cleared everything: the click that ends the hold takes nothing more.
              if (hold.current?.cleared) {
                hold.current = null;
                return;
              }
              onErase();
            }}
          >
            <Icon name="back" size={24} />
          </button>
        ) : (
          <button key={key} type="button" className={tools.key} onClick={() => onKey(key)}>
            {key}
          </button>
        ),
      )}
    </div>
  );
});
