/**
 * "Demander à Claude" on the pages (phone): a conversation about a page, its sub-pages, or every
 * page, answered from them, each claim marked with the sources it rests on; a source opens its page
 * at the block (the sheet closes, the conversation is kept). Shown only when the Administration turns
 * the questions on. The web's `AskPanel`.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { answerCopy, answerLayout, askStarters, askTitle, askWords, citationNumbers, isPrivatePage, keptUnder, pagePath, quoteText, type AnswerSegment } from '@unlease/notes/services/pagesAsk';
import { askCost, PAGES_ASK_LIMITS, type PageScope, type PagesAskResponse } from '@unlease/notes/sync/pagesAsk';
import { PAGES_REACH_CHARS, type ClaudeModel, type PagesAskSettings } from '@unlease/core/sync/settings';
import { siteDomain } from '@unlease/core/services/url';
import {
  addAnswerToPage,
  askableSubPages,
  askPages,
  askPreview,
  cancelAsk,
  clearAskThread,
  closePagesAsk,
  retryAsk,
  setAskScope,
  setAskWeb,
  usePagesAskSettings,
  usePagesAskStore,
  type AskThread,
  type AskTurn,
} from '@app/pagesAsk';
import { useLibraryStore } from '@app/store/libraryStore';
import { setPagePrivate } from '@app/store/pages';
import { selectModel, useSettingsStore } from '@app/store/settingsStore';
import { showSnack } from '@app/store/uiStore';
import { copyText } from '@platform/intake';

import { AppText, Button, Icon, IconButton, Segmented, Sheet, SwitchMark, Tappable, TextField } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';
import { formatUsd } from '../settings/money';
import { ReadingTrack } from '../links/ReadingTrack';

const EMPTY: AskThread = { scope: 'page', web: false, turns: [] };

const openUrl = (url: string) => Linking.openURL(url).catch(() => showSnack(t('Impossible d’ouvrir ce lien'), undefined, { tone: 'error' }));

/** Mounted at the page screen's root: open while the conversation is this page's. */
export function PageAskSheet({ pageId, onCite }: { pageId: string; onCite: (pageId: string, blockId: string | null) => void }) {
  const settings = usePagesAskSettings();
  const open = usePagesAskStore(s => s.open === pageId);
  return (
    <Sheet visible={open && settings !== null} onDismiss={closePagesAsk} title={t('Demander à Claude')} tall>
      {open && settings ? <AskBody pageId={pageId} settings={settings} onCite={onCite} /> : null}
    </Sheet>
  );
}

function ScopeFacts({ pageId, scope, settings, model, web }: { pageId: string; scope: PageScope; settings: PagesAskSettings; model: ClaudeModel; web: boolean }) {
  const library = useLibraryStore(s => s);
  const preview = useMemo(() => askPreview(library, pageId, scope, settings), [library, pageId, scope, settings]);
  const reach = PAGES_REACH_CHARS[settings.reach];
  const lines: string[] = [];
  if (scope === 'all') {
    lines.push(t('Claude lit les pages les plus proches de votre question, jusqu’à environ {words} mots ({cost} au plus).', { words: askWords(reach), cost: formatUsd(askCost(reach, model, web)) }));
  } else {
    const words = askWords(preview.chars);
    const cost = formatUsd(askCost(preview.chars, model, web));
    const others = preview.pages.length - 1;
    lines.push(
      scope === 'tree' && others > 0
        ? t('Claude lit cette page et {pages} : environ {words} mots ({cost} au plus).', { pages: plural(others, 'sous-page', 'sous-pages'), words, cost })
        : t('Claude lit cette page : environ {words} mots ({cost} au plus).', { words, cost }),
    );
    if (preview.cut > 0) lines.push(t('Trop long pour une seule question : {pages} de côté.', { pages: plural(preview.cut, 'page laissée', 'pages laissées') }));
  }
  const kept = scope === 'all' ? 0 : keptUnder(library, pageId);
  if (kept > 0) lines.push(t('{pages} hors de Claude.', { pages: plural(kept, 'page gardée', 'pages gardées') }));
  return (
    <>
      {lines.map(line => (
        <AppText key={line} variant="meta">
          {line}
        </AppText>
      ))}
    </>
  );
}

