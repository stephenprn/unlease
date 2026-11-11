/**
 * "Classer un lien": by default Claude reads the link on the server and files it in the right
 * collection; an emblem tab picks one by hand. Trackers come off the address before it is kept.
 * `LinkCaptureSheet` is the sheet itself, shared by the app (`CaptureSheet`) and the quick window
 * the home-screen widgets open over the home screen.
 */
import React, { useEffect, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';

import { APP_NAME } from '@unlease/notes/brand';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { isBlank } from '@unlease/core/services/formChecks';
import { addedMessage, addedTone } from '@unlease/notes/services/savedLinks';
import { cleanUrl, extractUrls } from '@unlease/core/services/url';
import { asLineColor } from '@unlease/design/colors';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { addLinks, type PlacedLink } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectServer, useSettingsStore } from '@shared/app/store/settingsStore';
import { useServerFeatureState } from '@shared/app/hooks/useServerFeature';
import { useLines } from '@app/hooks/useLines';
import { showSnack } from '@shared/app/store/uiStore';
import { closeCapture, selectCaptureOpen, selectCaptureText, startTransfer, useCaptureStore } from '@app/store/captureStore';
import { readClipboard } from '@shared/platform/clipboard';

import { AppText, Button, Emblem, FormFoot, Icon, Sheet, SHEET_INSET, SheetScroll, Tappable, TextField, useForm, useUnsaved } from '../../components';
import { navigate } from '../../navigation/navigationRef';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

/** "utm_source, fbclid et 2 autres". */
function removedList(names: readonly string[]): string {
  if (names.length <= 3) return names.join(', ');
  return t('{names} et {count} autres', { names: names.slice(0, 2).join(', '), count: names.length - 2 });
}

/** Where the links went: Claude files them (`auto`), or the collection picked. */
export type LinkTarget = string | 'auto';

export interface LinkCaptureSheetProps {
  readonly visible: boolean;
  /** The address the field opens with (a share, the clipboard). */
  readonly initial: string;
  /** The collection chosen as it opens; otherwise Claude files it (or "Non classé" without reading). */
  readonly preset?: string | null;
  readonly title?: string;
  /** Offers the clipboard's link when the field opened without it. */
  readonly offerClipboard?: boolean;
  readonly onDismiss: () => void;
  /** The links were saved (or found saved already) into `target`. */
  readonly onAdded: (placed: readonly PlacedLink[], target: LinkTarget) => void;
  readonly onAdmin: () => void;
}

