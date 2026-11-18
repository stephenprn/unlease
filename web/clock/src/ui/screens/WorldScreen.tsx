/**
 * « Horloges » on the web (the phone's `WorldTab`): here first, large (the time, the day and this
 * device's city), then the ruler that compares the hours (`TimeRuler`): slid, every card below shows
 * its city's time at that moment, the time here turns to the accent and « Maintenant » brings it back;
 * then a card per city, west to east as a day travels (`CityCard`), each opening its dialog (rename,
 * remove). « Ajouter une ville » (the header, the pebble) opens the search. No city yet, the place
 * says what a world clock is for.
 */
import { useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { clockWords, dayTitle } from '@unlease/calendar/services/eventText';
import { deviceZone, instantToWall } from '@unlease/calendar/services/time';
import { liveWorldClocks, offsetWords, shiftedMoment, zoneCityName } from '@unlease/clock/services/worldClocks';

import { useMinute } from '@shared/app/hooks/useMinute';
import { Button } from '@shared/ui/components/Button';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { useClockStore } from '../../app/store/library';
import { usePrefsStore } from '../../app/store/prefs';
import styles from '../clock.module.css';
import { openCitySearch } from '../features/open';
import tools from '../features/tools.module.css';
import { CityCard } from '../features/world/CityCard';
import { CityDialog } from '../features/world/CityDialog';
import { TimeRuler } from '../features/world/TimeRuler';

export function WorldScreen() {
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const clocks = useClockStore(s => s.worldClocks);
  const now = useMinute();
  const [shift, setShift] = useState(0);
  const [opened, setOpened] = useState<string | null>(null);
  const at = shiftedMoment(now, shift);
  const list = useMemo(() => liveWorldClocks(clocks, now), [clocks, now]);
  const here = useMemo(() => zoneCityName(deviceZone()), []);
  const wall = instantToWall(at, '');
  const shifted = shift !== 0;
  const openedClock = opened ? clocks[opened] : undefined;

  return (
    <div className={styles.screen}>
      <h1 className="sr-only">{t('World clocks')}</h1>
      <div className={tools.here}>
        <p className={tools.hereTime} data-shifted={shifted || undefined}>
          {clockWords(wall.slice(11, 16), twelveHours)}
        </p>
        <p className={`${tools.hereDay} t-body-strong`}>{`${dayTitle(wall.slice(0, 10))} · ${here}`}</p>
      </div>

      <div className={tools.compare}>
        <div className={tools.compareHead}>
          <p className={`${tools.compareWords} t-meta-strong`} data-shifted={shifted || undefined}>{shifted ? t('{gap} from now', { gap: offsetWords(shift) }) : ''}</p>
          {shifted ? (
            <Button kind="text" small icon="restore" onClick={() => setShift(0)}>
              {t('Now')}
            </Button>
          ) : null}
        </div>
        <TimeRuler now={now} shift={shift} onShift={setShift} twelveHours={twelveHours} />
      </div>

      {list.length > 0 ? (
        <ul className={styles.list} aria-label={t('World clocks')}>
          {list.map(clock => (
            <CityCard key={clock.id} clock={clock} at={at} shifted={shifted} twelveHours={twelveHours} onOpen={setOpened} />
          ))}
        </ul>
      ) : (
        <EmptyLine glyph="globe" text={t('Add the cities you follow: a friend’s, a trip’s, your office’s. Their time, day or night there, and how far ahead they are.')} action={{ label: t('Add a city'), onClick: openCitySearch }} />
      )}
      <CityDialog clock={openedClock && openedClock.deletedAt === null ? openedClock : null} onDismiss={() => setOpened(null)} />
    </div>
  );
}
