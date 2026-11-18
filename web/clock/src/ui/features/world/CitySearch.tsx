/**
 * « Ajouter une ville » (`/clock/world/new`, the phone's `CityScreen`), over the world clocks: a
 * search over the world's large cities and capitals (`searchCities`: French or English, accents and
 * case aside; a country or a zone finds its cities too), each row its name over its country, its time
 * now and how far ahead it is; a city already kept is ticked. A row picked adds its clock and closes,
 * the slip saying so. Typed nothing, every city by name.
 */
import { useId, useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import type { City } from '@unlease/clock/data/cities';
import { cityName, clockIn, countryName, hasCity, liveWorldClocks, offsetFromHere, offsetWords, searchCities } from '@unlease/clock/services/worldClocks';

import { useMinute } from '@shared/app/hooks/useMinute';
import { showSnack } from '@shared/app/store/ui';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Icon } from '@shared/ui/components/Icon';
import { Layer } from '@shared/ui/components/Layer';
import { addCity } from '../../../app/store/actions';
import { useClockStore } from '../../../app/store/library';
import { usePrefsStore } from '../../../app/store/prefs';
import tools from '../tools.module.css';

/** Rows shown at most: a country or a letter typed narrows them soon enough. */
const MOST = 200;

export function CitySearch({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const titleId = useId();
  const twelveHours = usePrefsStore(s => s.twelveHours);
  const clocks = useClockStore(s => s.worldClocks);
  const now = useMinute();
  const [query, setQuery] = useState('');
  const found = useMemo(() => searchCities(query, MOST), [query]);
  const kept = useMemo(() => liveWorldClocks(clocks, now), [clocks, now]);

  const pick = (city: City): void => {
    const already = hasCity(kept, city);
    addCity(city);
    onClose();
    if (!already) showSnack(t('{city} added', { city: cityName(city) }), undefined, { tone: 'success' });
  };

  return (
    <Layer open={!closing} onDismiss={onClose} routed labelledBy={titleId}>
      <DialogFrame kind="list" title={t('Add a city')} titleId={titleId} onClose={onClose} className={tools.searchFrame}>
        <input
          className={tools.searchField}
          value={query}
          placeholder={t('Search for a city or a country')}
          aria-label={t('Search for a city')}
          autoComplete="off"
          spellCheck={false}
          data-autofocus=""
          onChange={event => setQuery(event.target.value)}
        />
        <ul className={tools.cityRows} aria-label={t('Cities')}>
          {found.map(city => {
            const there = hasCity(kept, city);
            return (
              <li key={city.key}>
                <button type="button" className={tools.cityPick} aria-current={there || undefined} onClick={() => pick(city)}>
                <Icon name="globe" size={24} />
                <span className={tools.cityPickText}>
                  <span className="t-body-strong">{cityName(city)}</span>
                  <span className={`${tools.cityPickHint} t-meta`}>{[countryName(city.country), clockIn(city.zone, now, twelveHours), offsetWords(offsetFromHere(city.zone, now))].filter(Boolean).join(' · ')}</span>
                </span>
                {there ? <Icon name="check" size={20} /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        {found.length === 0 ? <EmptyLine className={tools.searchEmpty} role="status" text={t('No city by that name. Try its country, or a large city nearby in the same time zone.')} /> : null}
      </DialogFrame>
    </Layer>
  );
}
