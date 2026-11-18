/**
 * The recovery kit, shown once: its code in eight groups of four, its QR code, and « Enregistrer »
 * (a text file where the person chooses, through Android's own file picker). Never stored by the app.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { t } from '@unlease/core/i18n';
import { APP_NAME } from '@unlease/wallet/brand';
import { utf8 } from '@unlease/wallet/crypto/bytes';
import { showSnack } from '@shared/app/store/uiStore';
import { saveFile } from '@shared/platform/media';
import { AppText, Button, Organic } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

import { barcodeSvg } from '../Barcode';

function kitText(code: string): string {
  return [
    t('{app} recovery kit', { app: APP_NAME }),
    '',
    code,
    '',
    t('This code opens your vault if you forget its passphrase. Keep it on paper, somewhere safe and apart from your devices. Anyone holding it and your server’s token can open your papers.'),
  ].join('\n');
}

export function RecoveryKit({ code }: { code: string }) {
  const theme = useTheme();
  const qr = useMemo(() => barcodeSvg('qr', code), [code]);
  const save = async (): Promise<void> => {
    const saved = await saveFile(`${APP_NAME.toLowerCase()}-kit.txt`, 'text/plain', utf8(kitText(code)));
    if (saved.status === 'ok') showSnack(t('Recovery kit saved'), undefined, { tone: 'success' });
  };
  return (
    <View style={styles.kit}>
      <Organic outline="row" style={[styles.code, { backgroundColor: theme.color.paperHigh }]}>
        <AppText variant="title" selectable style={styles.codeText} accessibilityLabel={t('Recovery code')}>
          {code.replace(/-/g, ' ')}
        </AppText>
      </Organic>
      {qr ? (
        <View style={styles.qr} importantForAccessibility="no-hide-descendants">
          <SvgXml xml={qr} width={148} height={148} />
        </View>
      ) : null}
      <Button kind="tonal" icon="download" label={t('Save as a file')} onPress={() => void save()} />
    </View>
  );
}

const styles = StyleSheet.create({
  kit: { gap: 14, alignItems: 'stretch' },
  code: { paddingVertical: 16, paddingHorizontal: 12 },
  codeText: { textAlign: 'center', fontVariant: ['tabular-nums'], letterSpacing: 1.5 },
  qr: { alignSelf: 'center', padding: 10, backgroundColor: '#FFFFFF', borderRadius: 12 },
});
