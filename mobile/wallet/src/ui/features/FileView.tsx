/**
 * One of an item's files, opened for the moment (`app/files`): a picture as itself, at its own ratio;
 * a PDF as a row opening it in the phone's viewer. A well while it opens; a line when it cannot be had
 * (not yet sent from another device, the server out of reach).
 */
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { WalletFile } from '@unlease/wallet/models/item';
import { AppText, ListRow, Organic } from '@shared/ui/components';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { itemKey } from '@app/store/actions';
import { openWalletFile, viewOpenedFile } from '@app/files';
import { showSnack } from '@shared/app/store/uiStore';

export function useOpenedFile(itemId: string, file: WalletFile): string | null | undefined {
  const [uri, setUri] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const key = itemKey(itemId);
    const job = key ? openWalletFile(key, file) : Promise.resolve(null);
    key?.fill(0);
    void job.then(opened => {
      if (live) setUri(opened);
    });
    return () => {
      live = false;
    };
  }, [itemId, file]);
  return uri;
}

export function FileView({ itemId, file, label }: { itemId: string; file: WalletFile; label: string }) {
  const theme = useTheme();
  const uri = useOpenedFile(itemId, file);
  const view = (opened: string): void => {
    if (!viewOpenedFile(opened, file.mime)) showSnack(t('No app on this phone opens PDFs.'), undefined, { tone: 'warning' });
  };
  if (file.mime === 'application/pdf') {
    return <ListRow icon="pdf" title={file.name || t('Open the PDF')} supporting={uri === null ? t('This file can’t be opened here yet.') : undefined} onPress={uri ? () => view(uri) : undefined} />;
  }
  const ratio = file.width > 0 && file.height > 0 ? file.width / file.height : 85.6 / 54;
  return (
    <Organic outline="card" style={[styles.frame, { aspectRatio: ratio, backgroundColor: theme.color.paperHigh }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" accessibilityLabel={label} />
      ) : uri === null ? (
        <View style={styles.missing}>
          <AppText variant="meta" style={styles.missingText}>
            {t('This picture can’t be opened here yet: it may not have reached the server.')}
          </AppText>
        </View>
      ) : null}
    </Organic>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  missingText: { textAlign: 'center' },
});
