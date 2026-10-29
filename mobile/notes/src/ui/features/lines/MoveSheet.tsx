/** "Changer de collection": one tap moves the link to the top of another collection. */
import React from 'react';

import { collectionEmblem } from '@unlease/notes/models/collections';
import { t } from '@unlease/core/i18n';
import { asLineColor } from '@unlease/design/colors';
import { shownHint, shownTitle } from '@unlease/notes/models/entities';
import { useLines } from '@app/hooks/useLines';

import { Emblem, Icon, ListRow, Sheet, SheetScroll } from '../../components';
import { useTheme } from '../../theme/ThemeProvider';

/** `exclude`: collections not offered (those being deleted). */
export function MoveSheet({ visible, currentLineId, onDismiss, onPick, title = t('Changer de collection'), exclude = [] }: { visible: boolean; currentLineId: string | null; onDismiss: () => void; onPick: (lineId: string) => void; title?: string; exclude?: readonly string[] }) {
  const theme = useTheme();
  const lines = useLines().filter(line => !exclude.includes(line.id));
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={title} tall>
      <SheetScroll>
        {lines.map(line => (
          <ListRow
            key={line.id}
            title={shownTitle(line)}
            supporting={shownHint(line) || undefined}
            leading={<Emblem emblem={collectionEmblem(line.id, line.emblem)} color={asLineColor(line.color)} size={34} />}
            trailing={line.id === currentLineId ? <Icon name="check" size={22} color={theme.color.focus} /> : undefined}
            onPress={() => {
              onDismiss();
              if (line.id !== currentLineId) onPick(line.id);
            }}
            // With a collection of its own, the list is a choice among them: TalkBack says which one is current.
            accessibilityRole={currentLineId ? 'radio' : undefined}
            accessibilityState={currentLineId ? { checked: line.id === currentLineId } : undefined}
          />
        ))}
      </SheetScroll>
    </Sheet>
  );
}
