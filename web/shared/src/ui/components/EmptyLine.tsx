/**
 * A small place with nothing in it (a picker's list, a menu, a sheet's answers, a block, a search
 * inside a popover): a glyph, one sentence in the muted ink, and a way out. A whole place that is
 * empty is an `EmptyState`; this is its line, the same on the phone (`EmptyLine`). It settles in a
 * moment after it is called for, so a list that fills at once never flashes it; another sentence
 * settles in afresh, the same one kept as more letters are typed does not.
 */
import { memo, type AriaRole } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';

import { Button } from './Button';
import styles from './emptyLine.module.css';
import { Icon } from './Icon';

/** Its arrival alone, for a row or a panel that says the same: a class to put on it. */
export const settleIn = styles.arrive!;

/** The type role of the lines it stands among. */
export type EmptyLineSize = 'meta' | 'label' | 'card' | 'body';

const SIZE_CLASS: Record<EmptyLineSize, string> = { meta: 't-meta', label: 't-label', card: 't-card-body', body: 't-body' };

export interface EmptyLineProps {
  readonly text: string;
  readonly glyph?: GlyphName;
  /** `start` (default) where rows would begin; `center` alone in a panel or a block. */
  readonly align?: 'start' | 'center';
  /** Default `meta`, a list's small print. */
  readonly size?: EmptyLineSize;
  /** A quiet text button after the sentence. */
  readonly action?: { readonly label: string; readonly onClick: () => void };
  /** Its place in the surrounding layout (paddings, margins). */
  readonly className?: string;
  readonly id?: string;
  /** `status` where it answers what was just typed or chosen. */
  readonly role?: AriaRole;
  /** What a new arrival follows: the sentence (default). One that names what is typed (« Aucun emoji pour « {query} » ») passes what it says instead, so more letters do not replay it. */
  readonly replayKey?: string;
}

function EmptyLineComponent({ text, glyph, align = 'start', size = 'meta', action, className, id, role, replayKey }: EmptyLineProps) {
  return (
    <div className={[styles.line, align === 'center' ? styles.center : '', className ?? ''].filter(Boolean).join(' ')} id={id} role={role}>
      {/* Keyed by its sentence: another one settles in afresh. */}
      <div key={replayKey ?? text} className={`${styles.settle} ${styles.arrive}`}>
        <p className={`${styles.say} ${SIZE_CLASS[size]}`}>
          {glyph ? (
            <span className={styles.glyph}>
              <Icon name={glyph} size={20} />
            </span>
          ) : null}
          <span className={styles.text}>{text}</span>
        </p>
        {action ? (
          <Button kind="text" small onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export const EmptyLine = memo(EmptyLineComponent);
