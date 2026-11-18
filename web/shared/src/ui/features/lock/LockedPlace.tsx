/**
 * A place behind the suite's lock (`app/lock`): Carnet's protected notes, a protected page. What it
 * keeps shows as shapes only (a wall of cards, a page's lines), frosted under the field's veil, and
 * the lock on them: the password, or, forgotten, the server's token, which then asks a new password.
 * Opened, the place's own content takes its place.
 */
import { useId, useState } from 'react';

import { t } from '@unlease/core/i18n';

import { closeLock, openLock, tokenOpensReset, useLockState } from '../../../app/lock';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { OutlinedBox } from '../../components/Outline';
import { TextField } from '../../components/TextField';
import { useForm } from '../../components/useForm';
import { LockPasswordDialog } from './LockPasswordDialog';
import styles from './lock.module.css';

/** What the lock keeps: notes (a wall of cards) or a page (its lines). */
export type LockedGhosts = 'notes' | 'page';

// Heights a wall of notes might have: three columns, each card as tall as some content.
const WALL: readonly (readonly number[])[] = [
  [3, 1, 4],
  [2, 4, 1],
  [4, 2, 2],
];
// A page's paragraphs, as the widths of their lines.
const PAGE: readonly (readonly number[])[] = [
  [96, 100, 88, 54],
  [100, 92, 70],
  [98, 84, 100, 62],
];

function Ghosts({ kind }: { kind: LockedGhosts }) {
  if (kind === 'page') {
    return (
      <div className={`${styles.ghosts} ${styles.page}`} aria-hidden="true">
        <span className={styles.ghostBand} style={{ width: '46%' }} />
        {PAGE.map((lines, paragraph) => (
          <div key={paragraph} className={styles.fields}>
            {lines.map((width, line) => (
              <span key={line} className={styles.ghostLine} style={{ width: `${width}%` }} />
            ))}
            <span className={styles.paragraphGap} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={`${styles.ghosts} ${styles.wall}`} aria-hidden="true">
      {WALL.map((column, index) => (
        <div key={index} className={styles.wallColumn}>
          {column.map((lines, card) => (
            <div key={card} className={styles.ghostCard}>
              <span className={styles.ghostBand} style={{ width: `${48 + ((index + card) % 3) * 14}%` }} />
              {Array.from({ length: lines }, (_, line) => (
                <span key={line} className={styles.ghostLine} style={{ width: `${line === lines - 1 ? 52 : 86}%` }} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export interface LockPanelProps {
  /** What it keeps, in a sentence (« Vos notes protégées s’ouvrent avec le mot de passe. »). */
  readonly what: string;
  /** Inside a dialog that already says « Verrouillé »: the dialog's body, no panel or title of its own. */
  readonly bare?: boolean;
}

/** The lock itself: its password, or the token that replaces a forgotten one. */
export function LockPanel({ what, bare = false }: LockPanelProps) {
  const titleId = useId();
  const { check } = useLockState();
  // No password has reached this device (it was never set, or the lock's record has not synced yet): only the token opens it.
  const [mode, setMode] = useState<'password' | 'token'>(check ? 'password' : 'token');
  const [typed, setTyped] = useState('');
  const [renew, setRenew] = useState(false);
  const form = useForm({ typed: typed.trim() ? null : mode === 'password' ? t('Type the password.') : t('Type the server’s token.') });

  const open = async (): Promise<void> => {
    if (mode === 'password') {
      if (!(await openLock(typed))) {
        form.fail('typed', t('This password doesn’t open the lock.'));
        return;
      }
      setTyped('');
      return;
    }
    if (!tokenOpensReset(typed)) {
      form.fail('typed', t('This isn’t this server’s token.'));
      return;
    }
    setTyped('');
    setRenew(true);
  };

  const words = mode === 'password' ? what : t('Type the server’s token (UNLEASE_TOKEN) to choose a new password.');
  const body = (
    <>
      {bare ? (
        <p className={`${styles.words} t-body`}>{words}</p>
      ) : (
        <div className={styles.head}>
          <span className={styles.pebble} data-pebble-under={1}>
            <Icon name="lock" size={24} />
          </span>
          <div>
            <h2 id={titleId} className="t-title">
              {t('Locked')}
            </h2>
            <p className={`${styles.words} t-meta`}>{words}</p>
          </div>
        </div>
      )}
      <form className={styles.form} onSubmit={form.onSubmit(open)} noValidate>
        <TextField
          label={mode === 'password' ? t('Password') : t('Server’s token')}
          kind="secret"
          revealLabels={mode === 'password' ? { show: t('Show the password'), hide: t('Hide the password') } : { show: t('Show the token'), hide: t('Hide the token') }}
          autoFocus
          value={typed}
          onChange={setTyped}
          field={form.field('typed')}
        />
        <div className={styles.actions}>
          {check ? (
            <Button
              kind="text"
              small
              onClick={() => {
                setMode(mode === 'password' ? 'token' : 'password');
                setTyped('');
                form.reset();
              }}
            >
              {mode === 'password' ? t('Password forgotten?') : t('Use the password')}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" icon={mode === 'password' ? 'unlock' : 'key'} busy={form.busy}>
            {mode === 'password' ? t('Unlock') : t('Continue')}
          </Button>
        </div>
      </form>
      <LockPasswordDialog
        open={renew}
        reason={t('Choose the new password: every device asks it from now on.')}
        onClose={() => {
          setRenew(false);
          setMode('password');
        }}
        trusted
      />
    </>
  );
  if (bare) return <div className={styles.bare}>{body}</div>;
  return (
    <OutlinedBox kind="panel" lift="raised" className={styles.panel} role="region" aria-labelledby={titleId}>
      {body}
    </OutlinedBox>
  );
}

/** A place behind the lock, its shapes frosted under the lock's panel. */
export function LockedPlace({ ghosts, what }: { ghosts: LockedGhosts; what: string }) {
  return (
    <div className={styles.frost}>
      <Ghosts kind={ghosts} />
      <div className={styles.veil}>
        <LockPanel what={what} />
      </div>
    </div>
  );
}

/** « Verrouiller »: shuts the lock now, wherever it was opened in this app. */
export { closeLock };
