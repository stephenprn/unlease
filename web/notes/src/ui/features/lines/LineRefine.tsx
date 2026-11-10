/**
 * A collection's order and filter (`notes/services/lineView`), over its links: two quiet buttons
 * at the list's end, each saying what is applied and opening the app's menu, the choice ticked (the
 * search's refine buttons, in the matcha wash while set apart from the default). A filter that
 * keeps nothing, and an order by price with fewer than two prices, wait in the second ink.
 *
 * Beside them, what the page says when Claude could read some of its links now (« Tout lire »),
 * and when its filter keeps nothing (« Tout afficher »).
 */
import { useRef, useState } from 'react';

import { t } from '@unlease/core/i18n';
import type { GlyphName } from '@unlease/design/glyphs';
import { emptyFilterSentence, LINE_FILTER_NAMES, LINE_FILTERS, LINE_SORT_NAMES, LINE_SORTS, type LineFilter, type LineView } from '@unlease/notes/services/lineView';

import { Button } from '@shared/ui/components/Button';
import controls from '@shared/ui/components/controls.module.css';
import { Icon } from '@shared/ui/components/Icon';
import { Menu, type MenuItem } from '@shared/ui/components/Menu';
import { OutlinedBox } from '@shared/ui/components/Outline';
import styles from './lines.module.css';

const tick = (chosen: boolean) => (chosen ? undefined : <span className={controls.menuBlank} aria-hidden="true" />);

function RefineButton({ icon, value, label, items, active }: { icon: GlyphName; value: string; label: string; items: readonly MenuItem[]; active: boolean }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} type="button" className={`${styles.refineButton} t-label`} aria-haspopup="menu" aria-expanded={open} aria-label={label} data-active={active || undefined} onClick={() => setOpen(true)}>
        <Icon name={icon} size={18} />
        <span className={styles.refineValue}>{value}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      <Menu open={open} anchor={anchor} onDismiss={() => setOpen(false)} items={items} label={label} chosen={items.findIndex(item => item.mark === undefined)} />
    </>
  );
}

export interface LineRefineProps {
  readonly view: LineView;
  readonly counts: Readonly<Record<LineFilter, number>>;
  /** How many links have a price. */
  readonly priced: number;
  readonly onChange: (view: LineView) => void;
}

export function LineRefine({ view, counts, priced, onChange }: LineRefineProps) {
  const filters: MenuItem[] = LINE_FILTERS.map(filter => ({
    label: `${LINE_FILTER_NAMES[filter]} · ${counts[filter]}`,
    icon: 'check',
    mark: tick(filter === view.filter),
    disabled: filter !== view.filter && counts[filter] === 0,
    onSelect: () => onChange({ ...view, filter }),
  }));
  const sorts: MenuItem[] = LINE_SORTS.map(sort => ({
    label: LINE_SORT_NAMES[sort],
    icon: 'check',
    mark: tick(sort === view.sort),
    // Two prices at least, or there is nothing to order by.
    disabled: sort !== view.sort && (sort === 'priceUp' || sort === 'priceDown') && priced < 2,
    onSelect: () => onChange({ ...view, sort }),
  }));
  return (
    <div className={styles.refine}>
      <RefineButton icon="eye" value={LINE_FILTER_NAMES[view.filter]} label={t('Liens affichés : {filter}', { filter: LINE_FILTER_NAMES[view.filter] })} items={filters} active={view.filter !== 'all'} />
      <RefineButton icon="sort" value={LINE_SORT_NAMES[view.sort]} label={t('Ordre : {order}', { order: LINE_SORT_NAMES[view.sort] })} items={sorts} active={view.sort !== 'own'} />
    </div>
  );
}

/** Links Claude could read now, here: what it would cost, and one press to send them all. */
export function ReadAllBanner({ text, action, onRead }: { text: string; action: string; onRead: () => void }) {
  return (
    <OutlinedBox kind="panel" edge={false} className={styles.readAll} role="status">
      <Icon name="sparkle" size={20} className={styles.readAllMark} />
      <span className={`${styles.readAllText} t-meta`}>{text}</span>
      <Button kind="tonal" small onClick={onRead}>
        {action}
      </Button>
    </OutlinedBox>
  );
}

/** The filter keeps none of the collection's links: what it looked for, and the way back to all. */
export function FilteredEmpty({ filter, collection, onClear }: { filter: LineFilter; collection: string; onClear: () => void }) {
  return (
    <OutlinedBox kind="panel" className={`${styles.empty} ${styles.filteredEmpty} t-body`}>
      <span>{emptyFilterSentence(filter, collection)}</span>
      <Button kind="text" small onClick={onClear}>
        {t('Tout afficher')}
      </Button>
    </OutlinedBox>
  );
}
