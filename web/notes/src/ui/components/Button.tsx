/**
 * Material's buttons in the station's colours. `href` makes it a link that
 * looks like a button (opening a link's page), everything else is a button.
 */
import { memo, type ReactNode } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';

import styles from './controls.module.css';
import { Icon } from './Icon';

export type ButtonKind = 'filled' | 'tonal' | 'text' | 'danger' | 'dangerText' | 'outlined';

export interface ButtonProps {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly kind?: ButtonKind;
  readonly icon?: GlyphName;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly small?: boolean;
  readonly stretch?: boolean;
  readonly type?: 'button' | 'submit';
  readonly href?: string;
  readonly className?: string;
  readonly title?: string;
  /** The language its words are in, when not the page's (a language named in itself). */
  readonly lang?: string;
}

function ButtonComponent({ children, onClick, kind = 'filled', icon, disabled, busy, small, stretch, type = 'button', href, className, title, lang }: ButtonProps) {
  const classes = [styles.button, styles[kind], small ? styles.small : '', stretch ? styles.stretch : '', className ?? ''].filter(Boolean).join(' ');
  const content = (
    <>
      {busy ? <span className={styles.spinner} aria-hidden="true" /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </>
  );
  if (href) {
    return (
      <a className={classes} href={href} target="_blank" rel="noopener noreferrer" title={title} lang={lang}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} title={title} lang={lang}>
      {content}
    </button>
  );
}

export const Button = memo(ButtonComponent);

export function Spinner({ className }: { className?: string }) {
  return <span className={[styles.spinner, className ?? ''].join(' ')} aria-hidden="true" />;
}
