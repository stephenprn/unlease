/**
 * The pieces every app's import wizard is built from on the phone (`core/services/importFlow`; the
 * web's `features/importing` draws the same): the frame (where it stands, the step's title and lead,
 * what scrolls, the foot pinned under a hairline as a form's, the Back gesture going back a step),
 * the source's steps, the counts, the preview's list (filtered by fate, searched, a page at a time, an
 * item left out by its box), the choices, the progress and the report.
 *
 * The frame is the screen's whole body: on the app's « Importer » screen under its top bar, or as the
 * first run's step (`ImportHost`), which hands it its head and its own foot (« Retour », « Plus tard »)
 * for the steps where the wizard has none of its own.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { t } from '@unlease/core/i18n';
import {
  fateCounts,
  filterPreview,
  IMPORT_FATE_NAMES,
  IMPORT_STEP_NAMES,
  IMPORT_STEPS,
  IMPORT_WORDS,
  importProgress,
  PREVIEW_PAGE,
  previewEmptyWords,
  showMoreWords,
  shownOfWords,
  type ImportFate,
  type ImportStep,
  type PreviewEntry,
} from '@unlease/core/services/importFlow';
import { mix } from '@unlease/design/palette';
import { SHAPES } from '@unlease/design/shapes';
import type { GlyphName } from '@unlease/design/glyphs';

import { AppText, Button, Checkbox, EdgeScrollView, EmptyLine, footEdge, Icon, ListRow, Organic, Tappable, TextField } from '../../components';
import { useKeyboardVisible } from '../../components/useKeyboardVisible';
import { SwitchRow } from '../appearance/SwitchRow';
import { Section } from '../settings/Section';
import { corners } from '../../theme/shape';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

/** What an app's wizard is handed (the web's `ImportWizardProps`). */
export interface ImportWizardProps {
  /** It left its first step (true), or came back to it or ended (false). */
  readonly onFlow?: (inFlow: boolean) => void;
  /** Something was written: the first run's step counts as done. */
  readonly onImported?: () => void;
}

/** Where the wizard is shown: its own screen (the default), or the first run's step. */
export interface ImportHostValue {
  readonly embedded: boolean;
  /** Above the step's title: the first run's head. */
  readonly head?: React.ReactNode;
  /** The pinned foot for a step that has none of its own (the source, the report): the first run's. */
  readonly foot?: React.ReactNode;
  /** Room above the scroll (the first run lies under the status bar; a screen's top bar holds it already). */
  readonly top?: number;
}

const ImportHostContext = createContext<ImportHostValue>({ embedded: false });

export const ImportHost = ImportHostContext.Provider;

export function useImportHost(): ImportHostValue {
  return useContext(ImportHostContext);
}

// ── the frame ───────────────────────────────────────────────────────────────

export interface ImportFrameProps {
  readonly step: ImportStep;
  readonly title: string;
  readonly lead?: string;
  readonly children: React.ReactNode;
  /** The way back (text) and the way on, pinned at the foot. */
  readonly back?: React.ReactNode;
  readonly forward?: React.ReactNode;
  /** Back (the gesture, the button) goes back a step; unset, it leaves as usual. */
  readonly onBack?: () => void;
}

