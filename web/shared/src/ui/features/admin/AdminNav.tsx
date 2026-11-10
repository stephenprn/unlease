/**
 * The Administration's navigation, in the dock and the drawer in place of the app's: its sections,
 * those every app shares first, then the app's own under its name. Its home is the foot's
 * « Administration ».
 */
import { selectServerApps, useSettingsStore } from '../../../app/store/settings';
import type { Route } from '../../router';
import { NavGlyph, NavRow, NavStill } from '../../navigation/NavParts';
import { adminPath } from '../../router';
import { adminGroups } from './places';

export function AdminNav({ route, onNavigate }: { route: Route; onNavigate: () => void }) {
  const on = useSettingsStore(selectServerApps);
  const section = route.name === 'admin' ? route.section : null;
  return (
    <>
      {adminGroups(on).map(group => (
        <NavStill key={group.app ?? 'shared'} title={group.title}>
          {group.places.map(place => (
            <NavRow key={place.id} to={adminPath(place.id)} label={place.title} leading={<NavGlyph name={place.glyph} />} current={place.id === section} onNavigate={onNavigate} />
          ))}
        </NavStill>
      ))}
    </>
  );
}
