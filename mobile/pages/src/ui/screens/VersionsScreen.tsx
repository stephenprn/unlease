/**
 * « Historique des versions », from a page's menu (the web's `VersionHistory`): the versions the
 * server kept of the page, by day, each with what it changed; one opened shows read-only, each block
 * marked against the page now (a bar when it changed since, faded when it is no longer there), and
 * « Restaurer cette version » at the foot brings it back as one step of the page's undo, with Undo on
 * its slip (`restoreVersion`). Without a server there is no history.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { dateWords } from '@unlease/core/services/dates';
import { formatClock, formatDay } from '@unlease/core/services/format';
import { markupToPlain } from '@unlease/core/services/richText';
import type { GlyphName } from '@unlease/design/glyphs';
import { UNTITLED_PAGE, type Block } from '@unlease/pages/models/blocks';
import { changeWords, restorePlan, restoreWords, versionDays, versionOutline, versionPage, type OutlineRow } from '@unlease/pages/services/versions';
import type { PageVersion, PageVersionSummary } from '@unlease/pages/sync/versions';
import { mentionLabel } from '@app/hooks/usePages';
import { getRecord, useLibraryStore } from '@app/store/libraryStore';
import { restoreVersion } from '@app/store/pages';
import { fetchPageVersion, fetchPageVersions } from '@app/sync/transport';
import { useMinute } from '@shared/app/hooks/useMinute';
import { useSettingsStore } from '@shared/app/store/settingsStore';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, CheckMark, EdgeScrollView, EmptyLine, FormFoot, Ground, Icon, ListRow, Organic, TopBar } from '@shared/ui/components';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import type { ScreenProps } from '../navigation/types';

type Listing = { readonly state: 'loading' } | { readonly state: 'error'; readonly message: string } | { readonly state: 'ready'; readonly versions: readonly PageVersionSummary[] };
type Opened = { readonly state: 'loading'; readonly id: number } | { readonly state: 'error'; readonly id: number; readonly message: string } | { readonly state: 'ready'; readonly version: PageVersion };

const NEST = 20;
const MEDIA_GLYPHS: Partial<Record<Block['kind'], GlyphName>> = { image: 'image', video: 'video', pdf: 'pdf', file: 'file', bookmark: 'bookmark', embed: 'embed', drawing: 'draw', calendar: 'calendar', toc: 'contents' };

const plain = (markup: string): string => markupToPlain(markup, mentionLabel, dateWords);

function cellText(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? '✓' : '';
  return value === null || value === undefined ? '' : String(value);
}

/** One block of the version, read-only, as its kind reads. */
function OutlineBlock({ row }: { row: OutlineRow }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { block } = row;
  const text = plain(block.text);
  switch (block.kind) {
    case 'h1':
    case 'h2':
      return <AppText variant="title" style={styles.heading}>{text}</AppText>;
    case 'h3':
    case 'h4':
      return <AppText variant="bodyStrong" style={styles.heading}>{text}</AppText>;
    case 'bullet':
    case 'numbered':
      return (
        <View style={styles.item}>
          <AppText variant="body">•</AppText>
          <AppText variant="body" style={styles.words}>{text}</AppText>
        </View>
      );
    case 'todo':
      return (
        <View style={styles.item}>
          <CheckMark checked={block.checked} recede size={18} />
          <AppText variant="body" color={block.checked ? theme.color.inkMuted : undefined} style={styles.words}>
            {text}
          </AppText>
        </View>
      );
    case 'toggle':
      return (
        <View style={styles.item}>
          <Icon name="chevronRight" size={18} color={theme.color.inkMuted} />
          <AppText variant="body" style={styles.words}>{text}</AppText>
        </View>
      );
    case 'callout':
      return (
        <Organic outline="card" style={styles.callout}>
          {block.icon ? <AppText variant="body">{block.icon}</AppText> : null}
          <AppText variant="body" style={styles.words}>{text}</AppText>
        </Organic>
      );
    case 'code':
      return (
        <Organic outline="card" style={styles.callout}>
          <AppText variant="meta" style={styles.code}>{block.text}</AppText>
        </Organic>
      );
    case 'page':
      return (
        <View style={styles.item}>
          {block.icon ? <AppText variant="bodyStrong">{block.icon}</AppText> : <Icon name="page" size={18} color={theme.color.ink} />}
          <AppText variant="bodyStrong" style={styles.words}>{block.text.trim() || t(UNTITLED_PAGE)}</AppText>
        </View>
      );
    case 'table':
      return (
        <View style={styles.table}>
          <AppText variant="metaStrong">{block.columns.map(column => column.name).join(' · ')}</AppText>
          {(row.rows ?? []).map(tableRow => (
            <AppText key={tableRow.id} variant="meta">
              {block.columns.map(column => cellText(tableRow.cells[column.id])).join(' · ')}
            </AppText>
          ))}
        </View>
      );
    default: {
      const glyph = MEDIA_GLYPHS[block.kind];
      if (!glyph) return text ? <AppText variant="body">{text}</AppText> : <View style={styles.blank} />;
      return (
        <View style={styles.item}>
          <Icon name={glyph} size={18} color={theme.color.inkMuted} />
          <AppText variant="meta" style={styles.words}>{block.caption || block.fileName || block.url || ''}</AppText>
        </View>
      );
    }
  }
}

