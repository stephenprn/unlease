/**
 * The address the caret stands on in a note (`useCaretLink`), as a chip in the middle of the note's
 * bar, where the date or the history's pair sits: the editor's fields cannot draw a link, so this is
 * the way to it. It takes their place in place, the bar's height and buttons kept, so nothing moves
 * as the caret walks through the words. It opens in a new tab; pressing it leaves the caret where it
 * was (the field keeps the focus). The shorter way, Ctrl+click (⌘ on a Mac) on the address itself,
 * is its tooltip.
 */
import { t } from '@unlease/core/i18n';
import { prettyUrl } from '@unlease/core/services/url';

import { Icon } from '@shared/ui/components/Icon';
import { modKey } from '@shared/ui/dom';
import styles from './editor.module.css';

export function CaretLink({ href }: { readonly href: string }) {
  const shown = prettyUrl(href, 120);
  return (
    <span className={styles.caretSlot}>
      <a
        className={styles.caretLink}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('Open {address}', { address: shown })}
        title={t('{key}+click on a link opens it at once', { key: modKey() })}
        onMouseDown={event => event.preventDefault()}
      >
        <Icon name="external" size={18} className={styles.caretLinkGlyph} />
        <span className={`${styles.caretLinkUrl} t-label`}>{shown}</span>
      </a>
    </span>
  );
}
