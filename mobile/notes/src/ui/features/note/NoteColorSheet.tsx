/**
 * A note's colour and paper: a pigment's wash, one of the gradients, and the paper under either.
 * Every swatch is the same round pebble showing what the note becomes; the note itself repaints
 * behind the sheet as you pick. Each group fills the sheet's width in full rows (15 colours in
 * fives, 8 gradients and 8 papers in fours). A named swatch presses inside its own pebble, never as
 * a box around it and its name. The chosen ring fades in and the check pebble settles.
 */
import React, { memo } from 'react';
import { StyleSheet } from 'react-native';

import { gradientSwatch, noteBackdrop } from '@unlease/design/backgrounds';
import { t } from '@unlease/core/i18n';
import {
  LINE_COLORS,
  LINE_COLOR_NAMES,
  NOTE_GRADIENTS,
  NOTE_GRADIENT_NAMES,
  NOTE_PATTERNS,
  NOTE_PATTERN_NAMES,
  isLineColor,
  type NoteColor,
  type NotePattern,
} from '@unlease/design/colors';

import { Sheet, SheetScroll } from '../../components';
import { Swatch, SwatchGroup as Group, swatchCells, swatchTurn as turnIn } from '../../components/Swatch';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

export interface NoteColorSheetProps {
  readonly visible: boolean;
  readonly color: NoteColor | null;
  readonly pattern: NotePattern | null;
  readonly onDismiss: () => void;
  readonly onColor: (color: NoteColor | null) => void;
  readonly onPattern: (pattern: NotePattern | null) => void;
}

/** The paper tile is small: its ruled lines sit closer than a note's. */
const TILE_RULE = { pitch: 11, offset: 14 };

function NoteColorSheetComponent({ visible, color, pattern, onDismiss, onColor, onPattern }: NoteColorSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  // The colours carry no name under them: the chosen one is named beside the group's title.
  const colorName = color === null ? t('Sans couleur') : isLineColor(color) ? LINE_COLOR_NAMES[color] : null;
  return (
    <Sheet visible={visible} onDismiss={onDismiss} title={t('Couleur et papier')} tall>
      <SheetScroll contentContainerStyle={styles.body}>
        <Group title={t('Couleur')} chosen={colorName}>
          <Swatch
            label={t('Sans couleur')}
            selected={color === null}
            turn={0}
            paint={{ backgroundColor: theme.color.paper, borderWidth: 2, borderColor: theme.color.edge }}
            ring="ink"
            struck
            cell={styles.fifth}
            onPress={() => onColor(null)}
          />
          {LINE_COLORS.map((key, index) => (
            // The wash the note will wear, edged in its pigment so neighbours tell apart.
            <Swatch
              key={key}
              label={LINE_COLOR_NAMES[key]}
              selected={key === color}
              turn={turnIn(index + 1, 5)}
              paint={{ backgroundColor: theme.line[key].tint, borderWidth: 2, borderColor: theme.line[key].fill }}
              ring="ink"
              cell={styles.fifth}
              onPress={() => onColor(key)}
            />
          ))}
        </Group>

        <Group title={t('Dégradés')}>
          {NOTE_GRADIENTS.map((key, index) => (
            <Swatch
              key={key}
              label={NOTE_GRADIENT_NAMES[key]}
              name={NOTE_GRADIENT_NAMES[key]}
              selected={key === color}
              turn={turnIn(index, 4)}
              paint={{ ...gradientSwatch(theme.mode, key), borderWidth: 1, borderColor: theme.color.hairline }}
              ring="focus"
              cell={styles.quarter}
              onPress={() => onColor(key)}
            />
          ))}
        </Group>

        <Group title={t('Papier')}>
          {([null, ...NOTE_PATTERNS] as const).map((key, index) => {
            const name = key ? NOTE_PATTERN_NAMES[key] : t('Uni');
            return (
              // The paper over the note's own colour, as the note will wear it.
              <Swatch
                key={name}
                label={name}
                name={name}
                selected={key === pattern}
                turn={turnIn(index + 1, 4)}
                paint={{ ...noteBackdrop(theme.mode, color, key, TILE_RULE), borderWidth: 1, borderColor: theme.color.hairline }}
                ring="focus"
                cell={styles.quarter}
                onPress={() => onPattern(key)}
              />
            );
          })}
        </Group>
      </SheetScroll>
    </Sheet>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    body: { gap: 20, paddingHorizontal: 8, paddingBottom: 16 },
    fifth: swatchCells.fifth,
    quarter: swatchCells.quarter,
  });

export const NoteColorSheet = memo(NoteColorSheetComponent);
