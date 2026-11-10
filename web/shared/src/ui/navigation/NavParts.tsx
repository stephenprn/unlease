/**
 * The pieces every app's navigation is made of, so each draws its places the same way: a row (a
 * link to a place, its mark, its name, a count), a glyph in the mark's slot, a section that folds
 * shut on its title (remembered on this browser) with its action at the far end.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';

import { setSectionFolded, useNavUiStore, type NavSection } from '../../app/store/navUi';
import { Icon } from '../components/Icon';
import { Link } from '../router';
import styles from './nav.module.css';

export { styles as navStyles };

export interface NavRowProps {
  readonly to: string;
  readonly label: string;
  readonly leading: ReactNode;
  readonly trailing?: ReactNode;
  /** A collection's or a label's colour: chosen, the row lies on its own wash instead of matcha. */
  readonly wash?: string;
  readonly current: boolean;
  /** The place on screen is inside this one (a section of the Administration): it says so, more quietly than the place itself. */
  readonly within?: boolean;
  readonly onNavigate?: () => void;
}

export function NavRow({ to, label, leading, trailing, wash, current, within = false, onNavigate }: NavRowProps) {
  return (
    <Link
      to={to}
      className={styles.item}
      style={wash ? ({ '--stone': `var(--line-${wash}-tint)`, '--stone-ink': 'var(--ink)' } as CSSProperties) : undefined}
      ariaCurrent={current ? 'page' : within ? 'location' : undefined}
      onNavigate={onNavigate}
    >
      {leading}
      <span className={styles.itemName}>{label}</span>
      {trailing}
    </Link>
  );
}

/** A glyph in a row's mark slot. */
export function NavGlyph({ name }: { name: GlyphName }) {
  return (
    <span className={styles.markSlot}>
      <Icon name={name} size={22} />
    </span>
  );
}

/** A quiet row that does something rather than going somewhere (« Nouvelle collection »). */
export function NavAction({ label, icon, onClick }: { label: string; icon: GlyphName; onClick: () => void }) {
  return (
    <button type="button" className={`${styles.item} ${styles.quiet}`} onClick={onClick}>
      <span className={styles.markSlot}>
        <Icon name={icon} size={20} />
      </span>
      <span className={styles.itemName}>{label}</span>
    </button>
  );
}

/** A section of the navigation: its title folds it shut (remembered on this browser), its action at the far end. */
export function NavFold({ id, title, action, children }: { id: NavSection; title: string; action?: ReactNode; children: ReactNode }) {
  const folded = useNavUiStore(s => s.folded.has(id));
  const body = useId();
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h2 className={styles.headingTitle}>
          <button type="button" className={styles.headingToggle} aria-label={folded ? t('Déplier {section}', { section: title }) : t('Replier {section}', { section: title })} aria-expanded={!folded} aria-controls={body} onClick={() => setSectionFolded(id, !folded)}>
            <span className={styles.headingChevron} data-open={!folded || undefined}>
              <Icon name="chevronRight" size={14} />
            </span>
            <span className="t-meta-strong">{title}</span>
          </button>
        </h2>
        {action}
      </div>
      {folded ? null : (
        <div id={body} className={styles.sectionBody}>
          {children}
        </div>
      )}
    </section>
  );
}

/** A section that does not fold (the pages' tree). */
export function NavStill({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.heading}>
        <h2 className={`${styles.headingTitle} ${styles.headingStill} t-meta-strong`}>{title}</h2>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}