export function LinkCaptureSheet({ visible, initial, preset = null, title = t('Classer un lien'), offerClipboard = true, onDismiss, onAdded, onAdmin }: LinkCaptureSheetProps) {
  const theme = useTheme();
  const lines = useLines();
  // Claude files it (« Automatique ») once the server said it has a key; said it has none, the way to the Administration. Not said yet: neither (a link added still waits for its reading).
  const claude = useServerFeatureState('claude');
  const reading = claude === 'on';
  const server = useSettingsStore(selectServer);
  const [text, setText] = useState('');
  const [target, setTarget] = useState<LinkTarget>('auto');
  const [clip, setClip] = useState('');

  useEffect(() => {
    if (!visible) return;
    setText(initial);
    setTarget(preset ?? (reading ? 'auto' : INBOX_ID));
    if (!offerClipboard) return;
    readClipboard().then(value => {
      const url = extractUrls(value)[0] ?? '';
      setClip(url && url !== initial ? url : '');
    });
  }, [visible, initial, preset, reading, offerClipboard]);

  const urls = extractUrls(text);
  const removed = [...new Set(urls.flatMap(url => cleanUrl(url).removed))];
  // Reading on: "Non classé" is what Automatique falls back to, so it is not offered. Off: it is the default, so it leads.
  const others = lines.filter(line => line.id !== INBOX_ID);
  const targets = reading ? others : [...lines.filter(line => line.id === INBOX_ID), ...others];
  const save = () => {
    // The keyboard leaves with the sheet: Android would hand the focus to the board's search field.
    Keyboard.dismiss();
    onAdded(addLinks(urls, target === 'auto' ? { autoFile: true } : { noteId: target }), target);
  };
  // Words with no link in them are said under the field, what was typed kept; the keyboard's « OK » files it.
  const form = useForm({ link: !isBlank(text) && urls.length === 0 ? t('Aucun lien ici : collez une adresse, comme https://example.org/page.') : null }, { order: ['link'], sendOnDone: save });
  // A link typed and not filed is asked about before the sheet closes on it.
  const unsaved = useUnsaved(visible && !isBlank(text) && text.trim() !== initial.trim());
  const dismiss = unsaved.guard(onDismiss);

  // What becomes of the link, under the chips.
  const fate = !server
    ? t('Sans serveur, le lien est gardé tel quel. Claude lit les liens depuis votre serveur {app} : connectez-le dans l’administration.', { app: APP_NAME })
    : claude === 'off'
      ? t('Le lien est gardé tel quel : ajoutez une clé API Claude dans l’administration pour qu’il soit lu et rangé.')
      : !reading
        ? null
        : target === 'auto'
          ? t('Claude lit la page et range le lien dans la bonne collection, ou dans Non classé.')
          : t('Claude lit la page ; le lien reste dans cette collection.');

  // Chosen: the paper chip ringed in matcha, as a picker marks its choice, so an emblem always sits on paper.
  const chip = (selected: boolean) => [
    styles.target,
    corners(SHAPES.chip),
    { backgroundColor: theme.color.paper },
    selected ? { borderWidth: 2, paddingHorizontal: 13, borderColor: theme.color.focus } : { borderColor: theme.color.hairline },
  ];

  return (
    <>
    <Sheet visible={visible} onDismiss={dismiss} title={title}>
      <SheetScroll contentContainerStyle={styles.body}>
        <TextField
          kind="url"
          field={form.field('link')}
          value={text}
          onChangeText={setText}
          placeholder="https://…"
          autoFocus={!initial}
          accessibilityLabel={t('Adresse du lien')}
        />
        {removed.length > 0 ? (
          <View style={styles.cleaned} accessibilityLiveRegion="polite">
            <Icon name="broom" size={18} color={theme.color.link} />
            <AppText variant="meta" style={styles.flex}>
              {removed.length > 1 ? t('Nettoyé : {names} seront retirés de l’adresse.', { names: removedList(removed) }) : t('Nettoyé : {names} sera retiré de l’adresse.', { names: removedList(removed) })}
            </AppText>
          </View>
        ) : null}
        {clip && !text ? (
          <Tappable onPress={() => setText(clip)} accessibilityLabel={t('Coller le lien copié')} style={[styles.clip, { borderColor: theme.color.dashed }]}>
            <Icon name="copy" size={18} color={theme.color.inkMuted} />
            <AppText variant="meta" numberOfLines={1} style={styles.flex}>
              {t('Coller : {link}', { link: clip })}
            </AppText>
          </Tappable>
        ) : null}
        {/* The chips say what they are (emblems and names), and the line under them what happens: no word over them, but for TalkBack. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.targetScroll} contentContainerStyle={styles.targets} keyboardShouldPersistTaps="handled" accessibilityRole="radiogroup" accessibilityLabel={t('Collection')}>
          {reading ? (
            <Tappable
              onPress={() => setTarget('auto')}
              accessibilityRole="radio"
              accessibilityState={{ checked: target === 'auto' }}
              accessibilityLabel={t('Classement automatique par Claude')}
              style={chip(target === 'auto')}
            >
              <Icon name="sparkle" size={20} color={theme.color.ink} solid={target === 'auto'} />
              <AppText variant="label">{t('Automatique')}</AppText>
            </Tappable>
          ) : null}
          {targets.map(line => {
            const selected = target === line.id;
            return (
              <Tappable key={line.id} onPress={() => setTarget(line.id)} accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={shownTitle(line)} style={chip(selected)}>
                <Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={24} />
                <AppText variant="label" numberOfLines={1}>
                  {shownTitle(line)}
                </AppText>
              </Tappable>
            );
          })}
        </ScrollView>
        {fate ? <AppText variant="meta">{fate}</AppText> : null}
      </SheetScroll>
      <FormFoot message={form.message}>
        {claude === 'off' ? <Button kind="text" label={t('Administration')} icon="server" onPress={onAdmin} /> : null}
        <Button label={reading ? t('Classer') : t('Ajouter')} icon="check" disabled={isBlank(text)} onPress={() => void form.submit(save)} />
      </FormFoot>
    </Sheet>
    {unsaved.dialog}
    </>
  );
}

/** The app's own: opened from the board or a collection; what Claude files travels on the transfer panel. */
export function CaptureSheet() {
  const visible = useCaptureStore(selectCaptureOpen);
  const initial = useCaptureStore(selectCaptureText);
  return (
    <LinkCaptureSheet
      visible={visible}
      initial={initial}
      onDismiss={closeCapture}
      onAdded={(placed, target) => {
        const auto = target === 'auto';
        if (auto) placed.filter(link => link.existing === null).forEach(link => startTransfer(link.id, link.cleaned));
        const message = addedMessage(placed, auto ? { into: null } : { into: target, announce: true }, useLibraryStore.getState().notes);
        if (message) showSnack(message, undefined, { tone: addedTone(placed) });
        closeCapture();
      }}
      onAdmin={() => {
        closeCapture();
        navigate('Admin', { section: useSettingsStore.getState().server ? 'reading' : 'server' });
      }}
    />
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingHorizontal: SHEET_INSET, paddingBottom: 8 },
  flex: { flex: 1 },
  cleaned: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4 },
  clip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, ...corners(SHAPES.dashed), borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 16 },
  // The chips scroll out to the sheet's edge, starting on its column.
  targetScroll: { marginHorizontal: -SHEET_INSET },
  targets: { gap: 8, paddingHorizontal: SHEET_INSET },
  target: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderWidth: 1, paddingHorizontal: 14, maxWidth: 230 },
});
