/**
 * The address the caret stands on in a note (`useCaretLink`), in a row of its own over the note's
 * foot: the editor's fields cannot draw a link, so this is the way to it. It opens in a new tab;
 * pressing it leaves the caret where it was (the field keeps the focus). On a pointer that can hold
 * a key, a quiet line says the shorter way: Ctrl+click (⌘ on a Mac) on the address itself.
 */
import { t } from '@unlease/core/i18n';
import { prettyUrl } from '@unlease/core/services/url';

import { Icon } from '@shared/ui/components/Icon';
import { modKey } from '@shared/ui/dom';
import styles from './editor.module.css';

export function CaretLink({ href }: { readonly href: string }) {
  const shown = prettyUrl(href, 120);
  return (
    <a
      className={styles.caretLink}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('Ouvrir {address}', { address: shown })}
      onMouseDown={event => event.preventDefault()}
    >
      <Icon name="external" size={18} className={styles.caretLinkGlyph} />
      <span className={`${styles.caretLinkUrl} t-label`}>{shown}</span>
      <span className={`${styles.caretLinkHint} t-meta`} aria-hidden="true">
        {t('ou {key}+clic sur le lien', { key: modKey() })}
      </span>
    </a>
  );
}
