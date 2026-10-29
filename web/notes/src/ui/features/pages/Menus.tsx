/**
 * The menus that open from the text being typed. « / » lists the blocks to add, filtered by what
 * follows it; « @ » finds a page, a note, a collection or a link to mention, or a date (« @demain »,
 * « @lundi 9h »); « [[ » finds a page to cite; « : » and a word offer the emojis it names. The arrows
 * move in them while the caret stays in the text, Entrée (or Tab) picks, Échap closes. A bookmark
 * or an embed asked for from « / » picks what it shows with a search field of its own.
 */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { GlyphName } from '@unlease/design/glyphs';
import { t, tx } from '@unlease/core/i18n';
import type { BlockTarget } from '@unlease/notes/models/blocks';
import { dateShown, dateSuggestions, dateWords, daysFrom } from '@unlease/core/services/dates';
import { deleteRich, insertRich, richFromPlain, richToPlain, type Run } from '@unlease/core/services/richText';

import { useMinute } from '../../../app/hooks/useMinute';
import { useLibraryStore } from '../../../app/store/library';
import { placeBlock } from '../../../app/store/pages';
import { selectLanguages, useSettingsStore } from '../../../app/store/settings';
import { Icon } from '../../components/Icon';
import { declineEmoji, focusBlock, richHandle, setMenu, setMenuKeys, useEditorStore, type MenuState } from './editorStore';
import { emojiCatalogueNow, emojiName, loadEmojiCatalogue, searchEmoji, type Emoji, type EmojiCatalogue } from './emojiSearch';
import { Floating } from './Floating';
import inline from './inline.module.css';
import { placeAtom } from './inlineRuns';
import { usePageContext } from './PageContext';
import styles from './pages.module.css';
import { caretRect } from './richDom';
import { findCommands, runCommand } from './slashCommands';
import { searchTargets, type TargetHit } from './targetSearch';

interface Row {
  readonly key: string;
  readonly section: string;
  readonly label: string;
  readonly detail: string;
  readonly icon: GlyphName;
  /** Drawn in the glyph's place: the emoji the row puts in. */
  readonly emoji?: string;
  readonly pick: () => void;
}

const SECTION_ICONS: Record<TargetHit['section'], GlyphName> = { Pages: 'page', Notes: 'note', Collections: 'collections', Liens: 'link' };
/** Shown through `t` where the list draws them. */
const DATES = tx('Dates');
const EMOJI = tx('Emoji');
/** How many emojis « : » offers at most. */
const EMOJI_COUNT = 8;

/**
 * The list a menu shows, sections and all, the active row lit and kept in view. Each row is one
 * line; `details` says whether every row says what it holds after its name, or only the active one
 * (the blocks, whose names say enough).
 */
function PickerList({ rows, active, onActive, empty, label, details = 'all' }: { rows: readonly Row[]; active: number; onActive: (index: number) => void; empty: string; label: string; details?: 'all' | 'active' }) {
  const list = useRef<HTMLDivElement>(null);
  // The list alone scrolls to the active row: `scrollIntoView` would scroll the page too, the panel not being placed yet.
  useLayoutEffect(() => {
    const node = list.current;
    const row = node?.querySelector<HTMLElement>('[data-active]');
    if (!node || !row) return;
    const box = node.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    if (rect.top < box.top) node.scrollTop -= box.top - rect.top;
    else if (rect.bottom > box.bottom) node.scrollTop += rect.bottom - box.bottom;
  }, [active]);
  if (rows.length === 0) return <p className={`${styles.menuEmpty} t-meta`}>{empty}</p>;
  return (
    <div ref={list} className={styles.menuList} role="listbox" aria-label={label}>
      {rows.map((row, index) => (
        <Fragment key={row.key}>
          {index === 0 || rows[index - 1]!.section !== row.section ? <div className={`${styles.menuSection} t-meta-strong`}>{t(row.section)}</div> : null}
          <button
            type="button"
            role="option"
            aria-selected={index === active}
            data-active={index === active || undefined}
            className={styles.menuRow}
            onPointerMove={() => onActive(index)}
            onClick={row.pick}
          >
            {row.emoji ? (
              <span className={styles.menuEmoji} aria-hidden="true">
                {row.emoji}
              </span>
            ) : (
              <span className={styles.menuIcon}>
                <Icon name={row.icon} size={20} />
              </span>
            )}
            <span className={styles.menuText}>
              <span className={`${styles.menuLabel} t-body`}>{row.label}</span>
              {row.detail && (details === 'all' || index === active) ? <span className={`${styles.menuDetail} t-meta`}>{row.detail}</span> : null}
            </span>
          </button>
        </Fragment>
      ))}
    </div>
  );
}