export function VersionsScreen({ navigation, route }: ScreenProps<'Versions'>) {
  const { page } = route.params;
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const config = useSettingsStore(s => s.server);
  const title = useLibraryStore(s => s.blocks[page]?.text.trim() || t(UNTITLED_PAGE));
  // Re-reads the page as it changes, so the marks and the restore's words stay true.
  const revision = useLibraryStore(s => s.revision);
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const [opened, setOpened] = useState<Opened | null>(null);
  const now = useMinute();
  // Back from a version opened goes to the list; a restore leaves the screen.
  const leaving = useRef(false);
  useEffect(() => {
    if (!opened) return;
    return navigation.addListener('beforeRemove', event => {
      if (leaving.current) return;
      event.preventDefault();
      setOpened(null);
    });
  }, [navigation, opened]);

  useEffect(() => {
    if (!config) return;
    const controller = new AbortController();
    fetchPageVersions(config, page, controller.signal).then(
      list => setListing({ state: 'ready', versions: list.versions }),
      (error: unknown) => {
        if (!controller.signal.aborted) setListing({ state: 'error', message: error instanceof Error ? error.message : t('Couldn’t load the versions') });
      },
    );
    return () => controller.abort();
  }, [config, page]);

  const pick = (versionId: number): void => {
    if (!config) return;
    setOpened({ state: 'loading', id: versionId });
    fetchPageVersion(config, page, versionId).then(
      version => setOpened(current => (current?.state === 'loading' && current.id === versionId ? { state: 'ready', version } : current)),
      (error: unknown) => setOpened(current => (current?.state === 'loading' && current.id === versionId ? { state: 'error', id: versionId, message: error instanceof Error ? error.message : t('Couldn’t load this version') } : current)),
    );
  };

  const version = opened?.state === 'ready' ? opened.version : null;
  const outline = useMemo(() => (version ? versionOutline(version, id => getRecord('block', id)?.fields) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the library's revision re-reads the records
    [version, revision]);
  const words = useMemo(() => {
    if (!version) return null;
    const { blocksByParent } = useLibraryStore.getState();
    return restoreWords(restorePlan(version, { fieldsOf: id => getRecord('block', id)?.fields, childrenOf: id => blocksByParent[id] ?? [] }, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the library's revision re-reads the records
  }, [version, revision]);

  const restore = (): void => {
    if (!version) return;
    const { undo } = restoreVersion(version);
    leaving.current = true;
    navigation.goBack();
    if (undo) showSnack(t('Version restored'), { label: t('Undo'), run: undo }, { tone: 'success' });
    else showSnack(t('The page already reads as this version'));
  };

  let body: React.ReactNode;
  if (!config) body = <EmptyLine text={t('Version history needs your server: connect one in Settings.')} glyph="cloudOff" size="body" style={styles.line} />;
  else if (opened) {
    if (opened.state === 'loading') body = <AppText variant="meta" style={styles.line}>{t('Loading…')}</AppText>;
    else if (opened.state === 'error') body = <EmptyLine text={opened.message} glyph="error" size="body" style={styles.line} />;
    else {
      const shown = versionPage(opened.version);
      body = (
        <View style={styles.preview}>
          <AppText variant="meta">
            {formatDay(opened.version.at, now)} · {formatClock(opened.version.at)}
          </AppText>
          <AppText variant="display" style={styles.pageTitle}>
            {shown.icon ? `${shown.icon} ` : ''}
            {shown.text.trim() || t(UNTITLED_PAGE)}
          </AppText>
          {outline.length === 0 ? <EmptyLine text={t('This version is empty')} size="body" /> : null}
          {outline.map(row => (
            <View
              key={row.block.id}
              style={[styles.row, { paddingLeft: row.depth * NEST + 12 }, row.mark === 'gone' ? styles.gone : null]}
              accessibilityHint={row.mark === 'changed' ? t('Changed since') : row.mark === 'gone' ? t('No longer on the page') : undefined}
            >
              {row.mark !== 'same' ? <View style={[styles.bar, { left: row.depth * NEST }, { backgroundColor: row.mark === 'gone' ? theme.color.danger : theme.color.focus }]} /> : null}
              <OutlineBlock row={row} />
            </View>
          ))}
          <AppText variant="metaStrong" style={styles.plan}>
            {words ?? t('The page already reads as this version')}
          </AppText>
          <AppText variant="meta">{t('Restoring keeps the page’s sub-pages, its place and whether Claude may read it.')}</AppText>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendBar, { backgroundColor: theme.color.focus }]} />
              <AppText variant="meta">{t('Changed since')}</AppText>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBar, { backgroundColor: theme.color.danger }]} />
              <AppText variant="meta">{t('No longer on the page')}</AppText>
            </View>
          </View>
        </View>
      );
    }
  } else if (listing.state === 'loading') body = <AppText variant="meta" style={styles.line}>{t('Loading…')}</AppText>;
  else if (listing.state === 'error') body = <EmptyLine text={listing.message} glyph="error" size="body" style={styles.line} />;
  else if (listing.versions.length === 0) body = <EmptyLine text={t('No version yet: your server keeps one a few minutes after this page is edited.')} glyph="clock" size="body" style={styles.line} />;
  else {
    body = (
      <>
        <AppText variant="meta" style={styles.line}>
          {t('Your server keeps a version of each page a few minutes after you stop editing it: every one for a day, then one per day for 90 days.')}
        </AppText>
        {versionDays(listing.versions, now).map(day => (
          <View key={day.label}>
            <AppText variant="section" style={styles.dayHead}>
              {day.label}
            </AppText>
            {day.versions.map(summary => (
              <ListRow key={summary.id} title={formatClock(summary.at)} supporting={changeWords(summary.change)} icon="clock" trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />} onPress={() => pick(summary.id)} />
            ))}
          </View>
        ))}
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t('Versions of {page}', { page: title })} onBack={() => navigation.goBack()} />
      <EdgeScrollView contentContainerStyle={[styles.content, { paddingBottom: (version ? 0 : insets.bottom) + 24 }]}>{body}</EdgeScrollView>
      {version ? (
        <View style={{ paddingBottom: insets.bottom }}>
          <FormFoot>
            <Button kind="text" label={t('Back to the versions')} onPress={() => setOpened(null)} />
            <Button icon="restore" label={t('Restore this version')} disabled={!words} onPress={restore} />
          </FormFoot>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { paddingTop: 4 },
    line: { paddingHorizontal: 16, paddingVertical: 8 },
    dayHead: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 },
    preview: { paddingHorizontal: 16, gap: 4 },
    pageTitle: { marginBottom: 8 },
    row: { position: 'relative' },
    bar: { position: 'absolute', top: 2, bottom: 2, width: 3, borderRadius: 2 },
    gone: { opacity: 0.62 },
    heading: { paddingTop: 8 },
    item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    words: { flex: 1, minWidth: 0 },
    callout: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.color.paperHigh },
    code: { fontFamily: 'monospace' },
    table: { gap: 2 },
    blank: { height: 8 },
    plan: { marginTop: 12 },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendBar: { width: 3, height: 14, borderRadius: 2 },
  });
