/**
 * An embedded collection as a table: a row per link to do (then, when the embed shows them, per link
 * done, under « Déjà faits »), its title first (with its picture), then the columns the person
 * keeps (`notes/services/collectionTable`). A column's head moves it or hides it; « Colonnes » lists
 * them all, to show one again or drag one to its place. Cells read the links as they are: the title
 * opens the link's details, the stamp at the row's end marks it done (or puts it back to do). No
 * column can be added, and a row is made only by adding a link to the collection.
 */
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';

import type { GlyphName } from '@unlease/design/glyphs';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';
import type { Block } from '@unlease/notes/models/blocks';
import { arrangeColumns, collectionColumns, linkCell, placeColumn, showColumn, type CollectionColumn } from '@unlease/notes/services/collectionTable';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { addedMessage } from '@unlease/notes/services/savedLinks';
import { extractUrls } from '@unlease/core/services/url';

import { useMinute } from '../../../app/hooks/useMinute';
import { useBlobUrl } from '../../../app/media/images';
import { addLinks } from '../../../app/store/actions';
import { useLibraryStore } from '../../../app/store/library';
import { setViewColumns } from '../../../app/store/pages';
import { selectCanRead, useSettingsStore } from '../../../app/store/settings';
import { addedTone, showError, showSnack } from '../../../app/store/ui';
import { openLink } from '../../commands';
import { Switch } from '../../components/Checkbox';
import controls from '../../components/controls.module.css';
import { Icon } from '../../components/Icon';
import { Menu, type MenuItem } from '../../components/Menu';
import { Popover } from '../../components/Popover';
import { stampWord } from '../../components/Stamp';
import { browserPath, isPlainClick, paths } from '../../router';
import { NARROW, useMedia } from '../../useMedia';
import { KIND_ICONS } from '../links/kindIcon';
import { toggleDone } from '../links/LinkRow';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';
import { useHiddenSides } from './TableBlock';

const TITLE_WIDTH = 280;
/** In a phone-sized window the title, kept in view, leaves room for the next column. */
const NARROW_TITLE_WIDTH = 190;
const WIDTHS: Readonly<Record<string, number>> = { site: 150, kind: 120, price: 110, summary: 320, comment: 240, added: 110, url: 200 };
const FACT_WIDTH = 160;
/** The row's end: its stamp. */
const END_WIDTH = 36;
const widthOf = (key: string): number => WIDTHS[key] ?? FACT_WIDTH;

const ICONS: Readonly<Record<string, GlyphName>> = { site: 'globe', kind: 'select', price: 'hash', summary: 'textAlign', comment: 'note', added: 'calendar', url: 'link' };
/** A fact Claude read: its spark. */
const iconOf = (key: string): GlyphName => ICONS[key] ?? 'sparkle';

/** The links' columns, in the order and with the choice this embed keeps. */
export function useCollectionColumns(block: Block, ids: readonly string[]): CollectionColumn[] {
  const links = useLibraryStore(useShallow(s => ids.flatMap(id => s.links[id] ?? [])));
  return useMemo(() => arrangeColumns(collectionColumns(links), block.viewColumns), [links, block.viewColumns]);
}

/** A column's head: its glyph and name; pressed, it moves left or right, or hides. */
function ColumnHead({ block, columns, column, index, count }: { block: Block; columns: readonly CollectionColumn[]; column: CollectionColumn; index: number; count: number }) {
  const { page, readOnly } = usePageContext();
  const [open, setOpen] = useState(false);
  const head = useRef<HTMLButtonElement>(null);
  const items: MenuItem[] = [];
  if (index > 0) items.push({ label: t('Déplacer à gauche'), icon: 'back', onSelect: () => setViewColumns(page, block.id, placeColumn(columns, block.viewColumns, column.key, index - 1)) });
  if (index < count - 1) items.push({ label: t('Déplacer à droite'), icon: 'arrowRight', onSelect: () => setViewColumns(page, block.id, placeColumn(columns, block.viewColumns, column.key, index + 1)) });
  items.push({ label: t('Masquer la colonne'), icon: 'eyeOff', onSelect: () => setViewColumns(page, block.id, showColumn(columns, block.viewColumns, column.key, false)) });
  return (
    <th className={styles.headCell} style={{ width: widthOf(column.key) }} scope="col">
      <button ref={head} type="button" className={styles.headButton} aria-haspopup="menu" aria-expanded={open} disabled={readOnly} onClick={() => setOpen(true)}>
        <Icon name={iconOf(column.key)} size={16} />
        <span className={styles.headName}>{column.name}</span>
      </button>
      <Menu open={open} anchor={head} onDismiss={() => setOpen(false)} items={items} label={t('Colonne {name}', { name: column.name })} align="start" />
    </th>
  );
}

