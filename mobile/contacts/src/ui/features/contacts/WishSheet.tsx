/**
 * « Souhaiter »: a birthday's wish sent the way the person picks. One way (only a number to text, only
 * an e-mail) goes at once; several (SMS, WhatsApp, e-mail: those they have) are rows of a sheet, the
 * message they open written quoted under its title, each row saying where it goes. The message is
 * changed, if wished, in the app it opens. Without any way, a slip says so.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { t } from '@unlease/core/i18n';
import type { Contact } from '@unlease/contacts/models/contacts';
import { contactName } from '@unlease/contacts/services/names';
import { WISH_GLYPHS, wishChannelName, wishMessage, type WishWay } from '@unlease/contacts/services/wishes';
import { later } from '@app/later';
import { sendWish, wishWaysHere } from '@app/reach';
import { showSnack } from '@shared/app/store/uiStore';

import { AppText, ListRow, Sheet, SHEET_INSET, SheetScroll } from '@shared/ui/components';

interface Asked {
  readonly name: string;
  readonly message: string;
  readonly ways: readonly WishWay[];
}

export function WishSheet({ asked, visible, onDismiss }: { asked: Asked | null; visible: boolean; onDismiss: () => void }) {
  return (
    <Sheet visible={visible && asked !== null} onDismiss={onDismiss} title={asked ? t('Souhaiter son anniversaire à {name}', { name: asked.name }) : undefined}>
      {asked ? (
        <>
          <AppText variant="meta" style={styles.message}>
            {t('« {message} »', { message: asked.message })}
          </AppText>
          <SheetScroll>
            {asked.ways.map(way => (
              <ListRow
                key={way.channel}
                icon={WISH_GLYPHS[way.channel]}
                title={wishChannelName(way.channel)}
                supporting={way.to}
                onPress={() => {
                  onDismiss();
                  later(sendWish(way));
                }}
              />
            ))}
          </SheetScroll>
        </>
      ) : null}
    </Sheet>
  );
}

/**
 * The wish started from a screen: `wish(contact)` sends it the one way there is or asks which in the
 * sheet (`sheet`, mounted by the screen); `ways` when the screen knows them already (its WhatsApp seen to).
 */
export function useWish(): { wish: (contact: Contact, ways?: readonly WishWay[]) => void; sheet: React.ReactElement } {
  const [asked, setAsked] = useState<Asked | null>(null);
  const [open, setOpen] = useState(false);
  const wish = useCallback((contact: Contact, known?: readonly WishWay[]) => {
    const go = (ways: readonly WishWay[]): void => {
      if (ways.length === 0) showSnack(t('Ni numéro ni e-mail pour lui écrire : « Modifier » en ajoute.'), undefined, { tone: 'warning' });
      else if (ways.length === 1) later(sendWish(ways[0]!));
      else {
        setAsked({ name: contactName(contact), message: wishMessage(contact), ways });
        setOpen(true);
      }
    };
    if (known) go(known);
    else later(wishWaysHere(contact).then(go));
  }, []);
  // What it asked stays while the sheet leaves, so its rows go with it.
  const sheet = <WishSheet asked={asked} visible={open} onDismiss={() => setOpen(false)} />;
  return { wish, sheet };
}

const styles = StyleSheet.create({
  // The message on the sheet's column, under its title, a step closer to it than the rows.
  message: { marginHorizontal: SHEET_INSET, marginTop: -6, marginBottom: 8 },
});
