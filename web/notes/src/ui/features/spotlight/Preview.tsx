/**
 * The chosen result itself, beside the list on a wide screen: a note on its own colour, a page's
 * blocks, a collection's sentence and latest links, a link as Claude read it; every match marked,
 * scrolled to where the query matched best. With nothing to show, it teaches what the field reads.
 */
import { Fragment, memo, useLayoutEffect, useRef } from 'react';

import { APP_NAME } from '@unlease/notes/brand';
import type { GlyphName } from '@unlease/design/glyphs';
import { t } from '@unlease/core/i18n';
import type { BlockKind } from '@unlease/notes/models/blocks';
import { isLineColor, isNoteGradient } from '@unlease/design/colors';
import { shownHint } from '@unlease/notes/models/entities';
import { formatRelative, plural } from '@unlease/core/services/format';
import { highlight, type Matcher, type SearchDoc, type SearchPart } from '@unlease/core/services/searchIndex';
import { linkTitle, type SpotMeta } from '@unlease/notes/services/spotlight';
import { noteDrawingRatio } from '@unlease/notes/services/drawing';
import { bodyText, lineStarts, linesText, noteLines, type NoteLine } from '@unlease/notes/services/noteBody';
import { richToPlain } from '@unlease/core/services/richText';

import { useLibraryStore } from '../../../app/store/library';
import { Highlight } from '../../components/Highlight';
import { Icon } from '../../components/Icon';
import { modKey } from '../../dom';
import board from '../board/board.module.css';
import { DrawingFit } from '../note/DrawingFit';
import { LineRuns } from '../note/NoteLines';
import { DocMark, docFacts, shownDocTitle } from './docs';
import styles from './spotlight.module.css';

function Marked({ text, matcher }: { text: string; matcher: Matcher }) {
  return <Highlight text={text} ranges={highlight(text, matcher)} />;
}

const FILE_ICONS: Partial<Record<BlockKind, GlyphName>> = { image: 'image', video: 'video', pdf: 'pdf', file: 'file', bookmark: 'bookmark', embed: 'embed' };

/** A drawing in the preview stops at this height (its top shows). */
const DRAWING_MAX = 420;

const blank = (line: NoteLine): boolean => !richToPlain(line.runs).trim();

/** Lines without the blank ones at either end. */
function trimLines(lines: readonly NoteLine[]): NoteLine[] {
  let first = 0;
  let last = lines.length;
  while (first < last && blank(lines[first]!)) first += 1;
  while (last > first && blank(lines[last - 1]!)) last -= 1;
  return lines.slice(first, last);
}

