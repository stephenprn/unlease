/**
 * Moving in from Google Keep: drop the Takeout archive, see what is in it, choose what the notes
 * made of links become (links Claude files, collections, or notes as they were), import, and read
 * what came in and what was left out. The reading and the records are core's (shared with the
 * phone); this is the browser's door.
 */
import { useRef, useState, type DragEvent } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_LINK } from '@unlease/core/sync/settings';
import { keepNoteName, keepPlanCounts, keepReportLines, linkListNotes, singleLinkNotes, type KeepReport } from '@unlease/notes/services/keepImport';

import type { PreparedImport } from '../../../app/keep/keepImport';
import { selectServerSettings, useServerSettingsStore } from '@shared/app/store/serverSettings';
import { useCanRead } from '../../../app/store/prefs';
import { Button } from '@shared/ui/components/Button';
import { Checkbox, Switch } from '@shared/ui/components/Checkbox';
import { Icon } from '@shared/ui/components/Icon';
import { formatUsd as usd } from '@shared/ui/money';
import { navigate } from '@shared/ui/router';
import { paths } from '../../routes';
import styles from '@shared/ui/features/settings/settings.module.css';
import { OutlineEdge, OutlinedBox, useOutline } from '@shared/ui/components/Outline';

const STEPS = [
  tx('Ouvrez takeout.google.com et connectez-vous.'),
  tx('Désélectionnez tout, puis cochez seulement « Keep ».'),
  tx('Exportez, téléchargez le fichier .zip, puis déposez-le ici (ou les fichiers de son dossier Keep).'),
];

/** The importer (and its unzip) loads on first use: a one-time move-in should not weigh on every visit. */
const importer = () => import('../../../app/keep/keepImport');


type Step =
  | { readonly kind: 'idle'; readonly error?: string }
  | { readonly kind: 'reading' }
  | { readonly kind: 'ready'; readonly prepared: PreparedImport; readonly already: number }
  | { readonly kind: 'importing'; readonly prepared: PreparedImport; readonly already: number; readonly progress: readonly [number, number] | null }
  | { readonly kind: 'done'; readonly report: KeepReport };

