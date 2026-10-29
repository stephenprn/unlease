/**
 * An outlined text field with its label above (a moving label is one more
 * thing to read), help or error below, wired for screen readers.
 */
import { forwardRef, memo, useId, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react';

import styles from './controls.module.css';

export interface TextFieldProps {
  readonly label?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly help?: string;
  readonly error?: string | null;
  readonly multiline?: boolean;
  readonly type?: InputHTMLAttributes<HTMLInputElement>['type'];
  readonly inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  readonly autoComplete?: string;
  readonly autoFocus?: boolean;
  readonly maxLength?: number;
  readonly spellCheck?: boolean;
  readonly autoCapitalize?: string;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  readonly onBlur?: () => void;
  readonly className?: string;
  readonly inputClassName?: string;
  readonly ariaLabel?: string;
  readonly name?: string;
}

const TextFieldComponent = forwardRef<HTMLInputElement | HTMLTextAreaElement, TextFieldProps>(function TextField(
  { label, value, onChange, placeholder, help, error, multiline, type = 'text', inputMode, autoComplete, autoFocus, maxLength, spellCheck, autoCapitalize, onKeyDown, onBlur, className, inputClassName, ariaLabel, name },
  ref,
) {
  const id = useId();
  const describedBy = error || help ? `${id}-note` : undefined;
  const common = {
    id,
    value,
    placeholder,
    autoFocus,
    maxLength,
    spellCheck,
    autoCapitalize,
    name,
    onKeyDown,
    onBlur,
    'aria-label': label ? undefined : ariaLabel,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: [styles.input, error ? styles.invalid : '', inputClassName ?? ''].filter(Boolean).join(' '),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
  };
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      {label ? (
        <label htmlFor={id} className={`${styles.fieldLabel} t-meta-strong`}>
          {label}
        </label>
      ) : null}
      {multiline ? (
        <textarea ref={ref as React.Ref<HTMLTextAreaElement>} rows={3} {...common} />
      ) : (
        <input ref={ref as React.Ref<HTMLInputElement>} type={type} inputMode={inputMode} autoComplete={autoComplete} {...common} />
      )}
      {error ? (
        <p id={describedBy} className={`${styles.error} t-meta`} role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={describedBy} className={`${styles.help} t-meta`}>
          {help}
        </p>
      ) : null}
    </div>
  );
});

export const TextField = memo(TextFieldComponent);
