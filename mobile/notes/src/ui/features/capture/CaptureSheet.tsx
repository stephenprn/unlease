/**
 * "Classer un lien": by default Claude reads the link on the server and files it in the right
 * collection; an emblem tab picks one by hand. Trackers come off the address before it is kept.
 * `LinkCaptureSheet` is the sheet itself, shared by the app (`CaptureSheet`) and the quick window
 * the home-screen widgets open over the home screen.
 */
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { APP_NAME } from '@unlease/notes/brand';
import { collectionEmblem } from '@unlease/notes/models/collections';
import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { addedMessage } from '@unlease/notes/services/savedLinks';
import { cleanUrl, extractUrls } from '@unlease/core/services/url';
import { asLineColor } from '@unlease/design/colors';
import { INBOX_ID, shownTitle } from '@unlease/notes/models/entities';
import { addLinks, type PlacedLink } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectCanRead, selectServer, useSettingsStore } from '@app/store/settingsStore';
import { useLines } from '@app/hooks/useLines';
import { closeCapture, selectCaptureOpen, selectCaptureText, showSnack, startTransfer, useUiStore } from '@app/store/uiStore';
import { readClipboard } from '@platform/intake';

import { AppText, Button, Emblem, Icon, Sheet, SheetScroll, Tappable, TextField } from '../../components';
import { navigate } from '../../navigation/navigationRef';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';

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
  const reading = useSettingsStore(selectCanRead);
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
  const submit = () => {
    if (urls.length === 0) {
      showSnack(t('Collez une adresse qui commence par http'), undefined, { tone: 'warning' });
      return;
    }
    onAdded(addLinks(urls, target === 'auto' ? { autoFile: true } : { noteId: target }), target);
  };

  // Chosen: the paper chip ringed in matcha, as a picker marks its choice, so an emblem always sits on paper.
  const chip = (selected: boolean) => [
    styles.target,
    corners(SHAPES.chip),
    { backgroundColor: theme.color.paper },
    selected ? { borderWidth: 2, paddingHorizontal: 13, borderColor: theme.color.focus } : { borderColor: theme.color.hairline },
  ];

  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title}>
      <SheetScroll contentContainerStyle={styles.body}>
        <TextField
          value={text}
          onChangeText={setText}
          placeholder="https://…"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={!initial}
          returnKeyType="done"
          onSubmitEditing={submit}
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
        <AppText variant="metaStrong">{t('Collection')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.targets} keyboardShouldPersistTaps="handled">
          {reading ? (
            <Tappable
              onPress={() => setTarget('auto')}
              accessibilityState={{ selected: target === 'auto' }}
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
              <Tappable key={line.id} onPress={() => setTarget(line.id)} accessibilityState={{ selected }} accessibilityLabel={shownTitle(line)} style={chip(selected)}>
                <Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={24} />
                <AppText variant="label" numberOfLines={1}>
                  {shownTitle(line)}
                </AppText>
              </Tappable>
            );
          })}
        </ScrollView>
        <AppText variant="meta">
          {!server
            ? t('Sans serveur, le lien est gardé tel quel. Claude lit les liens depuis votre serveur {app} : connectez-le dans les réglages.', { app: APP_NAME })
            : !reading
              ? t('Le lien est gardé tel quel : ajoutez une clé API Claude dans les réglages pour qu’il soit lu et rangé.')
              : target === 'auto'
                ? t('Claude lit la page et range le lien dans la bonne collection, ou dans Non classé.')
                : t('Claude lit la page ; le lien reste dans cette collection.')}
        </AppText>
        <View style={styles.actions}>
          {!reading ? <Button kind="text" label={t('Administration')} icon="server" onPress={onAdmin} /> : null}
          <Button label={reading ? t('Classer') : t('Ajouter')} icon="check" disabled={urls.length === 0} onPress={submit} />
        </View>
      </SheetScroll>
    </Sheet>
  );
}

/** The app's own: opened from the board or a collection; what Claude files travels on the transfer panel. */
export function CaptureSheet() {
  const visible = useUiStore(selectCaptureOpen);
  const initial = useUiStore(selectCaptureText);
  return (
    <LinkCaptureSheet
      visible={visible}
      initial={initial}
      onDismiss={closeCapture}
      onAdded={(placed, target) => {
        const auto = target === 'auto';
        if (auto) placed.filter(link => link.existing === null).forEach(link => startTransfer(link.id, link.cleaned));
        const message = addedMessage(placed, auto ? { into: null } : { into: target, announce: true }, useLibraryStore.getState().notes);
        if (message) showSnack(message);
        closeCapture();
      }}
      onAdmin={() => {
        closeCapture();
        navigate('Admin');
      }}
    />
  );
}

const styles = StyleSheet.create({
  body: { gap: 14, paddingHorizontal: 8, paddingBottom: 8 },
  flex: { flex: 1 },
  cleaned: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4 },
  clip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, ...corners(SHAPES.dashed), borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 16 },
  targets: { gap: 8 },
  target: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderWidth: 1, paddingHorizontal: 14, maxWidth: 230 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
});