function AskBody({ pageId, settings, onCite }: { pageId: string; settings: PagesAskSettings; onCite: (pageId: string, blockId: string | null) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const thread = usePagesAskStore(s => s.threads[pageId]) ?? EMPTY;
  const title = useLibraryStore(s => askTitle(s.blocks[pageId]));
  const subCount = useLibraryStore(s => askableSubPages(s, pageId));
  const kept = useLibraryStore(s => isPrivatePage(s.blocks, pageId));
  const ownKept = useLibraryStore(s => s.blocks[pageId]?.private === true);
  const model = useSettingsStore(selectModel);
  const [draft, setDraft] = useState('');
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const pending = thread.turns.some(turn => turn.answer === null && turn.error === null);
  const scope: PageScope = thread.scope === 'all' && !settings.everywhere ? 'page' : thread.scope === 'tree' && subCount === 0 ? 'page' : thread.scope;
  const web = thread.web && settings.web;
  const options = [
    { value: 'page' as const, label: t('Cette page') },
    ...(subCount > 0 ? [{ value: 'tree' as const, label: t('Sous-pages') }] : []),
    ...(settings.everywhere ? [{ value: 'all' as const, label: t('Toutes') }] : []),
  ];

  const send = (question: string): void => {
    const asked = question.trim();
    if (!asked || pending) return;
    setDraft('');
    void askPages(pageId, asked);
  };
  const cite = (answer: PagesAskResponse, index: number): void => {
    const citation = answer.citations[index];
    if (citation) onCite(citation.pageId, citation.blockIds[0] ?? null);
  };

  if (kept) {
    return (
      <View style={styles.private}>
        <Icon name="eyeOff" size={24} color={theme.color.inkMuted} />
        <AppText variant="body">{ownKept ? t('Cette page est gardée hors de Claude : ni elle ni ses sous-pages ne lui sont envoyées.') : t('Une page au-dessus de celle-ci la garde hors de Claude : rien n’en est envoyé.')}</AppText>
        {ownKept ? <Button kind="tonal" icon="eye" label={t('Montrer à Claude')} onPress={() => setPagePrivate(pageId, false)} /> : null}
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <View style={styles.scope}>
        <View style={styles.aboutRow}>
          <AppText variant="meta" numberOfLines={1} style={styles.flex}>
            {t('À propos de « {page} »', { page: title })}
          </AppText>
          {thread.turns.length > 0 ? <Button kind="text" icon="broom" label={t('Nouvelle conversation')} onPress={() => clearAskThread(pageId)} /> : null}
        </View>
        {options.length > 1 ? <Segmented<PageScope> options={options} value={scope} onChange={next => setAskScope(pageId, next)} /> : null}
        <ScopeFacts pageId={pageId} scope={scope} settings={settings} model={model} web={web} />
      </View>

      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" style={styles.thread} contentContainerStyle={styles.threadContent} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {thread.turns.length === 0 ? (
          <View role="group" accessibilityLabel={t('Questions pour commencer')} style={styles.starters}>
            <AppText variant="meta">{t('Claude répond d’après vos pages et cite les passages.')}</AppText>
            {askStarters(scope).map(starter => (
              <Tappable key={starter} onPress={() => send(starter)} accessibilityLabel={starter} style={styles.starter}>
                <AppText variant="label">{starter}</AppText>
              </Tappable>
            ))}
          </View>
        ) : (
          thread.turns.map(turn => <Turn key={turn.id} pageId={pageId} turn={turn} onCite={cite} />)
        )}
      </ScrollView>

      <View style={styles.composer}>
        <View style={styles.composeRow}>
          <View style={styles.flex}>
            <TextField
              accessibilityLabel={t('Votre question')}
              value={draft}
              onChangeText={setDraft}
              placeholder={thread.turns.length > 0 ? t('Une autre question…') : scope === 'page' ? t('Une question sur cette page') : t('Une question sur vos pages')}
              multiline
              maxLength={PAGES_ASK_LIMITS.question}
              style={styles.field}
            />
          </View>
          <IconButton icon="arrowUp" label={t('Demander')} shape={1} disabled={!draft.trim() || pending} onPress={() => send(draft)} />
        </View>
        {settings.web ? (
          // The whole row is the switch (the web's): its words name it.
          <Tappable onPress={() => setAskWeb(pageId, !web)} accessibilityRole="switch" accessibilityState={{ checked: web }} accessibilityLabel={t('Chercher aussi sur le web')} style={styles.webRow}>
            <AppText variant="meta" style={styles.flex}>
              {t('Chercher aussi sur le web')}
            </AppText>
            <SwitchMark checked={web} />
          </Tappable>
        ) : null}
      </View>
    </View>
  );
}

