/**
 * An event's description as it reads: its words with their marks, each mention its subject's name
 * opening it (a page in Pages, a note in Carnet, a person in Contacts, another event here), each date
 * as the day it names, each address written in it (`linksInText`: a description imported or
 * subscribed to holds them bare) a link opening in a new tab. What is gone reads as such.
 */
import { Fragment, memo, type ReactNode } from 'react';

import { dateShown } from '@unlease/core/services/dates';
import { parseRich, type Run } from '@unlease/core/services/richText';
import { linksInText, safeHref, safeLink } from '@unlease/core/services/url';

import { mentionPath, mentionWords, nameOf, useNamesRevision } from '../../app/names';
import { useMinute } from '@shared/app/hooks/useMinute';
import { Link } from '@shared/ui/router';
import styles from '../calendar.module.css';

function RunView({ run, now }: { run: Run; now: number }) {
  if (run.kind === 'date') return <span className={styles.mention}>{dateShown(run, now)}</span>;
  if (run.kind === 'mention') {
    const name = mentionWords(run.target);
    const path = nameOf(run.target) !== null ? mentionPath(run.target) : null;
    if (!path) return <span className={styles.mention} data-gone="">{name}</span>;
    return (
      <Link to={path} className={styles.mention}>
        {name}
      </Link>
    );
  }
  let node = run.marks.a ? <>{run.text}</> : <LinkedWords text={run.text} />;
  if (run.marks.b) node = <strong>{node}</strong>;
  if (run.marks.i) node = <em>{node}</em>;
  if (run.marks.u) node = <u>{node}</u>;
  if (run.marks.s) node = <s>{node}</s>;
  if (run.marks.a) {
    node = (
      <a href={safeHref(run.marks.a)} target="_blank" rel="noopener noreferrer" className={styles.link}>
        {node}
      </a>
    );
  }
  return node;
}

/** Words with each address they hold a link (one that may not be opened stays words). */
function LinkedWords({ text }: { text: string }) {
  const links = linksInText(text);
  if (links.length === 0) return <>{text}</>;
  const pieces: ReactNode[] = [];
  let at = 0;
  for (const link of links) {
    if (link.start > at) pieces.push(text.slice(at, link.start));
    const href = safeLink(link.href);
    const words = text.slice(link.start, link.end);
    pieces.push(
      href ? (
        <a key={link.start} href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
          {words}
        </a>
      ) : (
        words
      ),
    );
    at = link.end;
  }
  if (at < text.length) pieces.push(text.slice(at));
  return <>{pieces}</>;
}

function RichTextComponent({ markup }: { markup: string }) {
  useNamesRevision();
  const now = useMinute();
  return (
    <p className={`${styles.description} t-body`}>
      {parseRich(markup).map((run, index) => (
        <Fragment key={index}>
          <RunView run={run} now={now} />
        </Fragment>
      ))}
    </p>
  );
}

export const RichText = memo(RichTextComponent);
