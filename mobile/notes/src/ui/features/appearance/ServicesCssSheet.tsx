/**
 * « Habiller vos autres services »: the stylesheets that give Seafile, Seerr and Immich this phone's
 * colours and ground (`customCss`), each with where it goes and a copy button, its text shown too
 * (selectable), and Seafile's pictures to save (`servicePictures`). Opened from the ground's section
 * and from the slip that follows a change of colours. The web's `ServicesCssDialog`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CSS_SERVICES, cssServiceName, CUSTOM_CSS_WORDS, customCss, customCssKey, SERVICES_CSS_WORDS, type CssService } from '@unlease/design/customCss';
import { SERVICE_PICTURE_WORDS, SERVICE_PICTURES, SERVICE_PICTURES_WORDS, servicePicture, type ServicePicture } from '@unlease/design/servicePictures';
import { selectAppearance, useSettingsStore } from '@app/store/settingsStore';
import { selectServicesCssOpen, setServicesCssOpen, showSnack, useUiStore } from '@app/store/uiStore';
import { copyText } from '@platform/intake';
import { saveFile } from '@platform/media';

import { AppText, Button, Organic, Sheet, SheetScroll } from '../../components';
import { useThemedStyles } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/theme';

/** How long the colours must stay put before the slip comes: a person trying swatches is not interrupted. */
const HINT_DELAY_MS = 1500;

/** Once a session: the slip already came. */
let hinted = false;

/** Réglages: once the colours or the ground change, a slip says the other services can take them too, with the way to their sheets. */
export function useServicesCssHint(): void {
  const key = useSettingsStore(state => customCssKey(state.appearance));
  const shown = useRef(key);
  useEffect(() => {
    if (hinted || key === shown.current) return;
    const timer = setTimeout(() => {
      hinted = true;
      showSnack(SERVICES_CSS_WORDS.hint, { label: SERVICES_CSS_WORDS.see, run: () => setServicesCssOpen(true) });
    }, HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key]);
}

export function ServicesCssSheet() {
  const styles = useThemedStyles(makeStyles);
  const open = useUiStore(selectServicesCssOpen);
  const appearance = useSettingsStore(selectAppearance);
  const sheets = useMemo(() => CSS_SERVICES.map(service => [service, customCss(service, appearance)] as const), [appearance]);
  return (
    <Sheet visible={open} onDismiss={() => setServicesCssOpen(false)} title={SERVICES_CSS_WORDS.title} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        <AppText variant="meta">{SERVICES_CSS_WORDS.intro}</AppText>
        {sheets.map(([service, css]) => (
          <ServiceSheet key={service} service={service} css={css} />
        ))}
      </SheetScroll>
    </Sheet>
  );
}

/** One service: its name and the copy button, where the sheet goes, and the sheet itself. */
function ServiceSheet({ service, css }: { service: CssService; css: string }) {
  const styles = useThemedStyles(makeStyles);
  const words = CUSTOM_CSS_WORDS[service];
  const copy = () => {
    copyText(css).then(copied => showSnack(copied ? words.copied : SERVICES_CSS_WORDS.notCopied, undefined, { tone: copied ? 'success' : 'error' }));
  };
  return (
    <View style={styles.service}>
      <View style={styles.head}>
        <AppText variant="bodyStrong" accessibilityRole="header">
          {cssServiceName(service)}
        </AppText>
        <Button kind="tonal" small icon="copy" label={SERVICES_CSS_WORDS.copy} accessibilityLabel={words.copy} onPress={copy} />
      </View>
      <AppText variant="meta">{words.where}</AppText>
      <Organic outline="frame" style={styles.code}>
        <ScrollView nestedScrollEnabled contentContainerStyle={styles.codePad}>
          <AppText selectable style={styles.codeText}>
            {css}
          </AppText>
        </ScrollView>
      </Organic>
      {service === 'seafile' ? <ServicePictures /> : null}
    </View>
  );
}

/** Lets the interface answer between two stretches of a picture's making. */
const giveWay = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** Seafile's pictures in this phone's colours: where they go, then one button each, saved through Android's save screen. */
function ServicePictures() {
  const styles = useThemedStyles(makeStyles);
  const appearance = useSettingsStore(selectAppearance);
  const [making, setMaking] = useState<ServicePicture | null>(null);
  const save = async (picture: ServicePicture) => {
    setMaking(picture);
    try {
      const file = await servicePicture(picture, appearance, giveWay);
      const saved = await saveFile(file.name, file.mime, file.bytes);
      if (saved.status === 'ok') showSnack(SERVICE_PICTURE_WORDS[picture].saved, undefined, { tone: 'success' });
      else if (saved.status === 'error') showSnack(SERVICE_PICTURES_WORDS.failed, undefined, { tone: 'error' });
    } catch {
      showSnack(SERVICE_PICTURES_WORDS.failed, undefined, { tone: 'error' });
    } finally {
      setMaking(null);
    }
  };
  return (
    <View style={styles.pictures}>
      <AppText variant="meta">{SERVICE_PICTURES_WORDS.where}</AppText>
      <View style={styles.pictureButtons}>
        {SERVICE_PICTURES.map(picture => (
          <Button
            key={picture}
            kind="tonal"
            small
            icon="download"
            label={SERVICE_PICTURE_WORDS[picture].name}
            accessibilityLabel={SERVICE_PICTURE_WORDS[picture].save}
            busy={making === picture}
            disabled={making !== null}
            onPress={() => void save(picture)}
          />
        ))}
      </View>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: 22, paddingHorizontal: 8, paddingBottom: 12 },
    service: { gap: 8 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    // Seafile's pictures, a step apart from its sheet.
    pictures: { gap: 8, marginTop: 6 },
    pictureButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // The sheet as it is pasted, in the code's well and face, scrolled in place.
    code: { height: 132, backgroundColor: theme.color.paperHigh, overflow: 'hidden' },
    codePad: { paddingHorizontal: 12, paddingVertical: 8 },
    codeText: { fontFamily: 'monospace', fontSize: 12, lineHeight: 18, color: theme.color.ink },
  });