const LinkTableRow = memo(function LinkTableRow({ id, index, columns, now }: { id: string; index: number; columns: readonly CollectionColumn[]; now: number }) {
  const { readOnly } = usePageContext();
  const link = useLibraryStore(s => s.links[id]);
  const kept = useBlobUrl(link?.imageIds[0]);
  const reading = useSettingsStore(selectCanRead);
  if (!link) return null;
  const { title } = linkRowText(link);
  const image = kept ?? link.imageUrl;
  return (
    <tr className={styles.tableRow} data-done={link.done || undefined}>
      <td className={styles.cell}>
        <a
          className={styles.linkTitle}
          href={browserPath(paths.link(id))}
          onClick={event => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            openLink(id);
          }}
        >
          <span className={styles.linkThumb} data-pebble={pebbleTurn(index)} data-still>
            {image ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} /> : <Icon name={KIND_ICONS[link.kind]} size={16} />}
          </span>
          <span className={styles.linkTitleText}>
            {/* A title made from the address, before any reading, says so in the second ink. */}
            <span className={styles.linkTitleName} data-address={link.title ? undefined : true}>
              {title}
            </span>
            {link.status === 'pending' && reading ? <span className="t-meta">{t('Lecture de la page…')}</span> : null}
          </span>
        </a>
        <a className={styles.cellOpen} href={link.url} target="_blank" rel="noopener noreferrer" aria-label={t('Ouvrir {title}', { title })} data-tip={t('Ouvrir le lien')}>
          <Icon name="external" size={14} />
        </a>
      </td>
      {columns.map(column => (
        <td key={column.key} className={styles.cell} data-column={column.key} data-number={column.key === 'price' && link.price !== null ? '' : undefined}>
          <span className={styles.linkCell}>{linkCell(link, column.key, now)}</span>
        </td>
      ))}
      <td className={styles.rowEnd}>
        {readOnly ? null : (
          <button
            type="button"
            className={styles.rowAction}
            aria-label={link.done ? t('Remettre « {title} » à faire', { title }) : t('Marquer « {title} » : {stamp}', { title, stamp: stampWord(link.kind).toLowerCase() })}
            data-tip={link.done ? t('Remettre à faire') : stampWord(link.kind)}
            onClick={() => toggleDone(id)}
          >
            <Icon name={link.done ? 'undo' : 'stamp'} size={16} />
          </button>
        )}
      </td>
    </tr>
  );
});

/** « Ajouter un lien »: an address typed or pasted goes into the collection, and comes up as its first row. */
function AddLink({ lineId, name }: { lineId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const close = (): void => {
    setUrl('');
    setOpen(false);
  };
  if (!open) {
    return (
      <button type="button" className={styles.addRow} onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} />
        {t('Ajouter un lien')}
      </button>
    );
  }
  return (
    <form
      className={styles.addLink}
      onSubmit={event => {
        event.preventDefault();
        const found = extractUrls(url);
        if (found.length === 0) {
          showError(t('Ce n’est pas un lien'));
          return;
        }
        const placed = addLinks(found, { noteId: lineId });
        const message = addedMessage(placed, { into: lineId }, useLibraryStore.getState().notes);
        if (message) showSnack(message, undefined, { tone: addedTone(placed) });
        setUrl('');
      }}
    >
      <Icon name="link" size={16} />
      <input
        className={styles.addLinkInput}
        value={url}
        autoFocus
        placeholder={t('Coller une adresse, puis Entrée')}
        aria-label={t('Ajouter un lien à {name}', { name })}
        inputMode="url"
        enterKeyHint="done"
        autoComplete="off"
        spellCheck={false}
        onChange={event => setUrl(event.target.value)}
        onKeyDown={event => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          close();
        }}
        onBlur={() => {
          if (!url.trim()) close();
        }}
      />
    </form>
  );
}