/** A formatted note as written: its headings as a page's, the lines of text between them in paragraphs, matches marked. */
function FormattedBody({ lines, matcher }: { lines: readonly NoteLine[]; matcher: Matcher }) {
  const ranges = highlight(linesText(lines), matcher);
  const starts = lineStarts(lines);
  const groups: { readonly first: number; last: number }[] = [];
  lines.forEach((line, index) => {
    const open = groups[groups.length - 1];
    if (line.heading === 0 && open && lines[open.first]!.heading === 0) open.last = index;
    else groups.push({ first: index, last: index });
  });
  return (
    <>
      {groups.map(({ first, last }) => {
        const heading = lines[first]!.heading;
        if (heading > 0) {
          return (
            <p key={first} className={styles.blockHeading} data-level={`h${heading}`}>
              <LineRuns runs={lines[first]!.runs} from={starts[first]} ranges={ranges} />
            </p>
          );
        }
        return (
          <p key={first} className={`${styles.noteBody} t-body`}>
            {lines.slice(first, last + 1).map((line, at) => (
              <Fragment key={at}>
                {at > 0 ? '\n' : null}
                <LineRuns runs={line.runs} from={starts[first + at]} ranges={ranges} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

function NotePreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  const note = useLibraryStore(s => s.notes[doc.meta.id]);
  const ids = useLibraryStore(s => s.checksByNote[doc.meta.id]);
  const checks = useLibraryStore(s => s.checks);
  if (!note) return null;
  const items = (ids ?? []).map(id => checks[id]).filter(item => item && item.deletedAt === null && item.text.trim());
  // Untitled, its first line already stands as the title above.
  const text = bodyText(note).trim();
  const body = note.title.trim() ? text : text.split('\n').slice(1).join('\n').trim();
  const written = note.kind === 'text' && note.rich ? trimLines(noteLines(note.body, true)) : null;
  const formatted = written && !note.title.trim() ? trimLines(written.slice(1)) : written;
  const drawing = noteDrawingRatio(note);
  return (
    <div className={styles.noteSheet} data-outline="card" data-edge data-line={isLineColor(note.color) ? note.color : undefined} data-gradient={isNoteGradient(note.color) ? note.color : undefined}>
      {drawing !== null ? <DrawingFit data={note.drawing} ratio={drawing} max={DRAWING_MAX} /> : null}
      {formatted ? (
        formatted.length > 0 ? <FormattedBody lines={formatted} matcher={matcher} /> : null
      ) : body ? (
        <p className={`${styles.noteBody} t-body`}>
          <Marked text={body} matcher={matcher} />
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className={styles.checks}>
          {items.map(item => (
            <li key={item!.id} className="t-body" data-ref={item!.id} data-checked={item!.checked || undefined} data-indent={item!.indent > 0 || undefined}>
              <Icon name={item!.checked ? 'boxChecked' : 'box'} size={20} />
              <span>
                <Marked text={item!.text} matcher={matcher} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {!body && items.length === 0 && drawing === null ? <p className={`${styles.quiet} t-meta`}>{t('Note vide')}</p> : null}
    </div>
  );
}

function PagePart({ part, matcher }: { part: SearchPart; matcher: Matcher }) {
  const block = useLibraryStore(s => (part.ref ? s.blocks[part.ref] : undefined));
  const kind = block?.kind ?? 'text';
  const text = <Marked text={part.text} matcher={matcher} />;
  const ref = part.ref ?? undefined;
  if (kind === 'h1' || kind === 'h2' || kind === 'h3' || kind === 'h4') {
    return (
      <p className={styles.blockHeading} data-ref={ref} data-level={kind}>
        {text}
      </p>
    );
  }
  if (kind === 'todo') {
    return (
      <p className={`${styles.blockTodo} t-body`} data-ref={ref} data-checked={block?.checked || undefined}>
        <Icon name={block?.checked ? 'boxChecked' : 'box'} size={20} />
        <span>{text}</span>
      </p>
    );
  }
  if (kind === 'code') {
    return (
      <pre className={styles.blockCode} data-ref={ref} data-outline="frame">
        {text}
      </pre>
    );
  }
  const icon = FILE_ICONS[kind];
  if (icon) {
    return (
      <p className={`${styles.blockFile} t-meta`} data-ref={ref}>
        <Icon name={icon} size={18} />
        <span>{text}</span>
      </p>
    );
  }
  const shape = kind === 'bullet' || kind === 'numbered' || kind === 'toggle' ? styles.blockItem : kind === 'callout' ? styles.blockCallout : kind === 'table' ? styles.blockTable : styles.blockText;
  return (
    <p className={`${shape} t-body`} data-ref={ref} data-line={kind === 'callout' ? (block?.color ?? 'grey') : undefined}>
      {text}
    </p>
  );
}

function PagePreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  if (doc.parts.length === 0) return <p className={`${styles.quiet} t-meta`}>{t('Page vide')}</p>;
  return (
    <div className={styles.pageBody}>
      {doc.parts.slice(0, 300).map((part, at) => (
        <PagePart key={part.ref ?? at} part={part} matcher={matcher} />
      ))}
    </div>
  );
}

function CollectionPreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  const note = useLibraryStore(s => s.notes[doc.meta.id]);
  const ids = useLibraryStore(s => s.linksByNote[doc.meta.id]);
  const links = useLibraryStore(s => s.links);
  if (!note) return null;
  const live = (ids ?? []).map(id => links[id]).filter(link => link && link.deletedAt === null);
  const done = live.filter(link => link!.done).length;
  const hint = shownHint(note).trim();
  return (
    <>
      {hint ? (
        <p className={`${styles.hint} t-body`}>
          <Marked text={hint} matcher={matcher} />
        </p>
      ) : null}
      <p className={`${styles.quiet} t-meta`}>{done > 0 ? t('{links}, dont {done}', { links: plural(live.length, t('lien'), t('liens')), done: plural(done, t('fait'), t('faits')) }) : plural(live.length, t('lien'), t('liens'))}</p>
      {live.length > 0 ? (
        <ul className={styles.linkList}>
          {live.slice(0, 8).map(link => (
            <li key={link!.id} className="t-body" data-done={link!.done || undefined}>
              <Icon name="link" size={16} />
              <span>
                <Marked text={linkTitle(link!)} matcher={matcher} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function LinkPreview({ doc, matcher }: { doc: SearchDoc<SpotMeta>; matcher: Matcher }) {
  const link = useLibraryStore(s => s.links[doc.meta.id]);
  if (!link) return null;
  return (
    <div className={styles.linkBody}>
      {link.summary ? (
        <p className={`${styles.summary} t-body`}>
          <Marked text={link.summary} matcher={matcher} />
        </p>
      ) : null}
      {link.attributes.length > 0 ? (
        <dl className={styles.facts}>
          {link.attributes.map((fact, at) => (
            <div key={`${fact.label}:${at}`}>
              <dt className="t-meta">{fact.label}</dt>
              <dd className="t-meta">
                <Marked text={fact.value} matcher={matcher} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {link.comment ? (
        <p className={`${styles.comment} t-body`}>
          <span className={`${styles.commentLabel} t-meta`}>{t('Votre commentaire')}</span>
          <Marked text={link.comment} matcher={matcher} />
        </p>
      ) : null}
      <p className={`${styles.address} t-meta`}>
        <Marked text={link.url} matcher={matcher} />
      </p>
    </div>
  );
}

/** What the field reads, for a spotlight with nothing chosen yet. */
function Tips() {
  const tips: readonly (readonly [string, string])[] = [
    [t('"mots exacts"'), t('Ces mots, dans cet ordre')],
    [t('-mot'), t('Sans ce mot')],
    [t('#label'), t('Les notes qui portent ce label')],
    ['Tab', t('Pages, notes, collections ou liens seulement')],
    [`${modKey()} ↵`, t('Ouvrir dans un nouvel onglet')],
  ];
  return (
    <div className={styles.tips}>
      <h2 className={`${styles.tipsTitle} t-section`}>{t('Chercher dans tout {app}', { app: APP_NAME })}</h2>
      <p className={`${styles.tipsLead} t-body`}>{t('Les titres d’abord, puis le contenu. Les accents, les débuts de mots et les fautes de frappe sont compris.')}</p>
      <dl className={styles.tipList}>
        {tips.map(([key, what]) => (
          <div key={key}>
            <dt>
              <kbd className={board.kbd}>{key}</kbd>
            </dt>
            <dd className="t-body">{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Where the preview opens: the part that matched best, else the first mark, else the top. */
function scrollToMatch(scroller: HTMLElement, part: SearchPart | null): void {
  const target = (part?.ref ? scroller.querySelector<HTMLElement>(`[data-ref="${CSS.escape(part.ref)}"]`) : null) ?? scroller.querySelector<HTMLElement>('mark');
  if (!target) {
    scroller.scrollTop = 0;
    return;
  }
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
  scroller.scrollTop = top > scroller.clientHeight * 0.6 ? top - scroller.clientHeight / 3 : 0;
}

export const SpotPreview = memo(function SpotPreview({ doc, part, matcher, now }: { doc: SearchDoc<SpotMeta> | null; part: SearchPart | null; matcher: Matcher; now: number }) {
  const scroller = useRef<HTMLElement>(null);
  const title = useLibraryStore(s => (doc ? shownDocTitle(s, doc) : ''));
  const facts = useLibraryStore(s => (doc ? docFacts(s, doc).join(' · ') : ''));
  useLayoutEffect(() => {
    if (scroller.current) scrollToMatch(scroller.current, part);
  }, [doc, part, matcher]);
  return (
    <aside ref={scroller} className={styles.preview} aria-label={t('Aperçu')}>
      {doc ? (
        <article className={styles.previewArticle}>
          <header className={styles.previewHead}>
            <span className={styles.previewMark} data-type={doc.meta.type}>
              <DocMark doc={doc} large />
            </span>
            <div className={styles.previewHeading}>
              <h2 className={`${styles.previewTitle} t-title`}>
                <Marked text={title} matcher={matcher} />
              </h2>
              <p className={`${styles.previewFacts} t-meta`}>
                {facts}
                <span className={styles.previewWhen}>{formatRelative(doc.editedAt, now)}</span>
              </p>
            </div>
          </header>
          {doc.meta.type === 'note' ? <NotePreview doc={doc} matcher={matcher} /> : null}
          {doc.meta.type === 'page' ? <PagePreview doc={doc} matcher={matcher} /> : null}
          {doc.meta.type === 'collection' ? <CollectionPreview doc={doc} matcher={matcher} /> : null}
          {doc.meta.type === 'link' ? <LinkPreview doc={doc} matcher={matcher} /> : null}
        </article>
      ) : (
        <Tips />
      )}
    </aside>
  );
});
