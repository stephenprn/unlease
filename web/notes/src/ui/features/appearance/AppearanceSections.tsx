/**
 * The colours and the ground of this browser, as Réglages and the first run show them (the phone's
 * twins): pairs that go together and each colour picked precisely; preset gradients and colours,
 * one's own colour and gradients, and the ground's grain. A choice applies at once; the two editors
 * keep a draft until confirmed.
 */
import { useState, type CSSProperties, type KeyboardEvent } from 'react';

import {
  accentRoles,
  COLOR_ROLE_WORDS,
  COLORS_INFO,
  GROUND_COLORS,
  GROUND_GRADIENTS,
  GROUND_INFO,
  GROUND_NAMES,
  groundPaint,
  PALETTE_COLORS,
  PALETTE_NAMES,
  paletteOf,
  PALETTES,
  presetGradient,
  primaryRoles,
  randomGradient,
  sameGround,
  type Appearance,
  type ColorRole,
  type GroundChoice,
  type GroundPreset,
  type PaletteKey,
} from '@unlease/design/appearance';
import { SERVICES_CSS_WORDS } from '@unlease/design/customCss';
import type { Mode } from '@unlease/design/palette';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';

import { selectAppearance, setAppearance, useSettingsStore } from '../../../app/store/settings';
import { setServicesCssOpen } from '../../../app/store/ui';
import { Button } from '../../components/Button';
import { SwitchMark } from '../../components/Checkbox';
import { Icon } from '../../components/Icon';
import { PebbleEdge } from '../../components/Outline';
import { useShownMode } from '../../appearanceStyle';
import { arrowKeys } from '../note/radioKeys';
import { Section } from '../settings/Section';
import settings from '../settings/settings.module.css';
import { AppearancePreview } from './AppearancePreview';
import styles from './appearance.module.css';
import { ColorDialog } from './ColorDialog';
import { GradientDialog, type GradientDraft } from './GradientDialog';

/** The picker's check: a leaf pebble on paper, settling in as its swatch is chosen. */
function Check() {
  return (
    <span className={styles.check} data-pebble={2}>
      <span className={styles.checkLeaf} data-pebble={2}>
        <Icon name="check" size={14} />
      </span>
    </span>
  );
}

function Heading({ title, chosen }: { title: string; chosen?: string | null }) {
  return (
    <div className={styles.heading}>
      <h3 className="t-meta-strong">{title}</h3>
      {chosen ? <span className={`${styles.chosenName} t-meta`}>{chosen}</span> : null}
    </div>
  );
}

/** A pair's pebble: its primary and its accent as this theme shows them, cut on the diagonal. */
function pairPaint(key: PaletteKey, mode: Mode): CSSProperties {
  const primary = primaryRoles(PALETTE_COLORS[key].primary, mode).leaf;
  const accent = accentRoles(PALETTE_COLORS[key].accent, mode).action;
  return { '--pebble-fill': `linear-gradient(135deg, ${primary} 0%, ${primary} 50%, ${accent} 50%, ${accent} 100%)` } as CSSProperties;
}

/** A ground's pebble, painted as the screen will be in this theme. */
function groundStyle(ground: GroundChoice, mode: Mode): CSSProperties {
  const paint = groundPaint(ground, mode);
  return { backgroundColor: paint.base, backgroundImage: paint.layers.join(', ') || undefined };
}

/** Keys for a group of swatches whose chosen one may be in another group: the arrows move inside this one. */
function groupKeys<T extends string>(keys: readonly T[], chosen: T | null, choose: (key: T) => void): (event: KeyboardEvent<HTMLElement>) => void {
  return arrowKeys(keys, chosen ?? keys[0]!, choose, key => key);
}