export function CollectionTable({ block, lineId, name, ids, done }: { block: Block; lineId: string; name: string; ids: readonly string[]; done: readonly string[] }) {
  const { readOnly } = usePageContext();
  const all = useMemo(() => [...ids, ...done], [ids, done]);
  const columns = useCollectionColumns(block, all);
  const shown = columns.filter(column => column.shown);
  const now = useMinute();
  const wrap = useRef<HTMLDivElement>(null);
  useHiddenSides(wrap);
  const titleWidth = useMedia(NARROW) ? NARROW_TITLE_WIDTH : TITLE_WIDTH;
  const width = shown.reduce((sum, column) => sum + widthOf(column.key), titleWidth + END_WIDTH);
  return (
    <>
      {all.length > 0 ? (
        <div ref={wrap} className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.linkTable}`} style={{ width }} aria-label={t('Liens de {name}', { name })}>
            <thead>
              <tr>
                <th className={styles.headCell} style={{ width: titleWidth }} scope="col">
                  <span className={styles.headLabel}>
                    <Icon name="text" size={16} />
                    <span className={styles.headName}>{t('Titre')}</span>
                  </span>
                </th>
                {shown.map((column, index) => (
                  <ColumnHead key={column.key} block={block} columns={columns} column={column} index={index} count={shown.length} />
                ))}
                <th className={styles.rowEnd} aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {ids.map((id, index) => (
                <LinkTableRow key={id} id={id} index={index} columns={shown} now={now} />
              ))}
            </tbody>
            {done.length > 0 ? (
              <tbody>
                <tr>
                  <th className={styles.doneHead} colSpan={shown.length + 2} scope="rowgroup">
                    <span className={`${styles.doneHeadLabel} t-section`}>{t('Déjà faits · {count}', { count: done.length })}</span>
                  </th>
                </tr>
                {done.map((id, index) => (
                  <LinkTableRow key={id} id={id} index={ids.length + index} columns={shown} now={now} />
                ))}
              </tbody>
            ) : null}
          </table>
        </div>
      ) : (
        <p className={`${styles.embedEmpty} t-meta`}>{t('Aucun lien à faire dans cette collection.')}</p>
      )}
      {readOnly ? null : <AddLink lineId={lineId} name={name} />}
    </>
  );
}

/** The shown columns, the title first and fixed; each of the others dragged by its grip (or moved with the arrow keys) and hidden by its switch. */
function ShownColumns({ columns, onPlace, onShow }: { columns: readonly CollectionColumn[]; onPlace: (key: string, index: number) => void; onShow: (key: string, shown: boolean) => void }) {
  const [drag, setDrag] = useState<{ readonly key: string; readonly index: number } | null>(null);
  const list = useRef<HTMLUListElement>(null);
  // Moved with the keyboard, the grip keeps the focus in its new place.
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const key = refocus.current;
    refocus.current = null;
    if (key) [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-grip]') ?? [])].find(grip => grip.dataset.grip === key)?.focus();
  }, [columns]);

  const dragged = drag ? columns.find(column => column.key === drag.key) : undefined;
  const order = dragged ? columns.filter(column => column !== dragged) : [...columns];
  if (dragged) order.splice(drag!.index, 0, dragged);

  const grab = (event: ReactPointerEvent<HTMLButtonElement>, key: string, from: number): void => {
    if (event.button !== 0 || !list.current) return;
    event.preventDefault();
    // Each row's middle as it stood: the place is how many of the others the pointer has passed.
    const middles = [...list.current.querySelectorAll<HTMLElement>('[data-grip]')].map(grip => {
      const box = grip.closest('li')!.getBoundingClientRect();
      return box.top + box.height / 2;
    });
    let index = from;
    setDrag({ key, index });
    const move = (moved: PointerEvent): void => {
      const next = middles.filter((middle, at) => at !== from && moved.clientY > middle).length;
      if (next === index) return;
      index = next;
      setDrag({ key, index });
    };
    const drop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', drop);
      window.removeEventListener('pointercancel', drop);
      setDrag(null);
      if (index !== from) onPlace(key, index);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', drop);
  };
  const step = (event: KeyboardEvent<HTMLButtonElement>, key: string, from: number): void => {
    const to = event.key === 'ArrowUp' ? from - 1 : event.key === 'ArrowDown' ? from + 1 : null;
    if (to === null) return;
    event.preventDefault();
    if (to < 0 || to >= columns.length) return;
    refocus.current = key;
    onPlace(key, to);
  };

  return (
    <ul ref={list} className={styles.viewList} aria-label={t('Colonnes affichées')}>
      <li className={styles.viewRow}>
        <span className={styles.viewGripSpace} />
        <Icon name="text" size={16} />
        <span className={styles.viewName}>{t('Titre')}</span>
        <span className="t-meta">{t('Toujours')}</span>
      </li>
      {order.map((column, index) => (
        <li key={column.key} className={styles.viewRow} data-dragging={drag?.key === column.key || undefined}>
          <button
            type="button"
            className={styles.viewGrip}
            data-grip={column.key}
            aria-label={t('Déplacer {name}', { name: column.name })}
            aria-keyshortcuts="ArrowUp ArrowDown"
            onPointerDown={event => grab(event, column.key, index)}
            onKeyDown={event => step(event, column.key, index)}
          >
            <Icon name="grip" size={16} />
          </button>
          <Icon name={iconOf(column.key)} size={16} />
          <span className={styles.viewName}>{column.name}</span>
          <Switch checked label={t('Afficher {name}', { name: column.name })} onChange={() => onShow(column.key, false)} />
        </li>
      ))}
    </ul>
  );
}

/** « Colonnes »: the columns shown, in order, then those hidden, each with its switch. */
export function ColumnsButton({ block, ids }: { block: Block; ids: readonly string[] }) {
  const { page } = usePageContext();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const columns = useCollectionColumns(block, ids);
  const shown = columns.filter(column => column.shown);
  const hidden = columns.filter(column => !column.shown);
  const show = (key: string, on: boolean): void => setViewColumns(page, block.id, showColumn(columns, block.viewColumns, key, on));
  return (
    <>
      <button ref={button} type="button" className={`${controls.button} ${controls.text} ${controls.small} ${styles.columnsButton}`} aria-label={t('Colonnes')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <Icon name="columns" size={18} />
        <span className={styles.columnsWord}>{t('Colonnes')}</span>
      </button>
      <Popover open={open} anchor={button} onDismiss={() => setOpen(false)} label={t('Colonnes du tableau')} width={320} align="end">
        <div className={styles.viewPanel}>
          <h2 className={`${styles.viewHeading} t-meta-strong`}>{t('Dans le tableau')}</h2>
          <ShownColumns columns={shown} onPlace={(key, index) => setViewColumns(page, block.id, placeColumn(columns, block.viewColumns, key, index))} onShow={show} />
          {hidden.length > 0 ? (
            <>
              <h2 className={`${styles.viewHeading} t-meta-strong`}>{t('Masquées')}</h2>
              <ul className={styles.viewList} aria-label={t('Colonnes masquées')}>
                {hidden.map(column => (
                  <li key={column.key} className={styles.viewRow}>
                    <span className={styles.viewGripSpace} />
                    <Icon name={iconOf(column.key)} size={16} />
                    <span className={styles.viewName}>{column.name}</span>
                    <Switch checked={false} label={t('Afficher {name}', { name: column.name })} onChange={() => show(column.key, true)} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </Popover>
    </>
  );
}
