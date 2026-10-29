/**
 * "Modules": which link modules a collection shows (`notes/models/modules`), grouped by what they are
 * for, each switched on or off at once. A row says what the module does, which links it shows on,
 * what it costs, and why it would not show here. The web's `ModulesDialog`.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import { t } from '@unlease/core/i18n';
import { shownTitle } from '@unlease/notes/models/entities';
import { MODULE_DESCRIPTIONS, MODULE_FITS, MODULE_GROUPS, MODULE_ICONS, MODULE_NAMES, type LinkModule } from '@unlease/notes/models/modules';
import { lineModules, moduleCost, moduleMissing, withModule } from '@unlease/notes/services/modules';
import { setLineModules } from '@app/store/actions';
import { useLibraryStore } from '@app/store/libraryStore';
import { selectCanRead, selectModel, selectSeerr, selectServer, useSettingsStore } from '@app/store/settingsStore';

import { AppText, Icon, Sheet, SheetScroll, SwitchMark, Tappable } from '../../components';
import { corners } from '../../theme/shape';
import { useTheme } from '../../theme/ThemeProvider';
import { formatUsd } from '../settings/money';

export function ModulesSheet({ id, visible, onDismiss }: { id: string; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Modules')} tall>
      <ModulesBody id={id} />
    </Sheet>
  );
}

function ModulesBody({ id }: { id: string }) {
  const theme = useTheme();
  const line = useLibraryStore(s => s.notes[id]);
  const server = useSettingsStore(selectServer);
  const reading = useSettingsStore(selectCanRead);
  const seerr = useSettingsStore(selectSeerr);
  const model = useSettingsStore(selectModel);
  if (!line) return null;
  const on = lineModules(line);
  const can = { server: server !== null, reading, seerr };
  const turn = (module: LinkModule, value: boolean) => setLineModules(line.id, withModule(line, module, value));

  return (
    <SheetScroll contentContainerStyle={styles.list}>
      <AppText variant="meta" style={styles.lead}>
        {t('Les modules choisis apparaissent sur les liens de {collection} qui s’y prêtent.', { collection: shownTitle(line) })}
      </AppText>
      {MODULE_GROUPS.map(group => (
        <View key={group.title}>
          <AppText variant="section" style={styles.section} accessibilityRole="header">
            {t(group.title)}
          </AppText>
          {group.modules.map(module => {
            const checked = on.includes(module);
            const missing = moduleMissing(module, can);
            return (
              // The whole row is the switch: its name, what it does, then for which links and at what cost, a step quieter (the web's).
              <Tappable key={module} onPress={() => turn(module, !checked)} accessibilityRole="switch" accessibilityState={{ checked }} accessibilityLabel={MODULE_NAMES[module]} style={styles.row}>
                <View style={styles.glyph}>
                  <Icon name={MODULE_ICONS[module]} size={24} color={theme.color.ink} />
                </View>
                <View style={styles.text}>
                  <AppText variant="bodyStrong">{MODULE_NAMES[module]}</AppText>
                  <AppText variant="cardBody">{MODULE_DESCRIPTIONS[module]}</AppText>
                  <AppText variant="meta" style={styles.facts}>{`${MODULE_FITS[module]} · ${moduleCost(module, model, formatUsd)}`}</AppText>
                  {/* Switched on, it would still not show here: what it waits for, in ink. */}
                  {missing ? (
                    <View style={styles.missing}>
                      <Icon name="info" size={14} color={theme.color.ink} />
                      <AppText variant="metaStrong" color={theme.color.ink} style={styles.flex}>
                        {missing}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <SwitchMark checked={checked} />
              </Tappable>
            );
          })}
        </View>
      ))}
    </SheetScroll>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 16 },
  lead: { paddingHorizontal: 8, paddingBottom: 4 },
  // In line with what the rows hold.
  section: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  // A list row's (inset 6, its press inside the sheet), its glyph by the name.
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, marginHorizontal: 6, paddingHorizontal: 10, paddingVertical: 10, ...corners(SHAPES.tab) },
  glyph: { alignSelf: 'flex-start' },
  text: { flex: 1, gap: 2 },
  facts: { marginTop: 2 },
  missing: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flex: { flex: 1 },
});
