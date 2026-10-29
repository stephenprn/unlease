/**
 * Moving in from Google Keep: drop the Takeout archive, see what is in it,
 * choose whether link-only notes become links, import. The reading and the
 * records are core's (shared with the phone); this is the browser's door.
 */
import { useRef, useState, type DragEvent } from 'react';

import { t, tx } from '@unlease/core/i18n';
import { plural } from '@unlease/core/services/format';
import { CLAUDE_COST_PER_LINK } from '@unlease/core/sync/settings';

import type { ImportCounts, PreparedImport } from '../../../app/keep/keepImport';
import { selectServerSettings, useServerSettingsStore } from '../../../app/store/serverSettings';
import { selectCanRead, useSettingsStore } from '../../../app/store/settings';
import { Button } from '../../components/Button';
import { Switch } from '../../components/Checkbox';
import { Icon } from '../../components/Icon';
import { formatUsd as usd } from '../../money';
import { navigate } from '../../router';
import styles from './settings.module.css';
import { OutlineEdge, OutlinedBox, useOutline } from '../../components/Outline';

const STEPS = [
  tx('Ouvrez takeout.google.com et connectez-vous.'),
  tx('Désélectionnez tout, puis cochez seulement « Keep ».'),
  tx('Exportez, téléchargez le fichier .zip, puis déposez-le ici.'),
];

/** The importer (and its unzip) loads on first use: a one-time move-in should not weigh on every visit. */
const importer = () => import('../../../app/keep/keepImport');


type Step =
  | { readonly kind: 'idle'; readonly error?: string }
  | { readonly kind: 'reading' }
  | { readonly kind: 'ready'; readonly prepared: PreparedImport }
  | { readonly kind: 'importing'; readonly prepared: PreparedImport }
  | { readonly kind: 'done'; readonly counts: ImportCounts };

export function KeepImport() {
  const reading = useSettingsStore(selectCanRead);
  // The server's model, for what a link read costs: no figure until the server has said (as on the phone).
  const model = useServerSettingsStore(selectServerSettings)?.analysis.model ?? null;
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [convert, setConvert] = useState(true);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The drop zone in its own outline, dashed.
  const { ref: dropRef, vars: dropVars, d: dropD } = useOutline<HTMLButtonElement>('panel');

  const read = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setStep({ kind: 'reading' });
    const { KeepImportError, readKeepArchive } = await importer();
    try {
      setStep({ kind: 'ready', prepared: await readKeepArchive(file) });
    } catch (error) {
      setStep({ kind: 'idle', error: error instanceof KeepImportError ? error.message : tx('Archive illisible.') });
    }
  };

  const run = async (prepared: PreparedImport): Promise<void> => {
    setStep({ kind: 'importing', prepared });
    const { runKeepImport } = await importer();
    const counts = await runKeepImport(prepared, convert);
    setStep({ kind: 'done', counts });
  };

  if (step.kind === 'done') {
    const { counts } = step;
    return (
      <div className={styles.block}>
        <h3 className="t-body-strong">{t('Import terminé')}</h3>
        <p className="t-body">
          {[
            plural(counts.notes, 'note importée', 'notes importées'),
            counts.links > 0 ? plural(counts.links, 'lien à lire', 'liens à lire') : null,
            counts.photos > 0 ? plural(counts.photos, 'photo') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <div className={styles.buttons}>
          <Button onClick={() => navigate('/')}>{t('Voir le tableau')}</Button>
          <Button kind="text" onClick={() => setStep({ kind: 'idle' })}>
            {t('Importer une autre archive')}
          </Button>
        </div>
      </div>
    );
  }

  if (step.kind === 'ready' || step.kind === 'importing') {
    const { plan } = step.prepared;
    const links = plan.notes.filter(note => note.onlyUrl).length;
    const photos = plan.notes.reduce((count, note) => count + note.attachments.length, 0);
    return (
      <div className={styles.block}>
        <h3 className="t-body-strong">{t('Dans cette archive')}</h3>
        <ul className={styles.counts}>
          <li className={styles.count}>
            <Icon name="note" size={22} />
            <span className={styles.rowText}>
              <span className="t-body tabular">{plural(plan.notes.length, 'note')}</span>
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
            <span className="t-body tabular">{plural(photos, 'photo')}</span>
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
        {links > 0 ? (
          <OutlinedBox kind="panel" edge={false} className={styles.toggle}>
            <div className={styles.rowText}>
              <p className="t-body-strong">{t('{notes} qu’un lien', { notes: plural(links, 'note ne contient', 'notes ne contiennent') })}</p>
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
        <div className={styles.buttons}>
          <Button icon="download" busy={step.kind === 'importing'} onClick={() => void run(step.prepared)}>
            {t('Importer')}
          </Button>
          <Button kind="text" disabled={step.kind === 'importing'} onClick={() => setStep({ kind: 'idle' })}>
            {t('Annuler')}
          </Button>
        </div>
      </div>
    );
  }

  const onDrop = (event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setOver(false);
    void read(event.dataTransfer.files[0]);
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
        accept=".zip,application/zip,application/x-zip-compressed"
        hidden
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void read(file);
        }}
      />
      {step.kind === 'idle' && step.error ? (
        <p className={`${styles.error} t-body`} role="alert">
          {t(step.error)}
        </p>
      ) : null}
      <p className="t-meta">{t('Les notes importées gardent leur date, leur couleur, leurs labels et leurs photos. Rien n’est envoyé ailleurs que sur votre serveur.')}</p>
    </div>
  );
}
