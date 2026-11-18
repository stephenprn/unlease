/** A row that is the switch itself, as a form's (an alarm's, a timer's): its glyph, its words, the switch at its end. */
import type { GlyphName } from '@unlease/design/glyphs';

import { SwitchMark } from '@shared/ui/components/Checkbox';
import { Icon } from '@shared/ui/components/Icon';
import styles from '../clock.module.css';

export function ToggleRow({ icon, title, meta, on, onChange }: { icon: GlyphName; title: string; meta?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={styles.toggle} onClick={() => onChange(!on)}>
      <Icon name={icon} size={24} />
      <span className={styles.toggleText}>
        <span className="t-body">{title}</span>
        {meta ? <span className="t-meta">{meta}</span> : null}
      </span>
      <SwitchMark checked={on} />
    </button>
  );
}
