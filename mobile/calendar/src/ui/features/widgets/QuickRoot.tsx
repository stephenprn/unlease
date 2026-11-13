/**
 * The quick window over the home screen (android/.../widget/QuickActivity): one sheet, the event a
 * « Compte à rebours » counts to, as it is placed or later from the widget itself; a pick draws the
 * widget at once and completes its placing. The window is its own scrim.
 */
import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { leaveQuick, pointWidget } from '@app/widgets';
import { countdownEventId, countdownTarget } from '@app/widgetPayloads';

import { SheetScrim } from '@shared/ui/components';
import { duration } from '@shared/ui/theme/motion';
import { EventPickerSheet } from './EventPickerSheet';

export interface QuickLaunch {
  readonly widgetId: number;
  /** What the widget counts to now (`event:<id>`); '' while it is being placed. */
  readonly target: string;
  /** The widget is being placed (or set again from the launcher): leaving without a choice cancels it. */
  readonly configuring: boolean;
}

/** A sheet's own exit, then the window. */
const EXIT_MS = duration.exit + 40;

export function QuickRoot({ launch }: { launch: QuickLaunch }) {
  const [open, setOpen] = useState(true);
  const picked = useRef(false);
  const leaving = useRef(false);
  const dismiss = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setOpen(false);
    setTimeout(() => leaveQuick(picked.current), EXIT_MS);
  }, []);
  const pick = (eventId: string): void => {
    if (leaving.current) return;
    picked.current = true;
    pointWidget(launch.widgetId, countdownTarget(eventId));
    dismiss();
  };
  const current = launch.target ? countdownEventId(launch.target) : null;
  return (
    <SheetScrim.Provider value={false}>
      <View style={styles.root}>
        <EventPickerSheet visible={open} title={current ? t('Count down to another event') : t('Count down to which event?')} current={current} onDismiss={dismiss} onPick={pick} />
      </View>
    </SheetScrim.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
