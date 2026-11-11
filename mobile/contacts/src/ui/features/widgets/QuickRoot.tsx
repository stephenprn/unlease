/**
 * The quick window over the home screen (android/.../widget/QuickActivity): one sheet, « Quels
 * contacts afficher ? », the favourites or one label, each with how many it holds; a pick draws the
 * widget at once and completes its placing. The window is its own scrim.
 */
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { useContactIds, useLabelCounts } from '@app/hooks/useContacts';
import { useLibraryStore } from '@app/store/libraryStore';
import { leaveQuick, pointWidget } from '@app/widgets';

import { EmptyLine, Icon, LabelTag, ListRow, Sheet, SheetScrim, SheetScroll } from '@shared/ui/components';
import { duration } from '@shared/ui/theme/motion';
import { useTheme } from '@shared/ui/theme/ThemeProvider';

export interface QuickLaunch {
  readonly widgetId: number;
  /** What the widget shows now (`favorites`, `label:<id>`); '' while it is being placed. */
  readonly target: string;
  /** The widget is being placed: leaving without a choice cancels it. */
  readonly configuring: boolean;
}

/** A sheet's own exit, then the window. */
const EXIT_MS = duration.exit + 40;

export function QuickRoot({ launch }: { launch: QuickLaunch }) {
  const theme = useTheme();
  const order = useLibraryStore(s => s.labelOrder);
  const labels = useLibraryStore(s => s.labels);
  const counts = useLabelCounts();
  const favorites = useContactIds('favorites').length;
  const [open, setOpen] = useState(true);
  const picked = useRef(false);
  const dismiss = useCallback(() => {
    setOpen(false);
    setTimeout(() => leaveQuick(picked.current), EXIT_MS);
  }, []);
  const pick = (target: string): void => {
    picked.current = true;
    pointWidget(launch.widgetId, target);
    dismiss();
  };
  const check = (target: string) => (launch.target === target ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined);
  return (
    <SheetScrim.Provider value={false}>
      <View style={styles.root}>
        <Sheet visible={open} onDismiss={dismiss} title={launch.configuring ? t('Quels contacts afficher ?') : t('Afficher d’autres contacts')} tall>
          <SheetScroll contentContainerStyle={styles.body}>
            <ListRow title={t('Favoris')} supporting={plural(favorites, 'contact')} icon="star" trailing={check('favorites')} onPress={() => pick('favorites')} />
            {order.map(id => {
              const label = labels[id];
              if (!label) return null;
              return (
                <ListRow
                  key={id}
                  title={label.name}
                  supporting={plural(counts[id] ?? 0, 'contact')}
                  leading={
                    <View style={styles.tag}>
                      <LabelTag color={label.color} size={26} />
                    </View>
                  }
                  trailing={check(`label:${id}`)}
                  onPress={() => pick(`label:${id}`)}
                />
              );
            })}
            {order.length === 0 ? <EmptyLine glyph="tag" text={t('Un libellé créé dans l’application s’ajoute ici.')} slot={24} gap={16} style={styles.note} /> : null}
          </SheetScroll>
        </Sheet>
      </View>
    </SheetScrim.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingBottom: 12 },
  tag: { width: 24, alignItems: 'center' },
  // Its glyph on the rows' icon column, its words on their text column, where the labels' names come.
  note: { paddingHorizontal: 16, paddingVertical: 12 },
});
