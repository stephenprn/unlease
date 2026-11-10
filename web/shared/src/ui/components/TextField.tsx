/**
 * An outlined text field with its label above (a moving label is one more thing to read), its help
 * or its problem under it, wired for screen readers. What it holds (`kind`, `design/fields.ts`) sets
 * its keyboard, its capitals and whether the browser may fill or correct it; a hidden one (a key, a
 * token) has its own eye. Bound to a form (`field`, from `useForm`), it says what is wrong when the
 * form's timing says so, and takes the focus when it holds the first problem.
 */
import { forwardRef, memo, useCallback, useId, useState, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from 'react';

import { t } from '@unlease/core/i18n';
import { fieldInput, roomLeft, type FieldKind } from '@unlease/design/fields';

import styles from './controls.module.css';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import type { FieldBinding } from './useForm';

export interface TextFieldProps {
  readonly label?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** What it holds: its keyboard, capitals, autofill and corrections (the props below win). */
  readonly kind?: FieldKind;
  /** Its place in a form (`useForm`): the problem it shows and when. */
  readonly field?: FieldBinding;
  /** « (facultatif) » after the label, in a form where most fields must be filled. */
  readonly optional?: boolean;
  readonly placeholder?: string;
  readonly help?: ReactNode;
  readonly error?: string | null;
  readonly multiline?: boolean;
  readonly type?: InputHTMLAttributes<HTMLInputElement>['type'];
  readonly inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  readonly enterKeyHint?: InputHTMLAttributes<HTMLInputElement>['enterKeyHint'];
  readonly autoComplete?: string;
  readonly autoFocus?: boolean;
  /** The most it holds; how much is used shows from 80% of it. */
  readonly maxLength?: number;
  readonly spellCheck?: boolean;
  readonly autoCapitalize?: string;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  readonly onBlur?: () => void;
  readonly onFocus?: () => void;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly ariaLabel?: string;
  readonly name?: string;
  /** For a hidden kind: the eye's words (« Afficher le jeton »), when « Afficher » is short of them. */
  readonly revealLabels?: { readonly show: string; readonly hide: string };
}

function assign<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

const TextFieldComponent = forwardRef<HTMLInputElement | HTMLTextAreaElement, TextFieldProps>(function TextField(
  {
    label,
    value,
    onChange,
    kind,
    field,
    optional,
    placeholder,
    help,
    error,
    multiline,
    type,
    inputMode,
    enterKeyHint,
    autoComplete,
    autoFocus,
    maxLength,
    spellCheck,
    autoCapitalize,
    onKeyDown,
    onBlur,
    onFocus,
    className,
    inputClassName,
    ariaLabel,
    name,
    revealLabels,
  },
  ref,
) {
  const id = useId();
  const input = kind ? fieldInput(kind).web : null;
  const hidden = input?.type === 'password' || type === 'password';
  const [shown, setShown] = useState(false);
  const problem = error ?? field?.error ?? null;
  const room = roomLeft(value.length, maxLength);
  const noteId = problem || help ? `${id}-note` : undefined;
  const roomId = room !== null ? `${id}-room` : undefined;
  const register = field?.register;
  const attach = useCallback(
    (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      assign(ref, element);
      register?.(element);
    },
    [ref, register],
  );
  const common = {
    id,
    value,
    placeholder,
    autoFocus,
    maxLength,
    spellCheck: spellCheck ?? input?.spellCheck,
    autoCapitalize: autoCapitalize ?? input?.autoCapitalize,
    autoCorrect: input?.autoCorrect,
    enterKeyHint,
    name: name ?? field?.name,
    onKeyDown,
    onFocus,
    onBlur: () => {
      field?.left(value);
      onBlur?.();
    },
    'aria-label': label ? undefined : ariaLabel,
    'aria-invalid': problem ? true : undefined,
    'aria-describedby': [noteId, roomId].filter(Boolean).join(' ') || undefined,
    className: [styles.input, problem ? styles.invalid : '', hidden ? styles.inputRevealable : '', inputClassName ?? ''].filter(Boolean).join(' '),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(event.target.value);
      field?.edited();
    },
  };
  const control = multiline ? (
    <textarea ref={attach} rows={3} {...common} />
  ) : (
    <input
      ref={attach}
      type={hidden ? (shown ? 'text' : 'password') : (type ?? input?.type ?? 'text')}
      inputMode={inputMode ?? input?.inputMode}
      autoComplete={autoComplete ?? input?.autoComplete}
      {...common}
    />
  );
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      {label ? (
        <label htmlFor={id} className={`${styles.fieldLabel} t-meta-strong`}>
          {label}
          {optional ? <span className={`${styles.optional} t-meta`}> {t('(facultatif)')}</span> : null}
        </label>
      ) : null}
      {hidden ? (
        <div className={styles.revealable}>
          {control}
          <IconButton
            icon={shown ? 'eyeOff' : 'eye'}
            label={shown ? (revealLabels?.hide ?? t('Masquer')) : (revealLabels?.show ?? t('Afficher'))}
            className={styles.reveal}
            onClick={() => setShown(value => !value)}
          />
        </div>
      ) : (
        control
      )}
      {problem || help || room !== null ? (
        <div className={styles.fieldNote}>
          {problem ? (
            <p id={noteId} className={`${styles.error} t-meta`}>
              <Icon name="error" size={16} className={styles.errorGlyph} />
              <span>{problem}</span>
            </p>
          ) : help ? (
            <p id={noteId} className={`${styles.help} t-meta`}>
              {help}
            </p>
          ) : (
            <span />
          )}
          {room !== null ? (
            <span id={roomId} className={`${styles.room} t-meta`} data-over={room < 0 || undefined}>
              {value.length} / {maxLength}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

export const TextField = memo(TextFieldComponent);
