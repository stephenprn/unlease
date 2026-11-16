/**
 * Opening an alarm's editor over the page on screen (`/clock/alarm/<id>`, `/clock/new`), the page
 * kept under it as the route's background, so closing it lands back there. A new alarm may come with
 * its time or its label (the spotlight's « Créer une alarme à 7:30 »): `?time=07:30&label=…`.
 */
import { getLocation, navigate, parseRoute } from '@shared/ui/router';
import { HOME, paths } from '../routes';

/** The page under the editor: the page itself, or the one an open editor lies over. */
export function currentPage(): string {
  const here = getLocation();
  const route = parseRoute(here.path);
  if (route.name === 'clockAlarm' || route.name === 'clockNew') return here.state.background ?? HOME;
  return `${here.path}${here.search}`;
}

export function openAlarm(id: string): void {
  navigate(paths.alarm(id), { background: currentPage() });
}

export function openNewAlarm(from: { readonly time?: string; readonly label?: string } = {}): void {
  const query = new URLSearchParams(Object.entries(from).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')).toString();
  navigate(`${paths.newAlarm}${query ? `?${query}` : ''}`, { background: currentPage() });
}