export function KeepImport() {
  const reading = useCanRead();
  // The server's model, for what a link read costs: no figure until the server has said (as on the phone).
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? null;
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [convert, setConvert] = useState(true);
  /** The link lists that become collections, by their file in the export. */
  const [collections, setCollections] = useState<ReadonlySet<string>>(new Set());
  const [choosing, setChoosing] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The drop zone in its own outline, dashed.
  const { ref: dropRef, vars: dropVars, d: dropD } = useOutline<HTMLButtonElement>('panel');

  const read = async (files: readonly File[]): Promise<void> => {
    if (files.length === 0) return;
    setStep({ kind: 'reading' });
    const { KeepImportError, alreadyHere, readKeepArchive } = await importer();
    try {
      const prepared = await readKeepArchive(files);
      // Every list becomes a collection unless the person says otherwise.
      setCollections(new Set(linkListNotes(prepared.plan).map(note => note.source)));
      setConvert(true);
      setChoosing(false);
      setStep({ kind: 'ready', prepared, already: alreadyHere(prepared.plan) });
    } catch (error) {
      setStep({ kind: 'idle', error: error instanceof KeepImportError ? error.message : tx('Archive illisible : choisissez le fichier .zip téléchargé depuis Google Takeout.') });
    }
  };

  const run = async (prepared: PreparedImport, already: number): Promise<void> => {
    setStep({ kind: 'importing', prepared, already, progress: null });
    const { runKeepImport } = await importer();
    const report = await runKeepImport(prepared, { singleLinks: convert, collections }, (done, total) => setStep({ kind: 'importing', prepared, already, progress: [done, total] }));
    setStep({ kind: 'done', report });
  };

  if (step.kind === 'done') {
    const { imported, skipped } = keepReportLines(step.report);
    return (
      <div className={styles.block}>
        <h3 className="t-body-strong">{t('Import terminé')}</h3>
        {imported.length > 0 ? (
          <ul className={styles.counts}>
            {imported.map(line => (
              <li key={line} className={`${styles.count} t-body`}>
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-body">{t('Rien de nouveau dans cette archive.')}</p>
        )}
        {skipped.length > 0 ? (
          <>
            <h4 className="t-meta">{t('Laissé de côté')}</h4>
            <ul className={styles.counts}>
              {skipped.map(line => (
                <li key={line} className={`${styles.count} t-meta`}>
                  {line}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className={styles.buttons}>
          <Button onClick={() => navigate(paths.board)}>{t('Voir le tableau')}</Button>
          <Button kind="text" onClick={() => setStep({ kind: 'idle' })}>
            {t('Importer une autre archive')}
          </Button>
        </div>
      </div>
    );
  }

  if (step.kind === 'ready' || step.kind === 'importing') {
    const { plan } = step.prepared;
    const counts = keepPlanCounts(plan);
    const singles = singleLinkNotes(plan).length;
    const lists = linkListNotes(plan);
    const chosenLinks = lists.filter(note => collections.has(note.source)).reduce((sum, note) => sum + (note.links?.length ?? 0), 0);
    const busy = step.kind === 'importing';
    const toggleList = (source: string): void =>
      setCollections(current => {
        const next = new Set(current);
        if (next.has(source)) next.delete(source);
        else next.add(source);
        return next;
      });
    return (
      <div className={styles.block}>
        <h3 className="t-body-strong">{t('Dans cette archive')}</h3>
        <ul className={styles.counts}>
          <li className={styles.count}>
            <Icon name="note" size={22} />
            <span className={styles.rowText}>
              <span className="t-body tabular">{plural(counts.notes, 'note')}</span>
              {step.already > 0 ? <span className="t-meta">{t('{notes} : ignorées, rien ne sera doublé', { notes: plural(step.already, 'note déjà importée', 'notes déjà importées') })}</span> : null}
              {plan.trashed > 0 ? (
                <span className="t-meta">{plan.trashed > 1 ? t('{notes} de la corbeille de Keep seront ignorées', { notes: plural(plan.trashed, 'note') }) : t('{notes} de la corbeille de Keep sera ignorée', { notes: plural(plan.trashed, 'note') })}</span>
              ) : null}
            </span>
          </li>
          <li className={styles.count}>
            <Icon name="tag" size={22} />
            <span className="t-body tabular">{plural(plan.labelNames.length, 'label')}</span>
          </li>
          <li className={styles.count}>
            <Icon name="image" size={22} />
            <span className={styles.rowText}>
              <span className="t-body tabular">{plural(counts.photos, 'photo')}</span>
              {counts.audio > 0 ? <span className="t-meta">{t('{recordings} : seul le texte transcrit est importé', { recordings: plural(counts.audio, 'enregistrement vocal', 'enregistrements vocaux') })}</span> : null}
            </span>
          </li>
          {plan.unreadable.length > 0 ? (
            <li className={styles.count}>
              <Icon name="alert" size={22} />
              <span className={styles.rowText}>
                <span className="t-body">{plural(plan.unreadable.length, 'fichier illisible', 'fichiers illisibles')}</span>
                <span className="t-meta">{`${plan.unreadable.slice(0, 3).join(', ')}${plan.unreadable.length > 3 ? '…' : ''}`}</span>
              </span>
            </li>
          ) : null}
        </ul>
        {singles > 0 ? (
          <OutlinedBox kind="panel" edge={false} className={styles.toggle}>
            <div className={styles.rowText}>
              <p className="t-body-strong">{t('{notes} qu’un lien', { notes: plural(singles, 'note ne contient', 'notes ne contiennent') })}</p>
              <p className="t-meta">
                {reading
                  ? model
                    ? t('En faire des liens que Claude lit et range (environ {cost} chacun).', { cost: usd(CLAUDE_COST_PER_LINK[model]) })
                    : t('En faire des liens que Claude lit et range.')
                  : t('En faire des liens, gardés tels quels dans Non classé : la lecture par Claude est désactivée.')}
              </p>
            </div>
            <Switch checked={convert} onChange={setConvert} label={t('Transformer en liens')} />
          </OutlinedBox>
        ) : null}
        {lists.length > 0 ? (
          <OutlinedBox kind="panel" edge={false} className={styles.toggle}>
            <div className={styles.rowText}>
              <p className="t-body-strong">{t('{notes} de liens', { notes: plural(lists.length, 'note faite', 'notes faites') })}</p>
              <p className="t-meta">
                {t('Chacune peut devenir une collection : le texte autour d’un lien devient son commentaire, un élément coché un lien fait. Sinon, elle reste une note.')}{' '}
                {chosenLinks > 0
                  ? reading
                    ? model
                      ? t('Claude lit {links} (environ {cost} en tout).', { links: plural(chosenLinks, 'lien'), cost: usd(CLAUDE_COST_PER_LINK[model] * chosenLinks) })
                      : t('Claude lit {links}.', { links: plural(chosenLinks, 'lien') })
                    : t('Les liens restent tels quels : la lecture par Claude est désactivée.')
                  : null}
              </p>
              <Button kind="text" onClick={() => setChoosing(open => !open)}>
                {choosing ? t('Masquer la liste') : t('Choisir une par une')}
              </Button>
            </div>
            <Switch
              checked={collections.size === lists.length}
              onChange={all => setCollections(all ? new Set(lists.map(note => note.source)) : new Set())}
              label={t('En faire des collections')}
            />
          </OutlinedBox>
        ) : null}
        {lists.length > 0 && choosing ? (
          <ul className={styles.counts} aria-label={t('Notes faites de liens')}>
            {lists.map(note => (
              <li key={note.source} className={styles.count}>
                <Checkbox checked={collections.has(note.source)} onToggle={() => toggleList(note.source)} label={t('{note} en collection', { note: keepNoteName(note) })} />
                <span className={styles.rowText}>
                  <span className="t-body">{keepNoteName(note)}</span>
                  <span className="t-meta tabular">
                    {collections.has(note.source) ? t('Collection de {links}', { links: plural(note.links?.length ?? 0, 'lien') }) : t('Note gardée telle quelle')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {step.kind === 'importing' && step.progress && step.progress[1] > 0 ? (
          <p className="t-meta tabular" role="status">
            {t('Photos : {done} sur {total}', { done: step.progress[0], total: step.progress[1] })}
          </p>
        ) : null}
        <div className={styles.buttons}>
          <Button icon="download" busy={busy} onClick={() => void run(step.prepared, step.already)}>
            {t('Importer')}
          </Button>
          <Button kind="text" disabled={busy} onClick={() => setStep({ kind: 'idle' })}>
            {t('Annuler')}
          </Button>
        </div>
      </div>
    );
  }

  const onDrop = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setOver(false);
    void read([...event.dataTransfer.files]);
  };

  return (
    <div className={styles.block}>
      <ol className={styles.steps}>
        {STEPS.map((text, index) => (
          <li key={text} className={styles.step}>
            <span className={styles.stepNumber}>{index + 1}</span>
            <span className="t-body">{t(text)}</span>
          </li>
        ))}
      </ol>
      <button
        ref={dropRef}
        type="button"
        className={styles.drop}
        style={dropVars}
        data-over={over || undefined}
        onClick={() => input.current?.click()}
        onDragOver={event => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        disabled={step.kind === 'reading'}
        aria-busy={step.kind === 'reading' || undefined}
      >
        <Icon name="upload" size={28} />
        <span className="t-body-strong">{step.kind === 'reading' ? t('Lecture de l’archive…') : t('Déposez l’archive Takeout (.zip)')}</span>
        <span className="t-meta">{t('ou cliquez pour la choisir')}</span>
        <OutlineEdge d={dropD} />
      </button>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed,.json,.txt,image/*"
        multiple
        hidden
        onChange={event => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void read(files);
        }}
      />
      {step.kind === 'idle' && step.error ? (
        <p className={`${styles.error} t-body`} role="alert">
          {t(step.error)}
        </p>
      ) : null}
      <p className="t-meta">{t('Les notes importées gardent leur date, leur couleur, leurs labels, leur mise en forme et leurs photos. Importer la même archive une seconde fois ne double rien. Rien n’est envoyé ailleurs que sur votre serveur.')}</p>
    </div>
  );
}