/** A step: where it stands, what it is, what it holds scrolling, its foot pinned. */
export function ImportFrame({ step, title, lead, children, back, forward, onBack }: ImportFrameProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const host = useImportHost();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  useFocusEffect(
    useCallback(() => {
      if (!onBack) return undefined;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack();
        return true;
      });
      return () => subscription.remove();
    }, [onBack]),
  );
  const index = IMPORT_STEPS.indexOf(step);
  const own = back !== undefined || forward !== undefined;
  const foot = own ? (
    <>
      {back ?? <View />}
      <View style={styles.footEnd}>{forward}</View>
    </>
  ) : (
    host.foot
  );
  return (
    <View style={styles.screen}>
      <EdgeScrollView key={step} style={host.top ? { marginTop: host.top } : null} contentContainerStyle={[styles.content, host.embedded ? styles.embedded : null]} keyboardShouldPersistTaps="handled">
        {host.head}
        <View style={styles.head}>
          <View style={styles.progress} accessible accessibilityLabel={`${IMPORT_STEP_NAMES[step]} · ${importProgress(step)}`}>
            {IMPORT_STEPS.map((each, at) => (
              <View key={each} style={styles.mark}>
                <View style={[styles.dot, { backgroundColor: at <= index ? theme.color.focus : theme.color.edge }]} />
                <AppText variant="labelSmall" color={each === step ? theme.color.ink : theme.color.inkMuted}>
                  {IMPORT_STEP_NAMES[each]}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="title" accessibilityRole="header">
            {title}
          </AppText>
          {lead ? (
            <AppText variant="body" color={theme.color.inkMuted}>
              {lead}
            </AppText>
          ) : null}
        </View>
        {children}
      </EdgeScrollView>
      {foot && !keyboard ? <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>{foot}</View> : null}
    </View>
  );
}

/** A sheet of the wizard, titled or not: the settings' own. */
export function ImportSheet({ title, children }: { title?: string; children: React.ReactNode }) {
  return <Section title={title}>{children}</Section>;
}

// ── the source ──────────────────────────────────────────────────────────────

/** How to get the file, step by step, each numbered on its small well (a count, not a choice). */
export function ImportInstructions({ steps }: { steps: readonly string[] }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.steps}>
      {steps.map((text, index) => (
        <View key={text} style={styles.step}>
          <Organic style={[styles.stepNumber, { backgroundColor: theme.color.paperHigh }]}>
            <AppText variant="labelSmall" color={theme.color.ink}>
              {index + 1}
            </AppText>
          </Organic>
          <AppText variant="body" style={styles.flex}>
            {text}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** A sheet's inner block: its words 16 in, a gap between them. */
export function ImportBlock({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.block}>{children}</View>;
}

// ── counts ──────────────────────────────────────────────────────────────────

export interface CountLine {
  readonly icon: GlyphName;
  readonly text: string;
  readonly meta?: string | null;
}

/** What a file holds, a row each: its glyph, the count, what it means. */
export function ImportCounts({ lines }: { lines: readonly CountLine[] }) {
  return (
    <>
      {lines.map(line => (
        <ListRow key={line.text} icon={line.icon} title={line.text} supporting={line.meta ?? undefined} />
      ))}
    </>
  );
}

// ── the preview ─────────────────────────────────────────────────────────────

export interface PreviewChoice {
  readonly isOn: (entry: PreviewEntry) => boolean;
  readonly toggle: (entry: PreviewEntry) => void;
  readonly can?: (entry: PreviewEntry) => boolean;
}

export interface ImportPreviewProps {
  readonly entries: readonly PreviewEntry[];
  readonly choice?: PreviewChoice;
  /** What an item shows under its words (a Keep list's lines without a link, and their choices). */
  readonly extra?: (entry: PreviewEntry) => React.ReactNode;
}

/** Every item with its fate: filtered by fate, searched by its words, a page at a time. */
export function ImportPreview({ entries, choice, extra }: ImportPreviewProps) {
  const styles = useThemedStyles(makeStyles);
  const [fate, setFate] = useState<ImportFate | null>(null);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PREVIEW_PAGE);
  const counts = fateCounts(entries);
  const found = filterPreview(entries, fate, query);
  const visible = found.slice(0, shown);
  const pick = (next: ImportFate | null): void => {
    setFate(next);
    setShown(PREVIEW_PAGE);
  };
  return (
    <Section>
      {counts.length > 1 ? (
        <View style={styles.filters} accessibilityRole="radiogroup">
          <FilterChip checked={fate === null} label={IMPORT_WORDS.allFates} count={entries.length} onPress={() => pick(null)} />
          {counts.map(({ fate: each, count }) => (
            <FilterChip key={each} checked={fate === each} label={IMPORT_FATE_NAMES[each]} count={count} onPress={() => pick(each)} />
          ))}
        </View>
      ) : null}
      {entries.length > 8 ? (
        <View style={styles.search}>
          <TextField
            kind="search"
            accessibilityLabel={IMPORT_WORDS.search}
            placeholder={IMPORT_WORDS.search}
            value={query}
            onChangeText={value => {
              setQuery(value);
              setShown(PREVIEW_PAGE);
            }}
          />
        </View>
      ) : null}
      {visible.length === 0 ? (
        <EmptyLine size="body" glyph="search" text={previewEmptyWords(query)} replayKey={`${fate ?? ''}${query}`} style={styles.block} />
      ) : (
        visible.map((entry, at) => <PreviewItem key={entry.key} entry={entry} choice={choice} extra={extra} first={at === 0} />)
      )}
      {found.length > shown ? (
        <View style={styles.more}>
          <AppText variant="meta">{shownOfWords(shown, found.length)}</AppText>
          <Button kind="text" small label={showMoreWords(shown, found.length)} onPress={() => setShown(count => count + PREVIEW_PAGE)} />
        </View>
      ) : null}
    </Section>
  );
}

function FilterChip({ checked, label, count, onPress }: { checked: boolean; label: string; count: number; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <Tappable accessibilityRole="radio" accessibilityState={{ checked }} accessibilityLabel={`${label}, ${count}`} onPress={onPress} style={[styles.chip, checked ? { backgroundColor: theme.color.actionContainer, borderColor: theme.color.actionContainer } : null]}>
      <AppText variant="label" color={checked ? theme.color.onActionContainer : theme.color.ink}>
        {label}
      </AppText>
      <AppText variant="label" color={checked ? theme.color.onActionContainer : theme.color.inkMuted}>
        {String(count)}
      </AppText>
    </Tappable>
  );
}

function PreviewItem({ entry, choice, extra, first }: { entry: PreviewEntry; choice?: PreviewChoice; extra?: (entry: PreviewEntry) => React.ReactNode; first: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const can = choice ? (choice.can?.(entry) ?? true) : false;
  const on = choice ? choice.isOn(entry) : true;
  const fate: ImportFate = on ? entry.fate : 'skip';
  const more = extra?.(entry);
  return (
    <View style={[styles.item, first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline }]}>
      {choice && can ? (
        <View style={styles.itemBox}>
          <Checkbox checked={on} onToggle={() => choice.toggle(entry)} label={t('Import {item}', { item: entry.title })} />
        </View>
      ) : (
        <View style={styles.itemGlyph}>
          <Icon name={entry.glyph as GlyphName} size={22} color={theme.color.inkMuted} />
        </View>
      )}
      <View style={styles.flex}>
        <AppText variant="body" color={on ? theme.color.ink : theme.color.inkMuted}>
          {entry.title}
        </AppText>
        {entry.detail ? <AppText variant="meta">{entry.detail}</AppText> : null}
        {entry.why ? <AppText variant="meta">{entry.why}</AppText> : null}
        {entry.note ? <AppText variant="meta">{entry.note}</AppText> : null}
        {more ? <View style={styles.itemExtra}>{more}</View> : null}
      </View>
      <View style={[styles.tag, tagColors(theme, fate)]}>
        <AppText variant="labelSmall" color={fate === 'new' ? theme.color.onActionContainer : fate === 'same' ? theme.color.inkMuted : theme.color.ink}>
          {IMPORT_FATE_NAMES[fate]}
        </AppText>
      </View>
    </View>
  );
}

/** A fate's tag: a small label on its tone's wash, never a pebble (it is not a choice). */
function tagColors(theme: Theme, fate: ImportFate): { backgroundColor: string } {
  switch (fate) {
    case 'new':
      return { backgroundColor: theme.color.actionContainer };
    case 'update':
      return { backgroundColor: mix(theme.color.paper, theme.color.leaf, 0.22) };
    case 'same':
      return { backgroundColor: theme.color.paperHigh };
    case 'skip':
      return { backgroundColor: mix(theme.color.paper, theme.color.waiting, 0.18) };
  }
}

// ── choices ─────────────────────────────────────────────────────────────────

/** A choice that is on or off: the row is the switch. */
export function ChoiceSwitch({ title, meta, checked, onChange }: { title: string; meta?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <SwitchRow title={title} supporting={meta} value={checked} onChange={onChange} />;
}

export interface ChoiceOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly meta?: string;
}

/** One of a few: the choice's name over a radio row each, the chosen one ticked. */
export function ChoiceRadios<V extends string>({ title, meta, value, options, onChange }: { title: string; meta?: string; value: V; options: readonly ChoiceOption<V>[]; onChange: (value: V) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <>
      <View style={styles.block}>
        <AppText variant="bodyStrong">{title}</AppText>
        {meta ? <AppText variant="meta">{meta}</AppText> : null}
      </View>
      {options.map(option => {
        const chosen = option.value === value;
        return (
          <ListRow
            key={option.value}
            title={option.label}
            supporting={option.meta}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen }}
            onPress={() => onChange(option.value)}
            leading={<Icon name={chosen ? 'check' : 'box'} size={22} color={chosen ? theme.color.focus : 'transparent'} />}
          />
        );
      })}
    </>
  );
}

// ── progress and report ─────────────────────────────────────────────────────

/** What is being written, and how far along (null: not counted yet). */
export function ImportProgress({ label, done, total }: { label: string; done?: number; total?: number }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const counted = done !== undefined && total !== undefined && total > 0;
  return (
    <Section>
      <View style={styles.block} accessibilityLiveRegion="polite">
        <AppText variant="body">{label}</AppText>
        <View style={styles.meter} accessibilityRole="progressbar" accessibilityValue={counted ? { min: 0, max: total, now: done } : undefined}>
          <View style={[styles.meterFill, { backgroundColor: theme.color.action, width: counted ? `${Math.round((done / total) * 100)}%` : '100%', opacity: counted ? 1 : 0.35 }]} />
        </View>
      </View>
    </Section>
  );
}

/** What came in, then what was left out and why; the app's actions under it. The step's title says it is done (`IMPORT_WORDS.doneTitle`, or the app's own words). */
export function ImportReport({ imported, skipped, children }: { imported: readonly string[]; skipped: readonly string[]; children?: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <>
      <Section>
        <View style={styles.block}>
          {imported.length > 0 ? imported.map(line => <AppText key={line} variant="body">{line}</AppText>) : <EmptyLine size="body" text={IMPORT_WORDS.nothingNew} />}
        </View>
      </Section>
      {skipped.length > 0 ? (
        <Section title={IMPORT_WORDS.skipped}>
          <View style={styles.block}>
            {skipped.map(line => (
              <AppText key={line} variant="meta">
                {line}
              </AppText>
            ))}
          </View>
        </Section>
      ) : null}
      {children}
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1 },
    content: { padding: 12, paddingBottom: 32, gap: 20 },
    embedded: { paddingTop: 24 },
    // In line with what the panels hold (16 in from their edge).
    head: { paddingHorizontal: 16, gap: 10 },
    progress: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginBottom: 4 },
    mark: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 6, height: 6, ...corners(SHAPES.dot) },
    // Under a footer's edge, as a form's foot (`FormFoot`), the way back at its start and the way on at its end.
    foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 12, ...footEdge(theme) },
    footEnd: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, flexShrink: 1 },
    flex: { flex: 1 },
    block: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
    steps: { gap: 12 },
    step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    // A count, not a choice: a small round well, never matcha, never a pebble; centred on its step's first line (23).
    stepNumber: { width: 24, height: 24, ...corners(SHAPES.dot), alignItems: 'center', justifyContent: 'center' },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.color.hairline, backgroundColor: theme.color.paper, ...corners(SHAPES.chip) },
    search: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 12 },
    // The box's target overhangs the 24 slot, so its words start where the glyphs' rows do.
    itemBox: { width: 24, alignItems: 'center', marginTop: -10 },
    itemGlyph: { width: 24, alignItems: 'center', paddingTop: 1 },
    itemExtra: { marginTop: 8 },
    tag: { paddingHorizontal: 8, paddingVertical: 2, ...corners(SHAPES.small) },
    more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 16, paddingRight: 6, paddingBottom: 8 },
    meter: { height: 10, overflow: 'hidden', backgroundColor: theme.color.paperHigh, borderWidth: 1, borderColor: theme.color.outline, ...corners(SHAPES.detail) },
    meterFill: { height: '100%', ...corners(SHAPES.detail) },
  });