function Turn({ pageId, turn, onCite }: { pageId: string; turn: AskTurn; onCite: (answer: PagesAskResponse, index: number) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.turn}>
      <View style={styles.question}>
        <AppText variant="body" selectable>
          {turn.question}
        </AppText>
      </View>
      {turn.answer ? (
        <Answer pageId={pageId} turn={turn} answer={turn.answer} onCite={index => onCite(turn.answer!, index)} />
      ) : turn.error !== null ? (
        <View style={styles.failed} accessibilityLiveRegion="polite">
          <AppText variant="body" color={theme.color.danger}>
            {t('Claude n’a pas pu répondre : {reason}', { reason: t(turn.error) })}
          </AppText>
          <Button kind="text" icon="refresh" label={t('Réessayer')} onPress={() => retryAsk(pageId, turn.id)} />
        </View>
      ) : (
        <View style={styles.waiting} accessibilityLiveRegion="polite">
          <ReadingTrack width={72} />
          <AppText variant="meta" style={styles.flex}>
            {turn.web ? t('Claude lit {pages} et cherche sur le web…', { pages: plural(turn.read, 'page', 'pages') }) : t('Claude lit {pages}…', { pages: plural(turn.read, 'page', 'pages') })}
          </AppText>
          <Button kind="text" label={t('Annuler')} onPress={() => cancelAsk(pageId)} />
        </View>
      )}
    </View>
  );
}

