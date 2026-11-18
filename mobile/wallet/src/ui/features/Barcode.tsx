/**
 * A barcode as a till's scanner reads it: black bars on white, drawn by bwip-js as SVG (its React
 * Native build) and shown by react-native-svg. A value its format cannot hold says so instead.
 */
import React, { memo, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { toSVG } from 'bwip-js';

import { t } from '@unlease/core/i18n';
import { BWIP_NAMES, isSquareFormat, type BarcodeFormat } from '@unlease/wallet/models/barcode';
import { AppText } from '@shared/ui/components';

export function barcodeSvg(format: BarcodeFormat, value: string): string | null {
  try {
    return toSVG({ bcid: BWIP_NAMES[format], text: value, scale: 3, height: isSquareFormat(format) ? undefined : 18, includetext: false, barcolor: '1A1817', backgroundcolor: 'FFFFFF', paddingwidth: 4, paddingheight: 4 } as never);
  } catch {
    return null;
  }
}

/** The ratio of a drawn SVG (its viewBox), so it is shown whole at any width. */
function ratioOf(svg: string): number {
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return box ? Number(box[1]) / Number(box[2]) : 3;
}

function BarcodeComponent({ format, value, label }: { format: BarcodeFormat; value: string; label: string }) {
  const { width: screen } = useWindowDimensions();
  const svg = useMemo(() => barcodeSvg(format, value), [format, value]);
  if (!svg) {
    return (
      <AppText variant="body" color="#5C564F" style={styles.none}>
        {t('This number can’t be drawn as a barcode.')}
      </AppText>
    );
  }
  const square = isSquareFormat(format);
  const width = square ? Math.min(260, screen * 0.62) : Math.min(screen - 72, 440);
  const height = square ? width : Math.min(width / ratioOf(svg), 170);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ width, height }}>
      <SvgXml xml={svg} width={width} height={height} />
    </View>
  );
}

export const Barcode = memo(BarcodeComponent);

const styles = StyleSheet.create({ none: { textAlign: 'center' } });
