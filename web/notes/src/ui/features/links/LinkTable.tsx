/**
 * A collection as a table (`LineLayout` `table`, the phone's `LinkTableView`): a line per link on
 * one sheet of paper, its picture small and its title held at the left while the rest scrolls
 * sideways under them (a hairline at that edge, where the columns slide under); then where it comes
 * from, its price, a column for each fact most of its links carry (`lineColumns`), the owner's note
 * when one carries any, and the day it was saved. The price and the day order the table from
 * their heads (the collection's own order, by price either way, the newest first: the order's
 * button says the same). The links done follow under « Déjà faits », faded as their rows are.
 *
 * A line opens the link's panel; its title is the link itself (a new tab, the keyboard). The stamp
 * and the page sit at its end under a pointer or the keyboard, as on a row.
 */
import { memo, useMemo, useState, type MouseEvent, type ReactNode, type Ref, type UIEvent } from 'react';

import { t } from '@unlease/core/i18n';
import { formatDay } from '@unlease/core/services/format';
import { columnValue, lineColumns, type LineColumn } from '@unlease/notes/services/lineTable';
import { linkRowText, noteLine } from '@unlease/notes/services/linkRow';
import type { LineSort } from '@unlease/notes/services/lineView';
import { priceChangeText } from '@unlease/notes/services/priceWatch';
import type { LinkItem } from '@unlease/notes/models/entities';
import { useShallow } from 'zustand/react/shallow';

import { useBlobUrl } from '@shared/app/media/images';
import { reanalyzeLink } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { useCanRead } from '../../../app/store/prefs';
import { useServerFeature } from '@shared/app/store/serverSettings';
import controls from '@shared/ui/components/controls.module.css';
import { Icon } from '@shared/ui/components/Icon';
import { IconButton, pebbleUnder } from '@shared/ui/components/IconButton';
import { OutlinedBox } from '@shared/ui/components/Outline';
import { browserPath, isPlainClick } from '@shared/ui/router';
import { stampWord } from '../../components/Stamp';
import { paths } from '../../routes';
import { KIND_ICONS } from './kindIcon';
import { toggleDone } from './LinkRow';
import { ReadingTrack } from './ReadingTrack';
import styles from './linkViews.module.css';

interface Columns {
  readonly facts: readonly LineColumn[];
  /** Whether any link carries a note: its column only then. */
  readonly notes: boolean;
}

/** A press on the line, but on its buttons and links, opens the link's panel. */
const onLine = (event: MouseEvent, open: () => void): void => {
  if ((event.target as Element).closest('a, button')) return;
  open();
};

const LinkLine = memo(function LinkLine({ id, now, columns, onOpen }: { id: string; now: number; columns: Columns; onOpen: (id: string) => void }) {
  const link = useLibraryStore(s => s.links[id]);
  const reading = useCanRead();
  const claude = useServerFeature('claude');
  const kept = useBlobUrl(link?.imageIds[0]);
  const [lost, setLost] = useState<string | null>(null);
  if (!link) return null;

  const pending = link.status === 'pending' && reading;
  const failed = link.status === 'failed';
  const unread = link.status === 'skipped' || (link.status === 'pending' && !reading);
  const { source, title, price, priceChange } = linkRowText(link);
  const wanted = kept ?? link.imageUrl;
  const image = wanted && wanted !== lost ? wanted : null;
  const note = noteLine(link.comment);

  return (
    <tr className={styles.line} data-done={link.done || undefined} data-flip={id} onClick={event => onLine(event, () => onOpen(id))}>
      <th scope="row" className={styles.lead}>
        <span className={styles.leadInner}>
          <span className={styles.thumb} data-picture={image ? true : undefined}>
            {image ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setLost(image)} /> : <Icon name={KIND_ICONS[link.kind]} size={18} />}
          </span>
          {failed ? <Icon name="alert" size={16} className={styles.lineAlert} /> : null}
          <a
            className={`${styles.lineTitle} t-body-strong`}
            href={browserPath(paths.link(id))}
            data-address={link.title ? undefined : true}
            title={title}
            onClick={event => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              onOpen(id);
            }}
          >
            {title}
          </a>
        </span>
      </th>
      <td className={`${styles.cell} t-meta`}>
        {pending ? (
          <span className={styles.cellReading}>
            <ReadingTrack width={48} />
            <span className="sr-only">{t('Lecture de la page…')}</span>
          </span>
        ) : failed ? (
          <span className={styles.cellFailed}>{link.error ? t(link.error) : t('Lecture impossible')}</span>
        ) : (
          source
        )}
      </td>
      <td className={`${styles.cell} ${styles.numeric} t-price`}>
        {price && !pending ? (
          <span className={styles.priceCell}>
            {priceChange ? (
              <span className={styles.priceChange} data-direction={priceChange.direction} title={priceChangeText(link, now)?.text}>
                <Icon name={priceChange.direction === 'down' ? 'arrowDown' : 'arrowUp'} size={14} />
                {priceChange.amount}
              </span>
            ) : null}
            {price}
          </span>
        ) : null}
      </td>
      {columns.facts.map(column => (
        <td key={column.key} className={`${styles.cell} ${styles.fact} t-meta`}>
          {columnValue(link, column)}
        </td>
      ))}
      {columns.notes ? <td className={`${styles.cell} ${styles.noteCell} t-meta`}>{note}</td> : null}
      <td className={`${styles.cell} ${styles.numeric} t-meta`}>{formatDay(link.createdAt, now)}</td>
      <td className={styles.lineEnd}>
        <span className={styles.lineActions}>
          {failed || (unread && claude) ? (
            claude ? <IconButton compact icon="refresh" label={failed ? t('Relire la page') : t('Lire {title}', { title })} onClick={() => reanalyzeLink(id)} /> : null
          ) : null}
          {!pending ? (
            <IconButton
              compact
              className={styles.stampAction}
              icon={link.done ? 'undo' : 'stamp'}
              label={link.done ? t('Remettre à faire') : t('Marquer : {stamp}', { stamp: stampWord(link.kind).toLowerCase() })}
              pressed={link.done}
              onClick={() => toggleDone(id)}
            />
          ) : null}
          <a className={`${controls.iconButton} ${controls.compact}`} {...pebbleUnder(1)} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={t('Ouvrir le lien')} data-tip={t('Ouvrir le lien')}>
            <Icon name="external" size={20} />
          </a>
        </span>
      </td>
    </tr>
  );
});