/** The arrows, Entrée, Tab and Échap for a list, from wherever the keys come from; `pickOn` picks as Entrée does (« : » closing an emoji's word). */
function useListKeys(rows: readonly Row[], close: () => void, register: boolean, pickOn?: string): [number, (index: number) => void, (key: string) => boolean] {
  const [active, setActive] = useState(0);
  const count = rows.length;
  // New results start at the top; the same results rebuilt (an autosave, a sync) keep the row chosen.
  const keys = rows.map(row => row.key).join('\n');
  const [shown, setShown] = useState(keys);
  if (shown !== keys) {
    setShown(keys);
    setActive(0);
  }
  const take = (key: string): boolean => {
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      if (count > 0) setActive(current => (current + (key === 'ArrowDown' ? 1 : -1) + count) % count);
      return true;
    }
    if (key === 'Enter' || key === 'Tab') {
      const row = rows[Math.min(active, count - 1)];
      if (!row) return key === 'Enter' ? false : true;
      row.pick();
      return true;
    }
    if (key === 'Escape') {
      close();
      return true;
    }
    return false;
  };
  const takeRef = useRef(take);
  useLayoutEffect(() => {
    takeRef.current = take;
  });
  useEffect(() => {
    if (!register) return;
    return setMenuKeys(event => {
      const taken = takeRef.current(event.key === pickOn ? 'Enter' : event.key);
      if (taken) event.preventDefault();
      return taken;
    });
  }, [register, pickOn]);
  return [active, setActive, take];
}

