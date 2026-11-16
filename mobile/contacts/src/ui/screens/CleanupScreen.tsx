/**
 * « Nettoyer les contacts » (Réglages › Données, as on the web): its tools in a sheet, each with its
 * glyph and its state in a line (« 12 numéros sans indicatif », or « Rien à corriger »), the
 * duplicates first (their own screen). A tool's screen says what it does, then lists every change it
 * would make, as the import's preview does: the contact, its value as it is and what it becomes (the
 * part that changes marked), why; ticked when it is safe, unticked when only the person can tell
 * (« Ignorer » sets it aside on this phone), no box where nothing can be done here (« Modifier » opens
 * the contact's form). « Corriger », pinned at the foot, writes those ticked in one batch; the slip
 * takes it back.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@unlease/core/i18n';
import { PREVIEW_PAGE, showMoreWords, shownOfWords } from '@unlease/core/services/importFlow';
import {
  asideKey,
  diffParts,
  CLEANUP_TOOL_WORDS,
  CLEANUP_TOOLS,
  CLEANUP_WORDS,
  cleanupDoneLine,
  cleanupStateLine,
  fixWords,
  isFixingTool,
  shownText,
  type CleanupFinding,
  type CleanupTool,
  type FixingTool,
  type Shown,
} from '@unlease/contacts/services/cleanup';
import { contactName } from '@unlease/contacts/services/names';
import { useCleanupCounts, useCleanups, useContact, useDuplicates } from '@app/hooks/useContacts';
import { applyCleanup } from '@app/store/actions';
import { selectRegion, setCleanupAside, useContactsUiStore } from '@app/store/contactsUi';
import { cleanupRegion, phoneRegion } from '@app/reach';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, Button, Checkbox, EdgeScrollView, EmptyState, footEdge, Ground, Icon, ListRow, PickerField, Tappable, TopBar } from '@shared/ui/components';
import { Section } from '@shared/ui/features/settings/Section';
import { listPressDelay } from '@shared/ui/theme/motion';
import { corners } from '@shared/ui/theme/shape';
import { SHAPES } from '@unlease/design/shapes';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { ContactAvatar } from '../features/contacts/ContactAvatar';
import { callingCountry, CodeSheet } from '../features/contacts/RegionSheet';
import type { ScreenProps } from '../navigation/types';

/** The place: every tool, its state in a line. */
export function CleanupScreen({ navigation }: ScreenProps<'Cleanup'>) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const counts = useCleanupCounts();
  const duplicates = useDuplicates().length;
  const countOf = (tool: CleanupTool): number => (tool === 'duplicates' ? duplicates : counts[tool]);
  // With no country to read national numbers in, the country codes' tool can only ask for one.
  const noCountry = useContactsUiStore(s => cleanupRegion(selectRegion(s)) === null);
  const open = (tool: CleanupTool): void => (tool === 'duplicates' ? navigation.navigate('Duplicates') : navigation.navigate('CleanupTool', { tool }));
  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={CLEANUP_WORDS.title} onBack={() => navigation.goBack()} />
      <EdgeScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}>
        <AppText variant="meta" color={theme.color.inkMuted} style={styles.notice}>
          {CLEANUP_WORDS.lead}
        </AppText>
        <Section>
          {CLEANUP_TOOLS.map(tool => {
            const count = countOf(tool);
            const words = CLEANUP_TOOL_WORDS[tool];
            return (
              <ListRow key={tool} icon={words.glyph} title={t(words.title)} supporting={tool === 'countryCodes' && noCountry ? CLEANUP_WORDS.regionMissing : cleanupStateLine(tool, count)} onPress={() => open(tool)} trailing={<Icon name="chevronRight" size={20} color={theme.color.inkMuted} />} />
            );
          })}
        </Section>
      </EdgeScrollView>
    </View>
  );
}

/** A value as it stands (the part that changes marked in what it becomes), or a sentence saying what stands there. */
function Value({ shown, other, side, off }: { shown: Shown; other: Shown | null; side: 'before' | 'after'; off: boolean }) {
  const theme = useTheme();
  const ink = side === 'before' || off ? theme.color.inkMuted : theme.color.ink;
  if (typeof shown !== 'string') {
    return (
      <AppText variant="body" color={theme.color.inkMuted}>
        {shownText(shown)}
      </AppText>
    );
  }
  // What comes marked as a search match (the peach alone, never an underline).
  const marked: [number, number][] = [];
  if (typeof other === 'string' && side === 'after' && !off) {
    let at = 0;
    for (const part of diffParts(other, shown)) {
      if (part.changed) marked.push([at, at + part.text.length]);
      at += part.text.length;
    }
  }
  return (
    <AppText variant="body" color={ink} highlight={marked}>
      {shown}
    </AppText>
  );
}