function Answer({ pageId, turn, answer, onCite }: { pageId: string; turn: AskTurn; answer: PagesAskResponse; onCite: (index: number) => void }) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const layout = useMemo(() => answerLayout(answer.parts), [answer]);
  const numbers = useMemo(() => [...citationNumbers(answer.parts)].sort((a, b) => a[1] - b[1]), [answer]);
  const blocks = useLibraryStore(s => s.blocks);
  const where = (id: string): string => (blocks[id] && blocks[id]!.deletedAt === null ? pagePath(blocks, id) : t('Page supprimée'));
  // A source's mark among the words: its number on the action's wash, pressed to open it.
  const words = (line: readonly AnswerSegment[]) =>
    line.map((segment, part) =>
      'text' in segment ? (
        segment.text
      ) : (
        <AppText key={part} variant="metaStrong" onPress={() => onCite(segment.index)} accessibilityRole="link" accessibilityLabel={t('Source {number} : {page}', { number: segment.cite, page: where(answer.citations[segment.index]?.pageId ?? '') })} style={styles.mark}>
          {` ${segment.cite} `}
        </AppText>
      ),
    );
  const copy = (): void => {
    void copyText(answerCopy(answer, id => askTitle(blocks[id]))).then(done => showSnack(done ? t('Réponse copiée') : t('Impossible de copier la réponse'), undefined, { tone: done ? 'success' : 'error' }));
  };
  return (
    <View style={styles.answer}>
      {layout.map((runs, at) => (
        <View key={at} style={styles.paragraph}>
          {runs.map((run, row) =>
            run.list ? (
              run.lines.map((line, item) => (
                <View key={`${row}-${item}`} style={styles.item}>
                  <AppText variant="body" accessibilityElementsHidden importantForAccessibility="no">
                    •
                  </AppText>
                  <AppText variant="body" selectable style={styles.flex}>
                    {words(line)}
                  </AppText>
                </View>
              ))
            ) : (
              <AppText key={row} variant="body" selectable>
                {words(run.lines[0]!)}
              </AppText>
            ),
          )}
        </View>
      ))}
      {numbers.length > 0 ? (
        <View accessibilityLabel={t('Sources dans vos pages')}>
          {numbers.map(([index, cite]) => {
            const citation = answer.citations[index]!;
            return (
              <Tappable key={index} onPress={() => onCite(index)} accessibilityRole="link" accessibilityLabel={t('Source {number} : {page}', { number: cite, page: where(citation.pageId) })} style={styles.source}>
                <View style={styles.sourceNumber}>
                  <AppText variant="metaStrong" color={theme.color.onActionContainer}>
                    {cite}
                  </AppText>
                </View>
                <View style={styles.flex}>
                  <AppText variant="metaStrong" numberOfLines={1}>
                    {where(citation.pageId)}
                  </AppText>
                  {citation.quote ? (
                    <AppText variant="meta" numberOfLines={2}>
                      « {quoteText(citation.quote)} »
                    </AppText>
                  ) : null}
                </View>
              </Tappable>
            );
          })}
        </View>
      ) : null}
      {answer.sources.length > 0 ? (
        <View accessibilityLabel={t('Sources sur le web')}>
          {answer.sources.map(source => (
            <Tappable key={source.url} onPress={() => openUrl(source.url)} accessibilityRole="link" accessibilityLabel={source.title} style={styles.source}>
              <Icon name="external" size={20} color={theme.color.link} />
              <View style={styles.flex}>
                <AppText variant="body" numberOfLines={2}>
                  {source.title}
                </AppText>
                <AppText variant="meta" numberOfLines={1}>
                  {siteDomain(source.url)}
                </AppText>
              </View>
            </Tappable>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button kind="text" icon="copy" label={t('Copier')} onPress={copy} />
        <Button
          kind="text"
          icon="pagePlus"
          label={t('Ajouter à la page')}
          onPress={() => {
            if (addAnswerToPage(pageId, turn)) showSnack(t('Réponse ajoutée à la fin de la page'), undefined, { tone: 'success' });
          }}
        />
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { flexShrink: 1 },
    flex: { flex: 1 },
    scope: { gap: 8, paddingHorizontal: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline },
    aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, marginTop: -8 },
    thread: { flexShrink: 1 },
    threadContent: { gap: 22, paddingHorizontal: 8, paddingVertical: 16 },
    starters: { gap: 8, alignItems: 'flex-start' },
    // A question to start from, as the link's are drawn: an edged chip on paper.
    starter: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1.5, borderColor: theme.color.outline, backgroundColor: theme.color.paper, ...corners(SHAPES.chip) },
    turn: { gap: 10 },
    // The person's own words, set apart on the field's tone.
    question: { alignSelf: 'flex-end', maxWidth: '88%', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.color.field, ...corners(SHAPES.tab) },
    waiting: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    failed: { gap: 6, alignItems: 'flex-start' },
    answer: { gap: 10 },
    paragraph: { gap: 4 },
    item: { flexDirection: 'row', gap: 10, paddingLeft: 4 },
    mark: { color: theme.color.onActionContainer, backgroundColor: theme.color.actionContainer },
    source: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8, paddingVertical: 6, ...corners(SHAPES.tab) },
    sourceNumber: { minWidth: 22, height: 22, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.actionContainer, ...corners(SHAPES.detail) },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    private: { gap: 12, alignItems: 'flex-start', paddingHorizontal: 8, paddingBottom: 16 },
    composer: { gap: 2, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.color.hairline },
    composeRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
    field: { maxHeight: 140 },
    webRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 8, ...corners(SHAPES.tab) },
  });
