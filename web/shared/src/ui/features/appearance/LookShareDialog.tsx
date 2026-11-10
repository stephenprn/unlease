/**
 * Each web app keeps its own look (the theme, the colours, the ground); « Appliquer aux autres »
 * writes this one's into those of the suite's other web apps the person ticks (all, at first): an
 * open tab of one takes it at once, the others as they open (`applyLookTo`). Three ways to it: the
 * slip after a change of look in Réglages (`useLookShareHint`), the quiet button at the ground's foot
 * (`LookShareButton`), and the dialog they both open (`LookShareDialog`, mounted beside the services'
 * one). The phone's `LookShare`.
 */
import { useEffect, useId, useRef, useState } from 'react';

import { APPS, READY_APPS, type AppId } from '@unlease/core/apps';
import { t } from '@unlease/core/i18n';

import { applyLookTo, selectServerApps, useSettingsStore, type SettingsState } from '../../../app/store/settings';
import { selectLookShareOpen, setLookShareOpen, showSnack, useUiStore } from '../../../app/store/ui';
import { theApp } from '../../../modules';
import { BrandMark } from '../../components/BrandMark';
import { Button } from '../../components/Button';
import { DialogFrame } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { Layer } from '../../components/Layer';
import styles from './appearance.module.css';

/** How long the look must stay put before the slip comes: a person trying swatches is not interrupted. */
const HINT_DELAY_MS = 1200;

/** The suite's other ready apps the server runs (every one until it says), in the suite's order. */
function useOtherApps(): readonly AppId[] {
  const own = theApp().id;
  const on = useSettingsStore(selectServerApps);
  return READY_APPS.filter(id => id !== own && (!on || on.includes(id)));
}

/** The look as one key: the theme, the colours and the ground (the ground's grain is the suite's). */
const lookKeyOf = (state: SettingsState): string => JSON.stringify([state.theme, { ...state.appearance, grain: null }]);

/** Réglages: each time the look changes and settles, a slip says it is this app's, with the way to give it to the others. */
export function useLookShareHint(): void {
  const key = useSettingsStore(lookKeyOf);
  const others = useOtherApps();
  const settled = useRef(key);
  const reachable = useRef(others.length > 0);
  useEffect(() => {
    reachable.current = others.length > 0;
  }, [others.length]);
  useEffect(() => {
    if (key === settled.current) return undefined;
    const timer = setTimeout(() => {
      settled.current = key;
      if (!reachable.current) return;
      showSnack(t('Apparence changée dans {app}', { app: APPS[theApp().id].name }), { label: t('Appliquer aux autres'), run: () => setLookShareOpen(true) });
    }, HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key]);
}

/** The quiet way to it at any time, at the ground's foot, once set up (the first run's look is the suite's). */
export function LookShareButton() {
  const onboarded = useSettingsStore(state => state.onboarded);
  const others = useOtherApps();
  if (!onboarded || others.length === 0) return null;
  return (
    <Button kind="text" small icon="apps" onClick={() => setLookShareOpen(true)}>
      {t('Appliquer aux autres applications…')}
    </Button>
  );
}

export function LookShareDialog() {
  const open = useUiStore(selectLookShareOpen);
  const titleId = useId();
  const close = (): void => setLookShareOpen(false);
  return (
    <Layer open={open} onDismiss={close} labelledBy={titleId}>
      <LookShareBody titleId={titleId} onClose={close} />
    </Layer>
  );
}

/** Mounted as the dialog opens, so every app starts ticked each time. */
function LookShareBody({ titleId, onClose }: { titleId: string; onClose: () => void }) {
  const others = useOtherApps();
  const [left, setLeft] = useState<ReadonlySet<AppId>>(() => new Set());
  const chosen = others.filter(app => !left.has(app));
  const toggle = (app: AppId): void =>
    setLeft(current => {
      const next = new Set(current);
      if (!next.delete(app)) next.add(app);
      return next;
    });
  const apply = (): void => {
    applyLookTo(chosen);
    onClose();
    showSnack(sentWords(chosen), undefined, { tone: 'success' });
  };
  return (
    <DialogFrame
      kind="list"
      title={t('Appliquer cette apparence')}
      titleId={titleId}
      onClose={onClose}
      foot={
        <>
          <Button kind="text" onClick={onClose}>
            {t('Annuler')}
          </Button>
          <Button disabled={chosen.length === 0} onClick={apply}>
            {t('Appliquer')}
          </Button>
        </>
      }
    >
      <p className={`${styles.lookLead} t-body`}>{t('Le thème, les couleurs et le fond de {app}, pour les applications cochées. Chacune les prend à sa prochaine ouverture.', { app: APPS[theApp().id].name })}</p>
      {others.map(app => {
        const on = !left.has(app);
        return (
          <button key={app} type="button" role="checkbox" aria-checked={on} className={styles.lookRow} onClick={() => toggle(app)}>
            <Icon name={on ? 'boxChecked' : 'box'} size={24} />
            <BrandMark app={app} size={28} />
            <span className={`${styles.lookName} t-body`}>{APPS[app].name}</span>
          </button>
        );
      })}
    </DialogFrame>
  );
}

/** « Agenda prendra cette apparence… », « Pages et Agenda prendront… »: the names are brands, the same in every language. */
function sentWords(apps: readonly AppId[]): string {
  const names = apps.map(app => APPS[app].name);
  if (names.length === 1) return t('{app} prendra cette apparence à sa prochaine ouverture.', { app: names[0]! });
  return t('{apps} et {last} prendront cette apparence à leur prochaine ouverture.', { apps: names.slice(0, -1).join(', '), last: names[names.length - 1]! });
}