function FindingRow({ finding, ticked, first, onToggle, onEdit, onOpen }: { finding: CleanupFinding; ticked: boolean; first: boolean; onToggle: (key: string) => void; onEdit: (id: string) => void; onOpen: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const contact = useContact(finding.contactId);
  if (!contact) return null;
  const name = contactName(contact);
  const fixable = finding.edit !== null;
  const off = fixable && !ticked;
  const sameAsName = typeof finding.before === 'string' && finding.before.trim() === name;
  return (
    <View style={[styles.item, first ? null : styles.itemRule]}>
      {fixable ? (
        <View style={styles.itemBox}>
          <Checkbox checked={ticked} onToggle={() => onToggle(finding.key)} label={t('Fix {name}', { name })} />
        </View>
      ) : (
        <View style={styles.itemGlyph}>
          <Icon name="alert" size={22} color={theme.color.waiting} />
        </View>
      )}
      <View style={styles.column}>
        <Tappable unstable_pressDelay={listPressDelay} onPress={() => onOpen(contact.id)} style={styles.who} accessibilityRole="link" accessibilityLabel={name}>
          <ContactAvatar contact={contact} size={28} />
          <AppText variant="bodyStrong" numberOfLines={1} style={styles.name}>
            {name}
          </AppText>
        </Tappable>
        <View style={styles.change}>
          {/* A name as it is is the row's own name, above: only what it becomes follows. */}
          {sameAsName ? null : <Value shown={finding.before} other={finding.after} side="before" off={off} />}
          {finding.after !== null ? (
            <>
              <Icon name="arrowRight" size={18} color={theme.color.inkMuted} />
              <Value shown={finding.after} other={finding.before} side="after" off={off} />
            </>
          ) : null}
        </View>
        {finding.why ? <AppText variant="meta">{t(finding.why.key, finding.why.params)}</AppText> : null}
        {/* What only the person can tell is set aside here; what cannot be fixed here opens the contact's form. */}
        {!fixable || !finding.ticked ? (
          <View style={styles.itemActions}>
            {fixable ? <Button kind="text" small label={CLEANUP_WORDS.ignore} onPress={() => setCleanupAside(asideKey(finding))} /> : <Button kind="text" small label={t('Edit')} onPress={() => onEdit(contact.id)} />}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** An address naming no tool of its own: the duplicates' screen, or the place. */
function ElsewhereTool({ duplicates, onGo }: { duplicates: boolean; onGo: (duplicates: boolean) => void }) {
  useEffect(() => onGo(duplicates), [duplicates, onGo]);
  return null;
}

export function CleanupToolScreen({ navigation, route }: ScreenProps<'CleanupTool'>) {
  const tool = route.params.tool;
  const go = useCallback((duplicates: boolean) => navigation.replace(duplicates ? 'Duplicates' : 'Cleanup'), [navigation]);
  if (!isFixingTool(tool)) return <ElsewhereTool duplicates={tool === 'duplicates'} onGo={go} />;
  return <ToolScreen tool={tool} onBack={() => navigation.goBack()} onOpen={id => navigation.navigate('Contact', { id })} onEdit={id => navigation.navigate('Edit', { id })} />;
}

function ToolScreen({ tool, onBack, onOpen, onEdit }: { tool: FixingTool; onBack: () => void; onOpen: (id: string) => void; onEdit: (id: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const chosenRegion = useContactsUiStore(selectRegion);
  const fallback = cleanupRegion(chosenRegion);
  // The country national numbers are read in: the « Indicatif par défaut », changed here for this screen alone.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const [picking, setPicking] = useState(false);
  const region = picked === undefined ? fallback : picked;
  const findings = useCleanups(tool, region);
  // The person's own ticks over each finding's default.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState(PREVIEW_PAGE);
  const isTicked = (finding: CleanupFinding): boolean => finding.edit !== null && finding.ticked !== flipped.has(finding.key);
  const fixable = useMemo(() => findings.filter(finding => finding.edit !== null), [findings]);
  const chosen = fixable.filter(isTicked);
  const all = chosen.length === fixable.length;
  const words = CLEANUP_TOOL_WORDS[tool];
  // Over the pinned foot, a little room; with none, the gesture bar's inside the content.
  const footRoom = fixable.length > 0 ? 24 : insets.bottom + 48;

  const toggle = (key: string): void =>
    setFlipped(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const tickAll = (on: boolean): void => setFlipped(new Set(fixable.filter(finding => finding.ticked !== on).map(finding => finding.key)));
  const fix = (): void => {
    const { count, undo } = applyCleanup(tool, region, new Set(chosen.map(finding => finding.key)));
    if (count > 0 && undo) showSnack(cleanupDoneLine(tool, count), { label: t('Undo'), run: undo }, { tone: 'success' });
    setFlipped(new Set());
  };

  return (
    <View style={styles.screen}>
      <Ground />
      <TopBar title={t(words.title)} onBack={onBack} />
      <EdgeScrollView contentContainerStyle={[styles.content, { paddingBottom: footRoom }]}>
        <AppText variant="meta" color={theme.color.inkMuted} style={styles.notice}>
          {t(words.lead)}
        </AppText>
        {tool === 'countryCodes' ? (
          <View style={styles.region}>
            <PickerField label={CLEANUP_WORDS.regionLabel} value={region ? callingCountry(region) : null} placeholder={t('No country code')} onPress={() => setPicking(true)} />
          </View>
        ) : null}
        {findings.length === 0 ? (
          <EmptyState scene="label" title={tool === 'countryCodes' && !region ? CLEANUP_WORDS.regionMissing : CLEANUP_WORDS.allFine} text={tool === 'countryCodes' && !region ? CLEANUP_WORDS.regionNone : t(words.empty)} />
        ) : (
          <>
            {fixable.length > 0 ? (
              <View style={styles.bar}>
                <AppText variant="metaStrong">{t('{chosen} of {total} selected', { chosen: chosen.length, total: fixable.length })}</AppText>
                <Button kind="text" small label={all ? CLEANUP_WORDS.selectNone : CLEANUP_WORDS.selectAll} onPress={() => tickAll(!all)} />
              </View>
            ) : null}
            <Section>
              {findings.slice(0, shown).map((finding, at) => (
                <FindingRow key={finding.key} finding={finding} ticked={isTicked(finding)} first={at === 0} onToggle={toggle} onOpen={onOpen} onEdit={onEdit} />
              ))}
              {findings.length > shown ? (
                <View style={styles.more}>
                  <AppText variant="meta">{shownOfWords(shown, findings.length)}</AppText>
                  <Button kind="text" small label={showMoreWords(shown, findings.length)} onPress={() => setShown(count => count + PREVIEW_PAGE)} />
                </View>
              ) : null}
            </Section>
          </>
        )}
      </EdgeScrollView>
      {/* The one primary under a footer's edge, as a form's foot, over the gesture bar. */}
      {fixable.length > 0 ? (
        <View style={[styles.foot, { paddingBottom: insets.bottom + 12 }]}>
          <Button icon="check" label={fixWords(chosen.length)} disabled={chosen.length === 0} onPress={fix} />
        </View>
      ) : null}
      <CodeSheet visible={picking} title={CLEANUP_WORDS.regionLabel} chosen={region} fallback={fallback ?? phoneRegion()} onChoose={setPicked} onDismiss={() => setPicking(false)} />
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.color.wall },
    content: { padding: 12, gap: 12 },
    notice: { paddingHorizontal: 4 },
    region: { paddingHorizontal: 4 },
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 4, minHeight: 40 },
    // As the import's preview: the box on the words' first line, a hairline between findings.
    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 12 },
    itemRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.color.hairline },
    itemBox: { width: 24, alignItems: 'center', marginTop: -6 },
    itemGlyph: { width: 24, alignItems: 'center', paddingTop: 4 },
    column: { flex: 1, gap: 4 },
    name: { flexShrink: 1 },
    // The contact, opened from its face and its name: its press inside a row's tab corners.
    who: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', maxWidth: '100%', marginLeft: -6, paddingVertical: 2, paddingHorizontal: 6, ...corners(SHAPES.tab) },
    change: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 },
    itemActions: { flexDirection: 'row', marginLeft: -12 },
    more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
    foot: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 12, ...footEdge(theme) },
  });
