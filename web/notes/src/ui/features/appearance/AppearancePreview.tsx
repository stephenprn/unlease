/**
 * The app in miniature, by day and at night side by side, in the colours and on the ground of an
 * appearance (the one chosen, or an editor's draft): what a choice gives in the theme not on screen
 * too, where a colour may have moved to stay readable. Pieces of the board drawn as bars, no words.
 */
import { memo, type CSSProperties } from 'react';

import { resolveAppearance, type Appearance } from '@unlease/design/appearance';
import type { Mode } from '@unlease/design/palette';
import { t } from '@unlease/core/i18n';

import { Icon } from '../../components/Icon';
import { useShownMode } from '../../appearanceStyle';
import styles from './appearance.module.css';

type Look = Pick<Appearance, 'primary' | 'accent' | 'ground' | 'grain'>;

const MODES: readonly Mode[] = ['light', 'dark'];

const bar = (color: string, width: string): CSSProperties => ({ width, background: color });

function Mini({ look, mode }: { look: Look; mode: Mode }) {
  const { roles: r, ground } = resolveAppearance(look, mode);
  return (
    <div className={styles.mini} style={{ backgroundColor: ground.base, backgroundImage: ground.layers.join(', ') || undefined }}>
      {look.grain ? <span className={styles.miniGrain} /> : null}
      <span className={styles.miniStrip} style={{ background: r.field, boxShadow: `inset 0 0 0 1px ${r.outline}` }} />
      <span className={styles.miniChips}>
        <span className={styles.miniChip} style={{ width: '30%', background: r.actionContainer }}>
          <span className={styles.miniBar} style={bar(r.onActionContainer, '100%')} />
        </span>
        <span className={styles.miniChip} style={{ width: '26%', background: r.paper, boxShadow: `inset 0 0 0 1px ${r.hairline}` }}>
          <span className={styles.miniBar} style={bar(r.inkMuted, '100%')} />
        </span>
      </span>
      <span className={styles.miniCards}>
        {/* A card picked: the focus ring and the tick pebble. */}
        <span className={styles.miniCard} style={{ background: r.paper, boxShadow: `0 0 0 1.5px ${r.focus}` }}>
          <span className={styles.miniBar} style={bar(r.ink, '78%')} />
          <span className={styles.miniBar} style={bar(r.inkMuted, '100%')} />
          <span className={styles.miniBar} style={bar(r.inkMuted, '64%')} />
          {/* The tick pebble, half outside the corner, ringed in the ground. */}
          <span className={styles.miniTick} data-pebble={2} style={{ background: ground.base }}>
            <span className={styles.miniTickLeaf} data-pebble={2} style={{ background: r.leaf }} />
          </span>
        </span>
        <span className={styles.miniCard} style={{ background: r.paper, boxShadow: `inset 0 0 0 1px ${r.hairline}` }}>
          <span className={styles.miniBar} style={bar(r.ink, '64%')} />
          <span className={styles.miniBar} style={bar(r.link, '88%')} />
          <span className={styles.miniBar} style={bar(r.inkMuted, '50%')} />
        </span>
      </span>
      <span className={styles.miniWide} style={{ background: r.paper, boxShadow: `inset 0 0 0 1px ${r.hairline}` }}>
        <span className={styles.miniBar} style={bar(r.ink, '40%')} />
        <span className={styles.miniBar} style={bar(r.inkMuted, '72%')} />
      </span>
      <span className={styles.miniFoot}>
        <span className={styles.miniButton} style={{ background: r.action }}>
          <span className={styles.miniBar} style={bar(r.onAction, '54%')} />
        </span>
        <span className={styles.miniPebble} data-pebble={1} style={{ background: r.leaf, color: r.onLeaf }}>
          <Icon name="plus" size={14} />
        </span>
      </span>
      <span className={styles.miniEdge} style={{ boxShadow: `inset 0 0 0 1px ${r.hairline}` }} />
    </div>
  );
}

function AppearancePreviewComponent({ look, className }: { look: Look; className?: string }) {
  const shown = useShownMode();
  return (
    <div className={[styles.preview, className ?? ''].join(' ')} role="img" aria-label={t('Aperçu de jour et de nuit')}>
      {MODES.map(mode => (
        <figure key={mode} className={styles.previewFigure} aria-hidden="true">
          <Mini look={look} mode={mode} />
          <figcaption className={`${styles.previewCaption} t-label-small`} data-shown={mode === shown || undefined}>
            {mode === 'light' ? t('Jour') : t('Nuit')}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export const AppearancePreview = memo(AppearancePreviewComponent);
