/** A sheet of the settings or the Administration, under its title; `info` puts the phone's "how it works" pebble beside the title. */
import { useId, type CSSProperties, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import type { StatusTone } from '@unlease/core/services/admin';

import { OutlinedBox } from '../../components/Outline';
import { InfoBubble, InfoButton, useInfoBubble } from './InfoBubble';
import styles from './settings.module.css';

export function Section({ title, info, children, id }: { title: string; info?: string; children: ReactNode; id?: string }) {
  const titleId = useId();
  const bubble = useInfoBubble();
  return (
    <section className={styles.section} aria-labelledby={titleId} id={id}>
      <div className={styles.sectionHead}>
        <h2 id={titleId} className={`${styles.sectionTitle} t-section`}>
          {title}
        </h2>
        {info ? <InfoButton open={bubble.open} bubble={bubble.id} onClick={bubble.toggle} /> : null}
      </div>
      {/* `info` may be a French constant (`tx`): read in the interface's language. */}
      {info ? <InfoBubble id={bubble.id} open={bubble.open} text={t(info)} /> : null}
      <OutlinedBox kind="panel" lift="card" className={styles.card}>
        {children}
      </OutlinedBox>
    </section>
  );
}

const TONE_COLORS: Record<StatusTone, string> = { ok: 'var(--ok)', waiting: 'var(--waiting)', danger: 'var(--danger)', off: 'var(--ink-faint)' };

/** A status dot's colour, for a row that draws its own (the first run's checklist). */
export const toneColor = (tone: StatusTone): string => TONE_COLORS[tone];

/** A status in two lines beside its dot, as the phone writes it. */
export function StatusRow({ tone, title, meta, children }: { tone: StatusTone; title: string; meta?: string; children?: ReactNode }) {
  return (
    <div className={`${styles.status} ${styles.statusTop}`}>
      <span className={styles.dot} style={{ '--dot': TONE_COLORS[tone] } as CSSProperties} aria-hidden="true" />
      <div className={styles.rowText}>
        <p className="t-body-strong">{title}</p>
        {meta ? <p className="t-meta">{meta}</p> : null}
      </div>
      {children}
    </div>
  );
}