/** A head that orders the table: pressed, it goes to its first order, then its second, then back to the collection's. */
function SortHead({ label, orders, sort, disabled, onSort, numeric }: { label: string; orders: readonly LineSort[]; sort: LineSort; disabled: boolean; onSort: (sort: LineSort) => void; numeric?: boolean }) {
  const at = orders.indexOf(sort);
  const direction = sort === 'priceUp' ? 'ascending' : sort === 'priceDown' || sort === 'added' ? 'descending' : 'none';
  const next = at === -1 ? orders[0]! : (orders[at + 1] ?? 'own');
  return (
    <th scope="col" className={`${styles.headCell} ${numeric ? styles.numeric : ''}`} aria-sort={at === -1 ? undefined : direction}>
      {disabled ? (
        <span className="t-meta-strong">{label}</span>
      ) : (
        <button type="button" className={`${styles.headButton} t-meta-strong`} data-active={at !== -1 || undefined} onClick={() => onSort(next)}>
          {label}
          {at === -1 ? null : <Icon name={direction === 'ascending' ? 'arrowUp' : 'arrowDown'} size={14} />}
        </button>
      )}
    </th>
  );
}

export interface LinkTableProps {
  readonly open: readonly string[];
  readonly done: readonly string[];
  readonly now: number;
  readonly sort: LineSort;
  /** How many links carry a price: ordering by it means something from two. */
  readonly priced: number;
  readonly label: string;
  readonly onSort: (sort: LineSort) => void;
  readonly onOpen: (id: string) => void;
  /** The table, for the lines' filing motion. */
  readonly tableRef?: Ref<HTMLTableElement>;
}

export function LinkTable({ open, done, now, sort, priced, label, onSort, onOpen, tableRef }: LinkTableProps) {
  const factKey = useLibraryStore(
    useShallow(s => {
      const links = [...open, ...done].flatMap(id => (s.links[id] ? [s.links[id]!] : []));
      const facts = lineColumns(links);
      return { facts: JSON.stringify(facts), notes: links.some((link: LinkItem) => noteLine(link.comment) !== '') };
    }),
  );
  const columns: Columns = useMemo(() => ({ facts: JSON.parse(factKey.facts) as LineColumn[], notes: factKey.notes }), [factKey.facts, factKey.notes]);
  const span = 5 + columns.facts.length + (columns.notes ? 1 : 0);
  // Scrolled sideways, the columns slide under the titles: a hairline there, only then.
  const [under, setUnder] = useState(false);
  const lines = (ids: readonly string[]): ReactNode[] => ids.map(id => <LinkLine key={id} id={id} now={now} columns={columns} onOpen={onOpen} />);

  return (
    <OutlinedBox kind="panel" className={styles.tableSheet}>
      <div className={styles.tableScroll} tabIndex={-1} data-under={under || undefined} onScroll={(event: UIEvent<HTMLDivElement>) => setUnder(event.currentTarget.scrollLeft > 0)}>
        <table ref={tableRef} className={styles.table} aria-label={label}>
          <thead>
            <tr>
              <th scope="col" className={`${styles.headCell} ${styles.lead}`}>
                <span className="t-meta-strong">{t('Lien')}</span>
              </th>
              <th scope="col" className={styles.headCell}>
                <span className="t-meta-strong">{t('Site')}</span>
              </th>
              <SortHead label={t('Prix')} orders={['priceUp', 'priceDown']} sort={sort} disabled={priced < 2} onSort={onSort} numeric />
              {columns.facts.map(column => (
                <th key={column.key} scope="col" className={styles.headCell}>
                  <span className="t-meta-strong">{column.label}</span>
                </th>
              ))}
              {columns.notes ? (
                <th scope="col" className={styles.headCell}>
                  <span className="t-meta-strong">{t('Votre note')}</span>
                </th>
              ) : null}
              <SortHead label={t('Ajouté')} orders={['added']} sort={sort} disabled={false} onSort={onSort} numeric />
              <th scope="col" className={styles.lineEnd}>
                <span className="sr-only">{t('Actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>{lines(open)}</tbody>
          {done.length > 0 ? (
            <tbody>
              <tr className={styles.groupLine} data-flip="done-heading">
                <th scope="rowgroup" colSpan={span} className={styles.groupCell}>
                  <span className={`${styles.groupLabel} t-section`}>{t('Déjà faits · {count}', { count: done.length })}</span>
                </th>
              </tr>
              {lines(done)}
            </tbody>
          ) : null}
        </table>
      </div>
    </OutlinedBox>
  );
}