/** Closes the open menu on a press anywhere but in it. */
function useCloseOutside(panel: string): void {
  useEffect(() => {
    const onPress = (event: PointerEvent): void => {
      if ((event.target as Element | null)?.closest?.(`#${panel}`)) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', onPress, true);
    return () => document.removeEventListener('pointerdown', onPress, true);
  }, [panel]);
}

/** Where a menu opened: the caret at that moment (the menu stays there while the query grows). */
function useAnchor(menu: MenuState): DOMRect {
  const [anchor] = useState(() => {
    const element = richHandle(menu.block)?.element;
    return caretRect() ?? element?.getBoundingClientRect() ?? new DOMRect(16, 16, 0, 0);
  });
  return anchor;
}

function SlashPanel({ menu }: { menu: Extract<MenuState, { kind: 'slash' }> }) {
  const { page } = usePageContext();
  const anchor = useAnchor(menu);
  useCloseOutside('slash-menu');
  const rows = useMemo<Row[]>(
    () =>
      findCommands(menu.query).map(command => ({
        key: command.key,
        section: command.section,
        label: t(command.label),
        detail: t(command.hint),
        icon: command.icon,
        pick: () => {
          const handle = richHandle(menu.block);
          if (handle) runCommand(command, page, menu.block, handle, menu.start, menu.query);
        },
      })),
    [menu.query, menu.block, menu.start, page],
  );
  const [active, setActive] = useListKeys(rows, () => setMenu(null), true);
  return (
    <Floating anchor={anchor} label={t('Ajouter un bloc')} className={styles.menuPanel} id="slash-menu">
      <PickerList rows={rows} active={active} onActive={setActive} empty={t('Aucun bloc ne correspond.')} label={t('Blocs')} details="active" />
    </Floating>
  );
}

function hitRows(hits: readonly TargetHit[], pick: (target: BlockTarget) => void): Row[] {
  return hits.map(hit => ({ key: `${hit.target.type}:${hit.target.id}`, section: hit.section, label: hit.title, detail: hit.detail, icon: SECTION_ICONS[hit.section], pick: () => pick(hit.target) }));
}

/** « @ » (what to mention, and dates) or « [[ » (a page to cite): the chip picked takes the place of what was typed. */
function MentionPanel({ menu }: { menu: Extract<MenuState, { kind: 'mention' | 'cite' }> }) {
  const cite = menu.kind === 'cite';
  const panel = cite ? 'cite-menu' : 'mention-menu';
  const anchor = useAnchor(menu);
  useCloseOutside(panel);
  const { page } = usePageContext();
  const library = useLibraryStore(state => state);
  const now = useMinute();
  const rows = useMemo<Row[]>(() => {
    const put = (atom: Run): void => {
      setMenu(null);
      const handle = richHandle(menu.block);
      if (!handle) return;
      const runs = handle.runs();
      let end = menu.start + (cite ? 2 : 1) + menu.query.length;
      // « [[Voyage » goes with the « ]] » typed after the caret.
      if (cite && richToPlain(runs).startsWith(']]', end)) end += 2;
      const placed = placeAtom(runs, menu.start, end, atom);
      handle.write(placed.runs, { start: placed.caret });
    };
    // « [[Voyage]] » typed whole searches « Voyage ».
    const query = cite ? menu.query.replace(/\]+$/, '') : menu.query;
    const found = searchTargets(library, query, cite ? { sections: ['Pages'], perSection: 8 } : {}).filter(hit => !(hit.target.type === 'page' && hit.target.id === page));
    const targets = hitRows(found, target => put({ kind: 'mention', target }));
    if (cite) return targets;
    const dates = dateSuggestions(menu.query, now).map<Row>(run => ({
      key: `date:${run.date}:${run.time ?? ''}`,
      section: DATES,
      label: dateShown(run, now),
      // « Demain » says which day it is.
      detail: Math.abs(daysFrom(run.date, now)) <= 1 ? dateWords(run) : '',
      icon: 'calendar',
      pick: () => put(run),
    }));
    // Typed, a date comes first (« @dem » is tomorrow before a page named Démo); with nothing typed, the mentions do.
    return menu.query.trim() ? [...dates, ...targets] : [...targets, ...dates];
  }, [menu.query, menu.block, menu.start, cite, page, library, now]);
  const [active, setActive] = useListKeys(rows, () => setMenu(null), true);
  return (
    <Floating anchor={anchor} label={cite ? t('Citer une page') : t('Mentionner')} className={styles.menuPanel} id={panel}>
      <PickerList rows={rows} active={active} onActive={setActive} empty={t('Rien ne correspond.')} label={cite ? t('Pages') : t('Pages, notes, collections, liens et dates')} />
    </Floating>
  );
}

