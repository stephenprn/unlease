/**
 * « Historique des versions », from a page's menu: the versions the server kept of it, by day, each
 * with what it changed; a version opened shows read-only, each block marked against the page now
 * (changed since, or no longer there), and « Restaurer cette version » brings it back as one step of
 * the page's undo, with Undo on its slip (`restoreVersion`). Without a server there is no history.
 */
import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { t } from '@unlease/core/i18n';
import { formatClock, formatDay } from '@unlease/core/services/format';
import { markupToPlain } from '@unlease/core/services/richText';
import { dateWords } from '@unlease/core/services/dates';
import { UNTITLED_PAGE, type Block } from '@unlease/pages/models/blocks';
import { changeWords, restorePlan, restoreWords, versionDays, versionOutline, versionPage, type OutlineRow } from '@unlease/pages/services/versions';
import type { PageVersion, PageVersionSummary } from '@unlease/pages/sync/versions';

import { fetchPageVersion, fetchPageVersions } from '../../../app/api';
import { mentionLabel } from '../../../app/hooks/usePages';
import { useBlocksStore } from '../../../app/store/blocks';
import { restoreVersion } from '../../../app/store/pages';
import { useMinute } from '@shared/app/hooks/useMinute';
import { useSettingsStore } from '@shared/app/store/settings';
import { getRecord } from '@shared/app/store/records';
import { showSnack } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { CheckMark } from '@shared/ui/components/Checkbox';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import type { GlyphName } from '@unlease/design/glyphs';
import { flushAll } from './editorStore';
import styles from './versions.module.css';

type Listing = { readonly state: 'loading' } | { readonly state: 'error'; readonly message: string } | { readonly state: 'ready'; readonly versions: readonly PageVersionSummary[] };
type Opened = { readonly state: 'loading'; readonly id: number } | { readonly state: 'error'; readonly id: number; readonly message: string } | { readonly state: 'ready'; readonly version: PageVersion };

const plain = (markup: string): string => markupToPlain(markup, mentionLabel, dateWords);

const MEDIA_GLYPHS: Partial<Record<Block['kind'], GlyphName>> = { image: 'image', video: 'video', pdf: 'pdf', file: 'file', bookmark: 'bookmark', embed: 'embed', drawing: 'draw', calendar: 'calendar', toc: 'contents' };

function cellText(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? '✓' : '';
  return value === null || value === undefined ? '' : String(value);
}

