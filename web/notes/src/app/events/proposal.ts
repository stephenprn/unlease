/**
 * An event Claude proposed (`EventProposal`), as the query of Agenda's new-event address
 * (`/agenda/new?title=…&start=…&end=…&tz=…&place=…&url=…&link=<link id>`, the phone's
 * `unlease-agenda://new?…` the same): Agenda's form opens filled with it, the link mentioned.
 */
import type { EventProposal } from '@unlease/calendar/sync/routes';

export function proposalQuery(proposal: EventProposal, linkId: string | null): string {
  const query = new URLSearchParams();
  query.set('title', proposal.title);
  query.set('start', proposal.start);
  query.set('end', proposal.end);
  if (proposal.timeZone) query.set('tz', proposal.timeZone);
  if (proposal.place) query.set('place', proposal.place);
  if (proposal.url) query.set('url', proposal.url);
  if (proposal.description) query.set('notes', proposal.description);
  if (linkId) query.set('link', linkId);
  return query.toString();
}
