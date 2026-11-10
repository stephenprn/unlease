/**
 * A choice among a few named values, drawn as a text field is (its label above, the field's paper and
 * edge, its help or problem under it) and opening the app's menu: never the browser's own `<select>`,
 * whose list is the system's and ignores the theme. The value chosen carries the check; the arrows,
 * Enter and Escape work as in every menu. For two to four short choices a `Segmented` reads faster.
 */
import { useId, useRef, useState, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';

import styles from './controls.module.css';
import { Icon } from './Icon';
import { Menu, type MenuItem } from './Menu';
import type { FieldBinding } from './useForm';

export interface SelectOption<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SelectFieldProps<T extends string> {
  readonly label?: string;
  /** Its name when no label is shown. */
  readonly ariaLabel?: string;
  readonly value: T;
  readonly options: readonly SelectOption<T>[];
  readonly onChange: (value: T) => void;
  /** What the field shows when the chosen option's label is not enough (« Toutes les 2 semaines »). */
  readonly shown?: string;
  /** Before the value. */
  readonly icon?: GlyphName;
  readonly help?: ReactNode;
  readonly error?: string | null;
  readonly field?: FieldBinding;
  readonly optional?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
}

export function SelectField<T extends string>({ label, ariaLabel, value, options, onChange, shown, icon, help, error, field, optional, disabled, className }: SelectFieldProps<T>) {
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState<number | undefined>(undefined);
  const current = options.find(option => option.value === value);
  const problem = error ?? field?.error ?? null;
  const noteId = problem || help ? `${id}-note` : undefined;
  const items: MenuItem[] = options.map(option => ({
    label: option.label,
    icon: 'check',
    mark: option.value === value ? undefined : <span className={styles.menuBlank} aria-hidden="true" />,
    onSelect: () => {
      onChange(option.value);
      field?.edited();
    },
  }));
  return (
    <div className={[styles.field, className ?? ''].join(' ')}>
      {label ? (
        <label htmlFor={id} className={`${styles.fieldLabel} t-meta-strong`}>
          {label}
          {optional ? <span className={`${styles.optional} t-meta`}> {t('(facultatif)')}</span> : null}
        </label>
      ) : null}
      <button
        ref={element => {
          anchor.current = element;
          field?.register(element);
        }}
        id={id}
        type="button"
        className={[styles.input, styles.select, problem ? styles.invalid : ''].filter(Boolean).join(' ')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ? undefined : ariaLabel}
        aria-invalid={problem ? true : undefined}
        aria-describedby={noteId}
        disabled={disabled}
        onClick={() => {
          setWidth(anchor.current?.offsetWidth);
          setOpen(true);
        }}
      >
        {icon ? <Icon name={icon} size={18} className={styles.selectIcon} /> : null}
        <span className={styles.selectValue}>{shown ?? current?.label ?? ''}</span>
        <Icon name="chevronDown" size={18} className={styles.selectIcon} />
      </button>
      <Menu
        open={open}
        anchor={anchor}
        onDismiss={() => setOpen(false)}
        items={items}
        label={label ?? ariaLabel ?? ''}
        align="start"
        width={width}
        chosen={current ? options.indexOf(current) : undefined}
      />
      {problem ? (
        <p id={noteId} className={`${styles.error} ${styles.fieldNoteAlone} t-meta`}>
          <Icon name="error" size={16} className={styles.errorGlyph} />
          <span>{problem}</span>
        </p>
      ) : help ? (
        <p id={noteId} className={`${styles.help} ${styles.fieldNoteAlone} t-meta`}>
          {help}
        </p>
      ) : null}
    </div>
  );
}
