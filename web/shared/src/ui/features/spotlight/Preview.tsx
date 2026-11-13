/**
 * The chosen result itself, beside the list on a wide screen, as its app draws it (`SpotKind.Preview`:
 * a note on its own colour, a page's blocks…); every match marked, scrolled to where the query matched
 * best. With nothing to show, it teaches what the field reads.
 */
import { memo, useLayoutEffect, useRef } from 'react';

import { t } from '@unlease/core/i18n';
import { formatRelative } from '@unlease/core/services/format';
import { highlight, type Matcher, type SearchDoc, type SearchPart } from '@unlease/core/services/searchIndex';
import type { SpotMeta } from '@unlease/core/services/spotlight';

import { useRecordsRevision } from '../../../app/store/records';
import { Highlight } from '../../components/Highlight';
import { useScrollEdgesOn } from '../../components/scrollEdges';
import { modKey } from '../../dom';
import { kindOf, spotKinds } from '../../../app/spotKinds';
import { theApp } from '../../../modules';
import keys from '../../components/keys.module.css';
import styles from './spotlight.module.css';

/** Words with the query's matches marked: what every app's preview draws its text with. */
export function Marked({ text, matcher }: { text: string; matcher: Matcher }) {
  return <Highlight text={text} ranges={highlight(text, matcher)} />;
}

/** What the field reads, for a spotlight with nothing chosen yet: only what works in this app (its labels, its types). */
function Tips() {
  const labels = (theApp().spotLabels?.() ?? []).length > 0;
  const types = spotKinds().length > 1;
  const tips: readonly (readonly [string, string])[] = [
    [t('"exact words"'), t('These words, in this order')],
    [t('-word'), t('Without this word')],
    ...(labels ? [[t('#label'), t('Everything with this label')] as const] : []),
    ...(types ? [['Tab', t('One type at a time')] as const] : []),
    [`${modKey()} ↵`, t('Open in a new tab')],
  ];
  return (
    <div className={styles.tips}>
      <p className={`${styles.tipsLead} t-body`}>{t('Titles first, then the content. Accents, the start of a word and typos are understood.')}</p>
      <dl className={styles.tipList}>
        {tips.map(([key, what]) => (
          <div key={key}>
            <dt>
              <kbd className={keys.kbd}>{key}</kbd>
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
  useScrollEdgesOn(scroller, [], { top: true });
  // Every change of the records draws it again: its title and facts are read as they are now.
  useRecordsRevision();
  const kind = doc ? kindOf(doc.meta.type) : null;
  const title = doc && kind ? kind.title(doc) : (doc?.title ?? '');
  const facts = doc && kind ? kind.facts(doc).join(' · ') : '';
  const Mark = kind?.Mark;
  const Body = kind?.Preview;
  useLayoutEffect(() => {
    if (scroller.current) scrollToMatch(scroller.current, part);
  }, [doc, part, matcher]);
  return (
    <aside ref={scroller} className={styles.preview} aria-label={t('Preview')}>
      {doc ? (
        <article className={styles.previewArticle}>
          <header className={styles.previewHead}>
            <span className={styles.previewMark} data-type={doc.meta.type}>
              {Mark ? <Mark doc={doc} large /> : null}
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
          {Body ? <Body doc={doc} matcher={matcher} /> : null}
        </article>
      ) : (
        <Tips />
      )}
    </aside>
  );
});
