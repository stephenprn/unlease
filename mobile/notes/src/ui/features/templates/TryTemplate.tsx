/**
 * « Essayer », at the end of a template's form: Claude reads one page with the fields as they stand
 * (saved or not) and shows what it would put in each, writing nothing (`tryFields`). The page is one
 * of the links the template reads, the newest first (picked in a sheet of link rows), or an address
 * typed or pasted. Every field tried is listed in the facts' well, « — » where the page said nothing,
 * then how long it took and what it cost. It shows once the server said Claude has a key; offline the
 * button waits.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { formatNumber, formatUsd } from '@unlease/core/services/format';
import { extractUrls } from '@unlease/core/services/url';
import type { LinkItem } from '@unlease/notes/models/entities';
import type { TemplateField } from '@unlease/notes/models/templates';
import { linkRowText } from '@unlease/notes/services/linkRow';
import { namedFields, tryFields } from '@app/templates';
import { useServerFeature } from '@shared/app/hooks/useServerFeature';
import { selectSyncPhase, useSyncStore } from '@shared/app/store/syncStore';
import { readClipboard } from '@shared/platform/clipboard';

import { AppText, Button, Icon, ListRow, Organic, PickerField, Sheet, SheetScroll, TextField } from '../../components';
import { Section } from '@shared/ui/features/settings/Section';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { KIND_ICONS } from '../links/kindIcon';

/** The links offered, or `ADDRESS`: one typed or pasted. */
const ADDRESS = 'address';

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'trying' }
  | { readonly kind: 'done'; readonly title: string; readonly fields: readonly TemplateField[]; readonly values: Readonly<Record<string, string>>; readonly seconds: number; readonly costUsd: number }
  | { readonly kind: 'failed'; readonly message: string };

export interface TemplateTry {
  readonly links: readonly LinkItem[];
  /** A link's id, or `ADDRESS`. */
  readonly chosen: string;
  readonly address: string;
  readonly problem: string | null;
  readonly phase: Phase;
  readonly picking: boolean;
  setAddress(address: string): void;
  choose(chosen: string): void;
  pickAddress(): void;
  setPicking(picking: boolean): void;
  run(): void;
}

/** The section's state, held by the screen: its link sheet lives at the screen's root, out of the form's scroll. */
export function useTemplateTry(fields: readonly TemplateField[], links: readonly LinkItem[]): TemplateTry {
  const [chosen, setChosen] = useState<string>(() => links[0]?.id ?? ADDRESS);
  const [address, setAddressText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [picking, setPicking] = useState(false);
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  // The link chosen gone (deleted, moved out of what the template reads): the newest one, else an address.
  const current = chosen === ADDRESS || links.some(link => link.id === chosen) ? chosen : (links[0]?.id ?? ADDRESS);

  const setAddress = useCallback((text: string) => {
    setAddressText(text);
    setProblem(null);
  }, []);

  const run = (): void => {
    const url = current === ADDRESS ? extractUrls(address)[0] : links.find(link => link.id === current)?.url;
    if (!url) {
      setProblem(t('Aucun lien ici : collez une adresse, comme https://example.org/page.'));
      return;
    }
    const tried = namedFields(fields);
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    const started = Date.now();
    setPhase({ kind: 'trying' });
    tryFields(url, tried, controller.signal).then(
      answer => {
        if (controller.signal.aborted) return;
        setPhase({ kind: 'done', title: answer.title, fields: tried, values: answer.values, seconds: (Date.now() - started) / 1000, costUsd: answer.costUsd });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setPhase({ kind: 'failed', message: error instanceof Error ? error.message : t('erreur inconnue') });
      },
    );
  };

  return {
    links,
    chosen: current,
    address,
    problem,
    phase,
    picking,
    setAddress,
    choose: next => {
      setChosen(next);
      setProblem(null);
    },
    // « Coller une adresse »: what the clipboard holds, when it is one.
    pickAddress: () => {
      setChosen(ADDRESS);
      setProblem(null);
      void readClipboard().then(text => {
        const url = extractUrls(text)[0];
        if (url) setAddressText(before => before || url);
      });
    },
    setPicking,
    run,
  };
}

export function TrySection({ state, fields }: { state: TemplateTry; fields: readonly TemplateField[] }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const claude = useServerFeature('claude');
  const offline = useSyncStore(selectSyncPhase) === 'offline';
  const { phase } = state;
  const nothing = namedFields(fields).length === 0;
  const picked = state.links.find(link => link.id === state.chosen);
  if (!claude) return null;

  return (
    <Section title={t('Aperçu sur un lien')}>
      <View style={styles.section}>
        <AppText variant="meta">
          {t('Voyez ce que Claude relèverait, sans rien enregistrer.')}
        </AppText>
        {state.links.length > 0 ? (
          <PickerField label={t('Lien')} value={picked ? linkRowText(picked).title : t('Une autre adresse')} icon={picked ? KIND_ICONS[picked.kind] : 'link'} onPress={() => state.setPicking(true)} />
        ) : null}
        {state.chosen === ADDRESS ? (
          <TextField
            label={t('Adresse')}
            kind="url"
            value={state.address}
            onChangeText={state.setAddress}
            placeholder="https://…"
            error={state.problem}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (!nothing && !offline && phase.kind !== 'trying') state.run();
            }}
          />
        ) : null}
        <View style={styles.actions}>
          <Button kind="tonal" icon="sparkle" label={t('Essayer')} busy={phase.kind === 'trying'} disabled={nothing || offline} onPress={state.run} />
        </View>
        {offline ? (
          <AppText variant="meta">
            {t('Hors ligne.')}
          </AppText>
        ) : phase.kind === 'trying' ? (
          <AppText variant="meta" accessibilityLiveRegion="polite">
            {t('Claude lit la page…')}
          </AppText>
        ) : phase.kind === 'failed' ? (
          <View style={styles.problem} accessibilityLiveRegion="polite">
            <View style={styles.problemGlyph}>
              <Icon name="error" size={16} color={theme.color.danger} />
            </View>
            <AppText variant="meta" color={theme.color.danger} style={styles.fill}>
              {phase.message}
            </AppText>
          </View>
        ) : null}
        {phase.kind === 'done' ? <TriedFacts phase={phase} /> : null}
      </View>
    </Section>
  );
}