/** The colours: the app by day and at night, the pairs, then each colour on its own. */
export function ColorsSection() {
  const appearance = useSettingsStore(selectAppearance);
  const mode = useShownMode();
  const chosen = paletteOf(appearance.primary, appearance.accent);
  const [editing, setEditing] = useState<{ readonly role: ColorRole; readonly open: boolean }>({ role: 'primary', open: false });
  const choose = (key: PaletteKey): void => setAppearance({ ...appearance, ...PALETTE_COLORS[key] });
  return (
    <Section title={t('Couleurs')} info={COLORS_INFO}>
      <AppearancePreview look={appearance} />
      <div className={styles.groups}>
        <section className={styles.group}>
          <Heading title={t('Palettes')} chosen={chosen ? PALETTE_NAMES[chosen] : t('Sur mesure')} />
          <div className={styles.grid} role="radiogroup" aria-label={t('Palettes')} onKeyDown={groupKeys(PALETTES, chosen, choose)}>
            {PALETTES.map((key, index) => (
              <button key={key} type="button" role="radio" aria-checked={key === chosen} data-key={key} tabIndex={key === (chosen ?? PALETTES[0]) ? 0 : -1} className={styles.option} onClick={() => choose(key)}>
                <span className={`${styles.swatch} ${styles.pair}`} data-pebble-under={pebbleTurn(index)} data-still style={pairPaint(key, mode)}>
                  <PebbleEdge turn={pebbleTurn(index)} />
                  {key === chosen ? <Check /> : null}
                </span>
                <span className={`${styles.name} t-label-small`}>{PALETTE_NAMES[key]}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
      {/* Or each colour on its own: what it paints, in the words of the screens it paints. */}
      <section className={styles.roles}>
        <h3 className={`${styles.rolesHead} t-meta-strong`}>{t('Sur mesure')}</h3>
        {(['primary', 'accent'] as const).map((role, index) => (
          <button key={role} type="button" className={settings.row} aria-label={t('{name} : {color}', { name: COLOR_ROLE_WORDS[role].title, color: appearance[role] })} onClick={() => setEditing({ role, open: true })}>
            <span className={styles.roleSwatch} data-pebble-under={pebbleTurn(index + 1)} data-still style={{ '--pebble-fill': appearance[role] } as CSSProperties} aria-hidden="true">
              <PebbleEdge turn={pebbleTurn(index + 1)} />
            </span>
            <span className={settings.rowText}>
              <span className="t-body">{COLOR_ROLE_WORDS[role].name}</span>
              <span className="t-meta">{COLOR_ROLE_WORDS[role].hint}</span>
            </span>
            <Icon name="chevronRight" size={20} />
          </button>
        ))}
      </section>
      <ColorDialog
        open={editing.open}
        target={editing.role}
        initial={appearance[editing.role]}
        appearance={appearance}
        onCancel={() => setEditing(current => ({ ...current, open: false }))}
        onChoose={color => {
          setAppearance({ ...appearance, [editing.role]: color });
          setEditing(current => ({ ...current, open: false }));
        }}
      />
    </Section>
  );
}

/** One group of preset grounds. */
function PresetGroup({ title, keys, appearance, mode }: { title: string; keys: readonly GroundPreset[]; appearance: Appearance; mode: Mode }) {
  const chosen = appearance.ground.kind === 'preset' && keys.includes(appearance.ground.key) ? appearance.ground.key : null;
  const choose = (key: GroundPreset): void => setAppearance({ ...appearance, ground: { kind: 'preset', key } });
  return (
    <section className={styles.group}>
      <Heading title={title} chosen={chosen ? GROUND_NAMES[chosen] : null} />
      <div className={styles.grid} role="radiogroup" aria-label={title} onKeyDown={groupKeys(keys, chosen, choose)}>
        {keys.map((key, index) => (
          <button key={key} type="button" role="radio" aria-checked={key === chosen} data-key={key} tabIndex={key === (chosen ?? keys[0]) ? 0 : -1} className={styles.option} onClick={() => choose(key)}>
            <span className={`${styles.swatch} ${styles.ground}`} data-pebble={pebbleTurn(index)} data-still style={groundStyle({ kind: 'preset', key }, mode)}>
              <PebbleEdge turn={pebbleTurn(index)} />
              {key === chosen ? <Check /> : null}
            </span>
            <span className={`${styles.name} t-label-small`}>{GROUND_NAMES[key]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** The ground: the presets, one's own, its grain, and the way to the other services' sheets. */
export function GroundSection() {
  const appearance = useSettingsStore(selectAppearance);
  const mode = useShownMode();
  const [colorOpen, setColorOpen] = useState(false);
  const [gradient, setGradient] = useState<{ readonly open: boolean; readonly draft: GradientDraft }>(() => ({ open: false, draft: { spec: randomGradient(1), grain: appearance.grain } }));
  const { ground, ownColor, ownGradient } = appearance;
  const own: GroundChoice[] = [...(ownColor ? [{ kind: 'color', color: ownColor } as const] : []), ...(ownGradient ? [{ kind: 'gradient', ...ownGradient } as const] : [])];
  const ownChosen = own.find(choice => sameGround(choice, ground)) ?? null;
  // The editor opens on one's own gradient, else the ground's (a gradient chosen, a preset's clouds), else colours drawn at random.
  const makeGradient = (): void => {
    const start = ownGradient ?? (ground.kind === 'gradient' ? { colors: ground.colors, form: ground.form, seed: ground.seed } : null) ?? (ground.kind === 'preset' ? presetGradient(ground.key) : null) ?? randomGradient(Math.floor(Math.random() * 0x7fffffff));
    setGradient({ open: true, draft: { spec: start, grain: appearance.grain } });
  };
  return (
    <Section title={t('Fond')} info={GROUND_INFO}>
      <div className={styles.groups}>
        <PresetGroup title={t('Dégradés')} keys={GROUND_GRADIENTS} appearance={appearance} mode={mode} />
        <PresetGroup title={t('Couleurs unies')} keys={GROUND_COLORS} appearance={appearance} mode={mode} />
        <section className={styles.group}>
          <Heading title={t('Les vôtres')} chosen={ownChosen ? (ownChosen.kind === 'color' ? t('Votre couleur') : t('Votre dégradé')) : null} />
          <div className={styles.grid} role="group" aria-label={t('Les vôtres')}>
            {own.map((choice, index) => {
              const chosen = sameGround(choice, ground);
              const name = choice.kind === 'color' ? t('Votre couleur') : t('Votre dégradé');
              return (
                <button key={choice.kind} type="button" role="radio" aria-checked={chosen} className={styles.option} onClick={() => setAppearance({ ...appearance, ground: choice })}>
                  <span className={`${styles.swatch} ${styles.ground}`} data-pebble={pebbleTurn(index)} data-still style={groundStyle(choice, mode)}>
                    <PebbleEdge turn={pebbleTurn(index)} />
                    {chosen ? <Check /> : null}
                  </span>
                  <span className={`${styles.name} t-label-small`}>{name}</span>
                </button>
              );
            })}
            <button type="button" className={styles.option} aria-haspopup="dialog" onClick={() => setColorOpen(true)}>
              <span className={`${styles.swatch} ${styles.make}`} data-pebble-under={pebbleTurn(own.length)} data-still>
                <PebbleEdge turn={pebbleTurn(own.length)} />
                <Icon name="plus" size={20} />
              </span>
              <span className={`${styles.name} t-label-small`}>{t('Couleur…')}</span>
            </button>
            <button type="button" className={styles.option} aria-haspopup="dialog" onClick={makeGradient}>
              <span className={`${styles.swatch} ${styles.make}`} data-pebble-under={pebbleTurn(own.length + 1)} data-still>
                <PebbleEdge turn={pebbleTurn(own.length + 1)} />
                <Icon name="plus" size={20} />
              </span>
              <span className={`${styles.name} t-label-small`}>{t('Dégradé…')}</span>
            </button>
          </div>
        </section>
      </div>
      <button type="button" role="switch" aria-checked={appearance.grain} className={settings.row} onClick={() => setAppearance({ ...appearance, grain: !appearance.grain })}>
        <span className={settings.rowText}>
          <span className="t-body">{t('Grain sur le fond')}</span>
          <span className="t-meta">{t('Le grain de film sur le fond de l’écran.')}</span>
        </span>
        <SwitchMark checked={appearance.grain} />
      </button>
      <div className={styles.servicesOpen}>
        <Button kind="text" small icon="palette" onClick={() => setServicesCssOpen(true)}>
          {SERVICES_CSS_WORDS.open}
        </Button>
      </div>
      <ColorDialog
        open={colorOpen}
        target="ground"
        initial={ownColor ?? groundPaint(ground, mode).base}
        appearance={appearance}
        onCancel={() => setColorOpen(false)}
        onChoose={color => {
          setAppearance({ ...appearance, ground: { kind: 'color', color }, ownColor: color });
          setColorOpen(false);
        }}
      />
      <GradientDialog
        open={gradient.open}
        initial={gradient.draft}
        appearance={appearance}
        onCancel={() => setGradient(current => ({ ...current, open: false }))}
        onUse={({ spec, grain }) => {
          setAppearance({ ...appearance, ground: { kind: 'gradient', ...spec }, ownGradient: spec, grain });
          setGradient(current => ({ ...current, open: false }));
        }}
      />
    </Section>
  );
}
