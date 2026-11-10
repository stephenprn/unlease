/**
 * The people an event is with, as Agenda shows them on the phone: a face (their photo, or their
 * initials on their own pigment, as Contacts draws them) and their name on a chip, a tap opening
 * them in Contacts.
 */
import React, { memo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { t } from '@unlease/core/i18n';
import { SHAPES } from '@unlease/design/shapes';
import type { Contact } from '@unlease/contacts/models/contacts';
import { avatarColor } from '@unlease/contacts/services/avatar';
import { contactName, initials } from '@unlease/contacts/services/names';
import { useBlobSource } from '@shared/app/hooks/useImageSource';

import { AppText, Icon, IconButton, Organic, Tappable } from '@shared/ui/components';
import { corners } from '@shared/ui/theme/shape';
import { useTheme, useThemedStyles } from '@shared/ui/theme/ThemeProvider';
import type { Theme } from '@shared/ui/theme/theme';
import { fontFamily } from '@shared/ui/theme/typography';

type Face = Pick<Contact, 'id' | 'firstName' | 'lastName' | 'company' | 'emails' | 'phones' | 'photoId'>;

function PersonFaceComponent({ contact, size = 28 }: { contact: Face; size?: number }) {
  const theme = useTheme();
  const source = useBlobSource(contact.photoId);
  const [failed, setFailed] = useState<string | null>(null);
  const swatch = theme.line[avatarColor(contact.id)];
  const letters = initials(contact);
  const photo = source && failed !== source.uri ? source : null;
  const type = { color: swatch.on, fontFamily: fontFamily(theme, 'SemiBold'), fontSize: Math.round(size * (letters.length > 1 ? 0.38 : 0.44)), lineHeight: Math.round(size * 0.52) };
  return (
    <Organic style={[faceStyles.frame, { width: size, height: size, backgroundColor: swatch.fill }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {photo ? (
        <Image source={photo} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setFailed(photo.uri)} />
      ) : letters ? (
        <AppText style={type}>{letters}</AppText>
      ) : (
        <View>
          <Icon name="person" size={Math.round(size * 0.55)} color={swatch.on} />
        </View>
      )}
    </Organic>
  );
}

const faceStyles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', ...corners(SHAPES.small) },
});

export const PersonFace = memo(PersonFaceComponent);

/** A person on a chip: their face and name; a tap opens them, a × (in the form) takes them off. */
export function PersonChip({ contact, onPress, onRemove }: { contact: Contact | null; onPress?: () => void; onRemove?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const name = contact ? contactName(contact) : t('Contact supprimé');
  return (
    <Tappable onPress={onPress} disabled={!onPress} style={[styles.chip, onRemove ? styles.chipRemovable : null]} accessibilityRole={onPress ? 'link' : undefined} accessibilityLabel={name}>
      {contact ? <PersonFace contact={contact} /> : <Icon name="person" size={20} color={theme.color.inkMuted} />}
      <AppText variant="label" numberOfLines={1} color={contact ? undefined : theme.color.inkMuted} style={styles.name}>
        {name}
      </AppText>
      {onRemove ? <IconButton icon="close" size={18} label={t('Retirer {name}', { name })} onPress={onRemove} /> : null}
    </Tappable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, maxWidth: '100%', paddingLeft: 6, paddingRight: 14, backgroundColor: theme.color.field, borderColor: theme.color.hairline, borderWidth: 1, ...corners(SHAPES.chip) },
    chipRemovable: { paddingRight: 0 },
    name: { flexShrink: 1 },
  });
