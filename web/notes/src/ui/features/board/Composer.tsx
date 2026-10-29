/**
 * The create strip at the top of a space's home: "Créer une note…" on the board, "Créer une page…"
 * on the pages' home, in the same place, so the two spaces start the same way. A click (or its key)
 * creates; the notes' strip also makes a checklist, a drawing or a photo note from its buttons.
 */
import { memo, useRef, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';

import { IconButton } from '../../components/IconButton';
import { Icon } from '../../components/Icon';
import styles from './board.module.css';

export interface ComposerStripProps {
  readonly label: string;
  /** The key that does the same from anywhere, shown at the strip's end. */
  readonly shortcut: string;
  readonly onCreate: () => void;
  /** Other ways to create, as icon buttons after the strip. */
  readonly children?: ReactNode;
}

function ComposerStripComponent({ label, shortcut, onCreate, children }: ComposerStripProps) {
  return (
    <div className={`${styles.composer} paper`}>
      <button type="button" className={styles.composerMain} onClick={onCreate}>
        <span className={styles.composerLeaf} data-pebble={0} aria-hidden="true">
          <Icon name="plus" size={18} />
        </span>
        {label}
        <kbd className={styles.composerKey} aria-hidden="true">
          {shortcut}
        </kbd>
      </button>
      {children}
    </div>
  );
}

export const ComposerStrip = memo(ComposerStripComponent);

export interface ComposerProps {
  readonly onNote: () => void;
  readonly onChecklist: () => void;
  readonly onDrawing: () => void;
  readonly onPhotos: (files: File[]) => void;
}

function ComposerComponent({ onNote, onChecklist, onDrawing, onPhotos }: ComposerProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <ComposerStrip label={t('Créer une note…')} shortcut="C" onCreate={onNote}>
      <IconButton icon="checklist" label={t('Nouvelle liste')} shortcut="L" onClick={onChecklist} />
      <IconButton icon="draw" label={t('Nouveau dessin')} shortcut="D" shape={2} onClick={onDrawing} />
      <IconButton icon="image" label={t('Nouvelle note avec photo')} onClick={() => input.current?.click()} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={event => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          if (files.length > 0) onPhotos(files);
        }}
      />
    </ComposerStrip>
  );
}

export const Composer = memo(ComposerComponent);