/** What Claude put in each field, as the link page draws facts: a row each, « — » where the page said nothing. */
function TriedFacts({ phase }: { phase: Extract<Phase, { kind: 'done' }> }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  return (
    <View style={styles.result} accessibilityLiveRegion="polite">
      {phase.title ? (
        <AppText variant="bodyStrong" numberOfLines={2} selectable>
          {phase.title}
        </AppText>
      ) : null}
      {/* In the section's panel, beside its fields: the frame's corner, as theirs (the link page's well is a panel of its own). */}
      <Organic outline="frame" style={styles.facts}>
        {phase.fields.map((field, index) => {
          const value = phase.values[field.id];
          return (
            <View key={field.id} style={[styles.fact, index > 0 ? styles.factRule : null]}>
              <AppText variant="meta" style={styles.factLabel}>
                {field.name}
              </AppText>
              <AppText variant="body" color={value ? undefined : theme.color.inkFaint} style={styles.fill} selectable={!!value} accessibilityLabel={value ? undefined : t('Rien trouvé')}>
                {value ?? '—'}
              </AppText>
            </View>
          );
        })}
      </Organic>
      <AppText variant="meta">
        {t('Lu en {seconds} s · {cost}', { seconds: formatNumber(Math.max(0.1, phase.seconds), 1), cost: formatUsd(phase.costUsd) })}
      </AppText>
    </View>
  );
}

/** The links to try it on, newest first, the one chosen ticked; then « Coller une adresse ». */
export function TryLinkSheet({ state }: { state: TemplateTry }) {
  const theme = useTheme();
  const close = (): void => state.setPicking(false);
  return (
    <Sheet visible={state.picking} onDismiss={close} title={t('Essayer sur')} tall>
      <SheetScroll>
        {state.links.map(link => {
          const { title, source } = linkRowText(link);
          const chosen = link.id === state.chosen;
          return (
            <ListRow
              key={link.id}
              icon={KIND_ICONS[link.kind]}
              title={title}
              supporting={source || undefined}
              trailing={chosen ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              onPress={() => {
                state.choose(link.id);
                close();
              }}
            />
          );
        })}
        <ListRow
          icon="copy"
          title={t('Coller une adresse')}
          trailing={state.chosen === ADDRESS ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
          accessibilityRole="radio"
          accessibilityState={{ checked: state.chosen === ADDRESS }}
          onPress={() => {
            state.pickAddress();
            close();
          }}
        />
      </SheetScroll>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // Inside its panel as Réglages' fields are (the Claude section's): 16 from its edges, its lines on the fields' edge.
    section: { gap: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
    actions: { flexDirection: 'row' },
    problem: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    problemGlyph: { marginTop: 1 },
    fill: { flex: 1 },
    result: { gap: 10 },
    // The link page's facts, number for number (`LinkScreen`).
    facts: { backgroundColor: theme.color.paperHigh, overflow: 'hidden' },
    fact: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
    factRule: { borderTopWidth: 1, borderTopColor: theme.color.paper },
    factLabel: { width: 110, paddingTop: 3.5 },
  });
