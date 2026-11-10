/**
 * A contact's face: their photo, or their initials on a pigment of their own (`avatarColor`, the same
 * on every device and on the widgets). Both lie in a picture's frame (`SHAPES.frame`, the continuous
 * corner): a face is a picture, and the pebble never holds text.
 */
import React, { memo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { SHAPES } from '@unlease/design/shapes';
import type { Contact } from '@unlease/contacts/models/contacts';
import { avatarColor } from '@unlease/contacts/services/avatar';
import { initials } from '@unlease/contacts/services/names';
import { useBlobSource } from '@shared/app/hooks/useImageSource';

import { AppText, Icon, Organic } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme } from '@shared/ui/theme/ThemeProvider';
import { fontFamily } from '@shared/ui/theme/typography';

type Face = Pick<Contact, 'id' | 'firstName' | 'lastName' | 'company' | 'emails' | 'phones' | 'photoId'>;

function ContactAvatarComponent({ contact, size }: { contact: Face; size: number }) {
  const theme = useTheme();
  const source = useBlobSource(contact.photoId);
  const [failed, setFailed] = useState<string | null>(null);
  const swatch = theme.line[avatarColor(contact.id)];
  const letters = initials(contact);
  const photo = source && failed !== source.uri ? source : null;
  const type = { color: swatch.on, fontFamily: fontFamily(theme, 'SemiBold'), fontSize: Math.round(size * (letters.length > 1 ? 0.36 : 0.42)), lineHeight: Math.round(size * 0.5) };
  return (
    <Organic style={[styles.frame, { width: size, height: size, backgroundColor: swatch.fill }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {photo ? (
        <Image source={photo} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(photo.uri)} />
      ) : letters ? (
        <AppText style={type}>{letters}</AppText>
      ) : (
        <View>
          <Icon name="person" size={Math.round(size * 0.5)} color={swatch.on} />
        </View>
      )}
    </Organic>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.frame) },
});

export const ContactAvatar = memo(ContactAvatarComponent);
