/**
 * A page's or a callout's icon: an emoji, found by its name (in French or in English, as Réglages
 * says), picked from the everyday ones or from the whole catalogue by group, or pasted in (any
 * emoji the system draws). A page can also go without.
 */
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';

import { selectLanguages, useSettingsStore, type Language } from '../../../app/store/settings';
import { Icon } from '../../components/Icon';
import { Popover } from '../../components/Popover';
import { useMedia } from '../../useMedia';
import { EVERYDAY_EMOJI, loadEmojiCatalogue, searchEmoji, typedEmoji, type Emoji, type EmojiCatalogue } from './emojiSearch';
import styles from './pages.module.css';

/** A fine pointer: the field takes the focus as the picker opens (a finger would get a keyboard over it). */
export const FINE = '(pointer: fine)';

export interface EmojiButtonProps {
  readonly value: string | null;
  /** What the button shows instead of the emoji (« Ajouter une icône »). */
  readonly children?: ReactNode;
  readonly label: string;
  readonly onChange: (icon: string | null) => void;
  readonly disabled?: boolean;
  readonly allowNone?: boolean;
  readonly className?: string;
}

function EmojiChoice({ emoji, name, current, turn, onPick }: { emoji: string; name: string; current: boolean; turn: number; onPick: (emoji: string) => void }) {
  return (
    <button type="button" className={styles.emojiChoice} data-pebble-under={pebbleTurn(turn)} aria-label={name} data-tip={name} aria-pressed={current} onClick={() => onPick(emoji)}>
      {emoji}
    </button>
  );
}

/** The name an emoji goes by in the first language chosen (French, unless only English is). */
const nameIn = (emoji: Emoji, languages: readonly Language[]): string => emoji.name[languages[0] ?? 'fr'] || emoji.name.fr;

/** The picker's content: its search, the emojis, and « Retirer l’icône » when `allowNone`. */
export function EmojiPanel({ value, allowNone, field, scroll, onPick }: { value: string | null; allowNone: boolean; field: RefObject<HTMLInputElement | null>; scroll: RefObject<HTMLDivElement | null>; onPick: (icon: string | null) => void }) {
  const languages = useSettingsStore(selectLanguages);
  const [query, setQuery] = useState('');
  const [catalogue, setCatalogue] = useState<EmojiCatalogue | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadEmojiCatalogue().then(
      loaded => live && setCatalogue(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  const byEmoji = useMemo(() => new Map(catalogue?.emojis.map(emoji => [emoji.emoji, emoji]) ?? []), [catalogue]);
  const pasted = typedEmoji(query);
  const searching = query.trim().length > 0 && !pasted;
  const results = useMemo(() => (catalogue && searching ? searchEmoji(catalogue, query, languages) : []), [catalogue, searching, query, languages]);
  const name = (emoji: string): string => {
    const known = byEmoji.get(emoji);
    return known ? nameIn(known, languages) : emoji;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = pasted ?? results[0]?.emoji;
    if (first) onPick(first);
  };

  return (
    <div className={styles.emojiPanel}>
      <label className={styles.emojiSearch}>
        <Icon name="search" size={18} />
        <input
          ref={field}
          type="search"
          className={styles.emojiField}
          value={query}
          placeholder={languages.length > 1 ? t('Chercher : soleil, sun…') : languages[0] === 'en' ? t('Chercher : sun, heart…') : t('Chercher : soleil, cœur…')}
          aria-label={t('Chercher un emoji par son nom, ou en coller un')}
          autoComplete="off"
          spellCheck={false}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </label>
      <div ref={scroll} className={styles.emojiScroll} tabIndex={-1}>
        {pasted ? (
          <div className={styles.emojiGrid}>
            <EmojiChoice emoji={pasted} name={name(pasted)} current={pasted === value} turn={0} onPick={onPick} />
          </div>
        ) : searching ? (
          results.length > 0 ? (
            <div className={styles.emojiGrid} role="group" aria-label={t('Emoji pour « {query} »', { query: query.trim() })}>
              {results.map((emoji, index) => (
                <EmojiChoice key={emoji.emoji} emoji={emoji.emoji} name={nameIn(emoji, languages)} current={emoji.emoji === value} turn={index} onPick={onPick} />
              ))}
            </div>
          ) : (
            <p className={`${styles.emojiNothing} t-meta`}>
              {catalogue ? t('Aucun emoji pour « {query} ».', { query: query.trim() }) : failed ? t('La liste des emoji n’a pas pu se charger. Collez-en un, ou réessayez en ligne.') : t('Chargement…')}
            </p>
          )
        ) : (
          <>
            <section className={styles.emojiGroup} aria-label={t('Courants')}>
              <h3 className={`${styles.emojiGroupName} t-label-small`}>{t('Courants')}</h3>
              <div className={styles.emojiGrid}>
                {EVERYDAY_EMOJI.map((emoji, index) => (
                  <EmojiChoice key={emoji} emoji={emoji} name={name(emoji)} current={emoji === value} turn={index} onPick={onPick} />
                ))}
              </div>
            </section>
            {catalogue?.groups.map((group, groupIndex) => {
              const title = languages[0] === 'en' ? group.en : group.fr;
              return (
                <section key={group.key} className={styles.emojiGroup} aria-label={title}>
                  <h3 className={`${styles.emojiGroupName} t-label-small`}>{title}</h3>
                  <div className={styles.emojiGrid}>
                    {catalogue.emojis
                      .filter(emoji => emoji.group === groupIndex)
                      .map((emoji, index) => (
                        <EmojiChoice key={emoji.emoji} emoji={emoji.emoji} name={nameIn(emoji, languages)} current={emoji.emoji === value} turn={index} onPick={onPick} />
                      ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
      {allowNone && value ? (
        <button type="button" className={styles.emojiNone} onClick={() => onPick(null)}>
          {t('Retirer l’icône')}
        </button>
      ) : null}
    </div>
  );
}

function EmojiButtonComponent({ value, children, label, onChange, disabled, allowNone = true, className }: EmojiButtonProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const fine = useMedia(FINE);
  const pick = (icon: string | null): void => {
    setOpen(false);
    onChange(icon);
  };
  return (
    <>
      <button ref={button} type="button" className={[children ? '' : styles.emojiButton, className ?? ''].join(' ')} aria-label={label} aria-haspopup="dialog" aria-expanded={open} data-tip={disabled ? undefined : label} disabled={disabled} onClick={() => setOpen(true)}>
        {children ?? <span className={styles.emoji}>{value}</span>}
      </button>
      <Popover open={open} anchor={button} onDismiss={() => setOpen(false)} label={label} width={348} align="start" initialFocus={fine ? field : scroll}>
        <EmojiPanel value={value} allowNone={allowNone} field={field} scroll={scroll} onPick={pick} />
      </Popover>
    </>
  );
}

export const EmojiButton = memo(EmojiButtonComponent);
