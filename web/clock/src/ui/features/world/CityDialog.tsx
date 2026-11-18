/**
 * A world clock opened (the phone's `CitySheet`): its name, which the person may change (« Maman »
 * rather than « Montréal »; emptied, the city's comes back), its country and zone, « Retirer » with
 * its slip's « Annuler ». « OK » (Enter) keeps the name typed. Not an address of its own: it lies
 * over the world clocks, and Escape or Back closes it.
 */
import { useId, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { WORLD_CLOCK_LIMITS, type WorldClock } from '@unlease/clock/models/worldClock';
import { countryName } from '@unlease/clock/services/worldClocks';

import { showUndo } from '@shared/app/store/ui';
import { Button } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { Layer } from '@shared/ui/components/Layer';
import { TextField } from '@shared/ui/components/TextField';
import { removeCity, renameCity } from '../../../app/store/actions';
import styles from '../../clock.module.css';
import tools from '../tools.module.css';

function CityForm({ clock, open, onDismiss }: { clock: WorldClock; open: boolean; onDismiss: () => void }) {
  const titleId = useId();
  const [name, setName] = useState(clock.name);
  const keep = (): void => {
    renameCity(clock.id, name);
    onDismiss();
  };
  const remove = (): void => {
    const undo = removeCity(clock.id);
    onDismiss();
    showUndo(t('{city} removed', { city: clock.name }), undo);
  };
  const where = [countryName(clock.country), clock.zone.replace(/_/g, ' ')].filter(Boolean).join(' · ');
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <DialogFrame
        title={clock.name}
        titleId={titleId}
        onClose={onDismiss}
        className={tools.cityFrame}
        onSubmit={event => {
          event.preventDefault();
          keep();
        }}
        foot={
          <>
            <Button kind="dangerText" icon="trash" className={styles.footStart} onClick={remove}>
              {t('Remove')}
            </Button>
            <Button kind="text" onClick={onDismiss}>
              {t('Cancel')}
            </Button>
            <Button type="submit" icon="check">
              {t('OK')}
            </Button>
          </>
        }
      >
        <p className={`${tools.cityWhere} t-meta`}>{where}</p>
        <TextField label={t('Name')} kind="text" value={name} onChange={setName} maxLength={WORLD_CLOCK_LIMITS.name} enterKeyHint="done" autoFocus placeholder={t('Mum, office…')} />
      </DialogFrame>
    </Layer>
  );
}

/** The city opened, kept while its dialog leaves. */
export function CityDialog({ clock, onDismiss }: { clock: WorldClock | null; onDismiss: () => void }) {
  const [shown, setShown] = useState(clock);
  if (clock && clock !== shown && clock.id !== shown?.id) setShown(clock);
  if (!shown) return null;
  return <CityForm key={shown.id} clock={shown} open={clock !== null} onDismiss={onDismiss} />;
}
