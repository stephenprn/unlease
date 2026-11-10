/**
 * An event's description as it reads: its words with their marks, each mention its subject's name
 * opening it (a page in Pages, a note in Carnet, a person in Contacts, another event here), each date
 * as the day it names. What is gone reads as such.
 */
import { Fragment, memo } from 'react';

import { dateShown } from '@unlease/core/services/dates';
import { parseRich, type Run } from '@unlease/core/services/richText';
import { safeHref } from '@unlease/core/services/url';

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
  let node = <>{run.text}</>;
  if (run.marks.b) node = <strong>{node}</strong>;
  if (run.marks.i) node = <em>{node}</em>;
  if (run.marks.u) node = <u>{node}</u>;
  if (run.marks.s) node = <s>{node}</s>;
  if (run.marks.a) {
    node = (
      <a href={safeHref(run.marks.a)} target="_blank" rel="noopener noreferrer">
        {node}
      </a>
    );
  }
  return node;
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
