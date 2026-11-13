/**
 * « Depuis Immich »: a contact's photo taken from the faces Immich recognised, the ones named like the
 * contact first, searchable by name (`orderImmichPeople`). The face chosen is kept by the server as one
 * of its own pictures (`POST /api/immich/people/:id/photo`), so the contact wears it as any photo,
 * whatever becomes of Immich. The phone's ImmichPeopleSheet.
 */
import { useEffect, useId, useMemo, useState } from 'react';

import { t } from '@unlease/core/i18n';
import { orderImmichPeople, type ImmichPerson, type ImmichPhotoResponse } from '@unlease/core/sync/immich';

import { fetchImmichPeople, takeImmichFace } from '@shared/app/immich';
import { selectServer, useSettingsStore } from '@shared/app/store/settings';
import { showError } from '@shared/app/store/ui';
import { Spinner } from '@shared/ui/components/Button';
import { DialogFrame } from '@shared/ui/components/Dialog';
import { EmptyLine } from '@shared/ui/components/EmptyLine';
import { Layer } from '@shared/ui/components/Layer';
import { TextField } from '@shared/ui/components/TextField';
import { ImmichPicture } from '@shared/ui/features/immich/ImmichPicture';
import immich from '@shared/ui/features/immich/immich.module.css';

type People = { readonly status: 'loading' } | { readonly status: 'failed'; readonly message: string } | { readonly status: 'ready'; readonly people: readonly ImmichPerson[] };

export function ImmichPeopleDialog({ open, name, onDismiss, onChosen }: { open: boolean; name: string; onDismiss: () => void; onChosen: (photo: ImmichPhotoResponse) => void }) {
  const titleId = useId();
  return (
    <Layer open={open} onDismiss={onDismiss} labelledBy={titleId}>
      <DialogFrame title={t('Photo from Immich')} titleId={titleId} onClose={onDismiss}>
        <PeoplePicker name={name} onChosen={onChosen} />
      </DialogFrame>
    </Layer>
  );
}

function PeoplePicker({ name, onChosen }: { name: string; onChosen: (photo: ImmichPhotoResponse) => void }) {
  const server = useSettingsStore(selectServer);
  const [people, setPeople] = useState<People>({ status: 'loading' });
  const [query, setQuery] = useState('');
  const [taking, setTaking] = useState<string | null>(null);
  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    fetchImmichPeople(server, controller.signal).then(
      found => setPeople({ status: 'ready', people: found }),
      error => !controller.signal.aborted && setPeople({ status: 'failed', message: error instanceof Error ? error.message : t('Immich unreachable') }),
    );
    return () => controller.abort();
  }, [server]);
  const shown = useMemo(() => (people.status === 'ready' ? orderImmichPeople(people.people, query, name) : []), [people, query, name]);

  const take = async (person: ImmichPerson): Promise<void> => {
    if (!server || taking) return;
    setTaking(person.id);
    try {
      onChosen(await takeImmichFace(server, person.id));
    } catch (error) {
      showError(error instanceof Error ? error.message : t('Immich unreachable'));
    } finally {
      setTaking(null);
    }
  };

  if (!server) return <EmptyLine text={t('Connect a server first')} />;
  return (
    <>
      <TextField label={t('Search a name')} value={query} onChange={setQuery} autoFocus enterKeyHint="search" />
      {people.status === 'loading' ? (
        <p className="t-meta">{t('Reading Immich…')}</p>
      ) : people.status === 'failed' ? (
        <EmptyLine text={people.message} glyph="alert" />
      ) : shown.length === 0 ? (
        <EmptyLine text={query.trim() ? t('Nobody named “{query}” in Immich.', { query: query.trim() }) : t('Immich hasn’t recognised anyone yet.')} glyph="people" replayKey={query.trim()} />
      ) : (
        <ul className={immich.grid}>
          {shown.map(person => (
            <li key={person.id}>
              <button type="button" className={immich.person} disabled={taking !== null} onClick={() => void take(person)} aria-label={person.name || t('Someone without a name')}>
                <span className={`${immich.tile} ${immich.face}`}>{taking === person.id ? <Spinner /> : <ImmichPicture kind="person" id={person.id} />}</span>
                <span className={`${immich.personName} t-meta`}>{person.name || t('No name')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