/** One block of the version, read-only, as its kind reads. */
function OutlineBlock({ row }: { row: OutlineRow }) {
  const { block } = row;
  const text = plain(block.text);
  switch (block.kind) {
    case 'h1':
    case 'h2':
      return <p className={`${styles.heading} t-title`}>{text}</p>;
    case 'h3':
    case 'h4':
      return <p className={`${styles.heading} t-body-strong`}>{text}</p>;
    case 'bullet':
    case 'numbered':
      return (
        <p className={`${styles.item} t-body`}>
          <span aria-hidden="true">•</span>
          {text}
        </p>
      );
    case 'todo':
      return (
        <p className={`${styles.item} t-body`}>
          <CheckMark checked={block.checked} recede size={18} />
          <span className={block.checked ? styles.done : undefined}>{text}</span>
        </p>
      );
    case 'toggle':
      return (
        <p className={`${styles.item} t-body`}>
          <Icon name="chevronRight" size={18} />
          {text}
        </p>
      );
    case 'callout':
      return (
        <p className={`${styles.callout} t-body`}>
          {block.icon ? <span aria-hidden="true">{block.icon}</span> : null}
          {text}
        </p>
      );
    case 'code':
      return <pre className={styles.code}>{block.text}</pre>;
    case 'page':
      return (
        <p className={`${styles.item} t-body-strong`}>
          {block.icon ? <span aria-hidden="true">{block.icon}</span> : <Icon name="page" size={18} />}
          {block.text.trim() || t(UNTITLED_PAGE)}
        </p>
      );
    case 'table':
      return (
        <div className={styles.tableBox}>
          <table className={`${styles.table} t-meta`}>
            <thead>
              <tr>
                {block.columns.map(column => (
                  <th key={column.id}>{column.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(row.rows ?? []).map(tableRow => (
                <tr key={tableRow.id}>
                  {block.columns.map(column => (
                    <td key={column.id}>{cellText(tableRow.cells[column.id])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default: {
      const glyph = MEDIA_GLYPHS[block.kind];
      if (!glyph) return text ? <p className="t-body">{text}</p> : <p className={styles.blank} aria-hidden="true" />;
      return (
        <p className={`${styles.item} ${styles.media} t-meta`}>
          <Icon name={glyph} size={18} />
          {block.caption || block.fileName || block.url || ''}
        </p>
      );
    }
  }
}

/** Mount it with a fresh `key` at each opening (`PageMenu`): it starts on the list, loading. */
export function VersionHistory({ id, open, onDismiss }: { id: string; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  const config = useSettingsStore(s => s.server);
  const title = useBlocksStore(s => s.blocks[id]?.text.trim() || t(UNTITLED_PAGE));
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const [opened, setOpened] = useState<Opened | null>(null);
  // Re-reads the page as it changes, so the marks and the restore's words stay true.
  const revision = useBlocksStore(s => s.revision);
  const now = useMinute();

  useEffect(() => {
    if (!open || !config) return;
    const controller = new AbortController();
    fetchPageVersions(config, id, controller.signal).then(
      list => setListing({ state: 'ready', versions: list.versions }),
      (error: unknown) => {
        if (!controller.signal.aborted) setListing({ state: 'error', message: error instanceof Error ? error.message : t('Couldn’t load the versions') });
      },
    );
    return () => controller.abort();
  }, [open, config, id]);

  const pick = (versionId: number): void => {
    if (!config) return;
    setOpened({ state: 'loading', id: versionId });
    fetchPageVersion(config, id, versionId).then(
      version => setOpened(current => (current?.state === 'loading' && current.id === versionId ? { state: 'ready', version } : current)),
      (error: unknown) => setOpened(current => (current?.state === 'loading' && current.id === versionId ? { state: 'error', id: versionId, message: error instanceof Error ? error.message : t('Couldn’t load this version') } : current)),
    );
  };

  const version = opened?.state === 'ready' ? opened.version : null;
  const outline = useMemo(() => (version ? versionOutline(version, blockId => getRecord('block', blockId)?.fields) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the page's revision re-reads the records
    [version, revision]);
  const words = useMemo(() => {
    if (!version) return null;
    const { blocksByParent } = useBlocksStore.getState();
    return restoreWords(restorePlan(version, { fieldsOf: blockId => getRecord('block', blockId)?.fields, childrenOf: blockId => blocksByParent[blockId] ?? [] }, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the page's revision re-reads the records
  }, [version, revision]);

  const restore = (): void => {
    if (!version) return;
    flushAll();
    const { undo } = restoreVersion(version);
    onDismiss();
    if (undo) showSnack(t('Version restored'), { label: t('Undo'), run: undo }, { tone: 'success' });
    else showSnack(t('The page already reads as this version'));
  };

  let body: ReactNode;
  if (!config) body = <EmptyLine text={t('Version history needs your server: connect one in Settings.')} glyph="cloudOff" size="body" />;
  else if (opened) {
    body =
      opened.state === 'loading' ? (
        <p className={`${styles.waiting} t-meta`}>{t('Loading…')}</p>
      ) : opened.state === 'error' ? (
        <EmptyLine text={opened.message} glyph="error" size="body" role="status" />
      ) : (
        <div className={styles.preview}>
          <p className={`${styles.versionHead} t-meta`}>
            {formatDay(opened.version.at, now)} · {formatClock(opened.version.at)}
          </p>
          <p className={`${styles.pageTitle} t-title`}>
            {versionPage(opened.version).icon ? <span aria-hidden="true">{versionPage(opened.version).icon} </span> : null}
            {versionPage(opened.version).text.trim() || t(UNTITLED_PAGE)}
          </p>
          {outline.length === 0 ? <EmptyLine text={t('This version is empty')} size="body" /> : null}
          {outline.map(row => (
            <div key={row.block.id} className={styles.row} data-mark={row.mark} style={{ '--depth': row.depth } as CSSProperties} title={row.mark === 'changed' ? t('Changed since') : row.mark === 'gone' ? t('No longer on the page') : undefined}>
              <OutlineBlock row={row} />
            </div>
          ))}
          <p className={`${styles.keeps} t-meta`}>{t('Restoring keeps the page’s sub-pages, its place and whether Claude may read it.')}</p>
          <p className={`${styles.legend} t-meta`}>
            <span className={styles.legendChanged}>{t('Changed since')}</span>
            <span className={styles.legendGone}>{t('No longer on the page')}</span>
          </p>
        </div>
      );
  } else if (listing.state === 'loading') body = <p className={`${styles.waiting} t-meta`}>{t('Loading…')}</p>;
  else if (listing.state === 'error') body = <EmptyLine text={listing.message} glyph="error" size="body" role="status" />;
  else if (listing.versions.length === 0) body = <EmptyLine text={t('No version yet: your server keeps one a few minutes after this page is edited.')} glyph="clock" size="body" />;
  else {
    body = (
      <>
        <p className={`${styles.about} t-meta`}>{t('Your server keeps a version of each page a few minutes after you stop editing it: every one for a day, then one per day for 90 days.')}</p>
        {versionDays(listing.versions, now).map(day => (
          <section key={day.label} className={styles.day} aria-label={day.label}>
            <h3 className={`${styles.dayHead} t-section`}>{day.label}</h3>
            {day.versions.map(summary => (
              <button key={summary.id} type="button" className={styles.versionRow} onClick={() => pick(summary.id)}>
                <span className={`${styles.clock} t-body-strong`}>{formatClock(summary.at)}</span>
                <span className={`${styles.change} t-meta`}>{changeWords(summary.change)}</span>
                <Icon name="chevronRight" size={20} />
              </button>
            ))}
          </section>
        ))}
      </>
    );
  }

  const foot = version ? (
    <>
      <span className={`${styles.footWords} t-meta`}>{words ?? t('The page already reads as this version')}</span>
      <Button kind="text" onClick={() => setOpened(null)}>
        {t('Back to the versions')}
      </Button>
      <Button icon="restore" onClick={restore} disabled={!words}>
        {t('Restore this version')}
      </Button>
    </>
  ) : opened ? (
    <Button kind="text" onClick={() => setOpened(null)}>
      {t('Back to the versions')}
    </Button>
  ) : undefined;

  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <DialogFrame kind="list" className={styles.frame} title={t('Versions of {page}', { page: title })} titleId={titleId} onClose={onDismiss} foot={foot}>
        {body}
      </DialogFrame>
    </Layer>
  );
}
