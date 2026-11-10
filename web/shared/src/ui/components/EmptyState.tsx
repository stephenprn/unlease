/**
 * An empty place, the same in both spaces (the phone's EmptyBoard): a collage, a title, what goes
 * there, then the keys that fill it (under a keyboard) or one action.
 */
import { memo, type ReactNode } from 'react';

import type { CollageScene } from '@unlease/design/collage';

import { Collage } from './Collage';
import styles from './empty.module.css';

export interface EmptyKey {
  readonly key: string;
  readonly label: string;
}

export interface EmptyStateProps {
  readonly scene: CollageScene;
  readonly title: string;
  readonly text: string;
  /** The title's level: a view's h1 is its own head, so the empty title is an h2 unless it heads the page. */
  readonly as?: 'h1' | 'h2';
  readonly keys?: readonly EmptyKey[];
  readonly children?: ReactNode;
}

function EmptyStateComponent({ scene, title, text, as: Heading = 'h2', keys, children }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.art}>
        <Collage scene={scene} width={252} />
      </div>
      <Heading className={`${styles.title} t-title`}>{title}</Heading>
      <p className={`${styles.text} t-body`}>{text}</p>
      {keys && keys.length > 0 ? (
        <p className={`${styles.keys} t-meta`}>
          {keys.map(({ key, label }) => (
            <span key={key}>
              <kbd>{key}</kbd> {label}
            </span>
          ))}
        </p>
      ) : null}
      {children ? <div className={styles.action}>{children}</div> : null}
    </div>
  );
}

export const EmptyState = memo(EmptyStateComponent);
