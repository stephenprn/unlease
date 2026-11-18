/**
 * Opening a form over the page on screen (an alarm's: `/clock/alarm/<id>`, `/clock/new`; a timer's:
 * `/clock/timer/<id>`, `/clock/timers/new`; the city search: `/clock/world/new`), the page kept under
 * it as the route's background, so closing it lands back there. A new alarm may come with its time or
 * its label (the spotlight's « Créer une alarme à 7:30 »): `?time=07:30&label=…`.
 */
import { getLocation, navigate, parseRoute } from '@shared/ui/router';
import { HOME, paths, placeUnder } from '../routes';

/** The page under a form: the page itself, or the one an open form lies over. */
export function currentPage(): string {
  const here = getLocation();
  const under = placeUnder(parseRoute(here.path));
  if (under) return here.state.background ?? (under.name === 'clockTimers' ? paths.timers : under.name === 'clockWorld' ? paths.world : HOME);
  return `${here.path}${here.search}`;
}

export function openAlarm(id: string): void {
  navigate(paths.alarm(id), { background: currentPage() });
}

export function openNewAlarm(from: { readonly time?: string; readonly label?: string; readonly date?: string } = {}): void {
  const query = new URLSearchParams(Object.entries(from).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')).toString();
  navigate(`${paths.newAlarm}${query ? `?${query}` : ''}`, { background: currentPage() });
}

export function openTimer(id: string): void {
  navigate(paths.timer(id), { background: currentPage() });
}

export function openNewTimer(): void {
  navigate(paths.newTimer, { background: currentPage() });
}

export function openCitySearch(): void {
  navigate(paths.newCity, { background: currentPage() });
}