/** The emoji catalogue, fetched the first time « : » asks for it; null until it is here. */
function useEmojiCatalogue(): EmojiCatalogue | null {
  const [catalogue, setCatalogue] = useState(emojiCatalogueNow);
  useEffect(() => {
    if (catalogue) return;
    let live = true;
    loadEmojiCatalogue().then(
      loaded => live && setCatalogue(loaded),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [catalogue]);
  return catalogue;
}

/** « : » and a word: the emojis it names, in the languages Réglages ticks. None (or the catalogue on its way): no menu, and the keys stay the text's. */
function EmojiPanel({ menu }: { menu: Extract<MenuState, { kind: 'emoji' }> }) {
  const catalogue = useEmojiCatalogue();
  const languages = useSettingsStore(selectLanguages);
  const found = useMemo(() => (catalogue ? searchEmoji(catalogue, menu.query, languages, EMOJI_COUNT) : []), [catalogue, menu.query, languages]);
  if (found.length === 0) return null;
  return <EmojiList menu={menu} found={found} languages={languages} />;
}

function EmojiList({ menu, found, languages }: { menu: Extract<MenuState, { kind: 'emoji' }>; found: readonly Emoji[]; languages: Parameters<typeof emojiName>[1] }) {
  const anchor = useAnchor(menu);
  useCloseOutside('emoji-menu');
  const rows = found.map<Row>(emoji => ({
    key: emoji.emoji,
    section: EMOJI,
    label: emojiName(emoji, languages),
    detail: '',
    icon: 'smiley',
    emoji: emoji.emoji,
    pick: () => {
      setMenu(null);
      const handle = richHandle(menu.block);
      if (!handle) return;
      // « :soleil » becomes ☀️, as plain text.
      const runs = handle.runs();
      handle.write(insertRich(deleteRich(runs, menu.start, menu.start + 1 + menu.query.length), menu.start, richFromPlain(emoji.emoji)), { start: menu.start + emoji.emoji.length });
    },
  }));
  // Échap leaves the word as it is, and typing on after it opens nothing more; « : » closing the word picks.
  const [active, setActive] = useListKeys(
    rows,
    () => {
      declineEmoji(menu.block, menu.start);
      setMenu(null);
    },
    true,
    ':',
  );
  return (
    <Floating anchor={anchor} label={t('Emoji')} className={`${styles.menuPanel} ${inline.emojiMenu}`} id="emoji-menu">
      <PickerList rows={rows} active={active} onActive={setActive} empty="" label={t('Emoji pour « {query} »', { query: menu.query })} />
    </Floating>
  );
}

/** A bookmark or an embed asked for from « / »: what it shows is picked here, with a field of its own. */
function TargetPanel({ menu }: { menu: Extract<MenuState, { kind: 'target' }> }) {
  const { page } = usePageContext();
  const anchor = useAnchor(menu);
  useCloseOutside('target-menu');
  const [query, setQuery] = useState('');
  const rows = useMemo<Row[]>(() => {
    // An embed shows a note, a collection or a link whole; a page is better opened.
    const options = menu.display === 'embed' ? { sections: ['Notes', 'Collections', 'Liens', 'Pages'] as const } : {};
    const found = searchTargets(useLibraryStore.getState(), query, options).filter(hit => !(hit.target.type === 'page' && hit.target.id === page));
    return hitRows(found, target => {
      setMenu(null);
      placeBlock(page, menu.block, { kind: menu.display, target }, menu.replace);
      if (!menu.replace) focusBlock(menu.block, 'end');
    });
  }, [query, page, menu.block, menu.display, menu.replace]);
  const [active, setActive, take] = useListKeys(rows, () => {
    setMenu(null);
    focusBlock(menu.block, 'end');
  }, false);
  return (
    <Floating anchor={anchor} label={menu.display === 'bookmark' ? t('Ajouter un signet') : t('Intégrer')} className={styles.menuPanel} id="target-menu">
      <input
        className={styles.pickerField}
        value={query}
        autoFocus
        placeholder={menu.display === 'bookmark' ? t('Une page, une note, une collection ou un lien') : t('Une note, une collection ou un lien')}
        aria-label={t('Chercher')}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (take(event.key)) event.preventDefault();
        }}
      />
      <PickerList rows={rows} active={active} onActive={setActive} empty={t('Rien ne correspond.')} label={t('Résultats')} />
    </Floating>
  );
}

/** The open menu, if any. */
export function EditorMenus(): ReactNode {
  const menu = useEditorStore(s => s.menu);
  if (!menu) return null;
  const key = `${menu.kind}:${menu.block}:${'start' in menu ? menu.start : ''}`;
  switch (menu.kind) {
    case 'slash':
      return <SlashPanel key={key} menu={menu} />;
    case 'mention':
    case 'cite':
      return <MentionPanel key={key} menu={menu} />;
    case 'emoji':
      return <EmojiPanel key={key} menu={menu} />;
    case 'target':
      return <TargetPanel key={key} menu={menu} />;
  }
}
