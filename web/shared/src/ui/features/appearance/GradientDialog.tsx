/**
 * A gradient of one's own: two to four colours, each picked precisely or drawn at random in
 * harmony, blended from the top to the foot (`fondu`) or pooled as soft clouds (`nuees`), grainy
 * or not; by day and at night as the app will show it. Nothing changes
 * until "Utiliser ce fond".
 */
import { useId, useState, type CSSProperties } from 'react';

import { GRADIENT_COLORS, GRADIENT_FORM_NAMES, GRADIENT_FORMS, randomGradient, type Appearance, type GradientForm, type GradientSpec } from '@unlease/design/appearance';
import { mixOklab } from '@unlease/design/color';
import { pebbleTurn } from '@unlease/design/pebbles';
import { t } from '@unlease/core/i18n';

import { Button } from '../../components/Button';
import { SwitchMark } from '../../components/Checkbox';
import { DialogFrame } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { Layer } from '../../components/Layer';
import { useUnsaved } from '../../components/useUnsaved';
import { PebbleEdge } from '../../components/Outline';
import { Segmented } from '../../components/Segmented';
import { AppearancePreview } from './AppearancePreview';
import styles from './appearance.module.css';
import { ColorPicker } from './ColorPicker';

/** A new seed each time: the dice never fall the same way twice in a row. */
const freshSeed = (): number => Math.floor(Math.random() * 0x7fffffff);

export interface GradientDraft {
  readonly spec: GradientSpec;
  readonly grain: boolean;
}

export function GradientDialog({ open, initial, appearance, onCancel, onUse }: { open: boolean; initial: GradientDraft; appearance: Appearance; onCancel: () => void; onUse: (draft: GradientDraft) => void }) {
  const id = useId();
  const [spec, setSpec] = useState(initial.spec);
  const [grain, setGrain] = useState(initial.grain);
  const [selected, setSelected] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSpec(initial.spec);
      setGrain(initial.grain);
      setSelected(0);
    }
  }
  // A gradient made is not dropped by a slip: the scrim, Escape, Back or the × ask first; « Annuler » is the word for it.
  const unsaved = useUnsaved(open && (grain !== initial.grain || JSON.stringify(spec) !== JSON.stringify(initial.spec)));
  const at = Math.min(selected, spec.colors.length - 1);
  const look = { ...appearance, ground: { kind: 'gradient' as const, ...spec }, grain };
  const setColor = (hex: string): void => setSpec(current => ({ ...current, colors: current.colors.map((color, index) => (index === at ? hex : color)) }));
  const add = (): void => {
    const colors = spec.colors;
    setSpec({ ...spec, colors: [...colors, mixOklab(colors[colors.length - 1]!, colors[0]!, 0.5)] });
    setSelected(colors.length);
  };
  const remove = (): void => {
    setSpec({ ...spec, colors: spec.colors.filter((_, index) => index !== at) });
    setSelected(Math.max(0, at - 1));
  };
  const dice = (): void => {
    const drawn = randomGradient(freshSeed());
    setSpec({ ...drawn, form: spec.form });
    setSelected(0);
  };

  return (
    <>
      <Layer open={open} onDismiss={unsaved.guard(onCancel)} labelledBy={`${id}-title`}>
        <DialogFrame
          title={t('Make a gradient')}
          titleId={`${id}-title`}
          className={styles.editor}
          onClose={unsaved.guard(onCancel)}
          onSubmit={event => {
            event.preventDefault();
            unsaved.saved();
            onUse({ spec, grain });
          }}
          foot={
            <>
              <Button kind="text" onClick={onCancel}>
                {t('Cancel')}
              </Button>
              <Button type="submit">{t('Use this background')}</Button>
            </>
          }
        >
          <AppearancePreview look={look} className={styles.editorPreview} />

          {/* The pebbles say what they are: no head over them; the dice at their row's end. */}
          <div className={styles.stops} role="group" aria-label={t('Colours')}>
            {spec.colors.map((color, index) => (
              <button
                key={index}
                type="button"
                className={styles.stop}
                aria-pressed={index === at}
                aria-label={t('Colour {n}: {color}', { n: index + 1, color })}
                data-pebble-under={pebbleTurn(index)}
                data-still
                style={{ '--pebble-fill': color } as CSSProperties}
                onClick={() => setSelected(index)}
              >
                <PebbleEdge turn={pebbleTurn(index)} />
              </button>
            ))}
            {spec.colors.length < GRADIENT_COLORS.max ? (
              <button type="button" className={`${styles.stop} ${styles.make}`} aria-label={t('Add a colour')} data-pebble-under={pebbleTurn(spec.colors.length)} data-still onClick={add}>
                <PebbleEdge turn={pebbleTurn(spec.colors.length)} />
                <Icon name="plus" size={20} />
              </button>
            ) : null}
            <IconButton icon="dice" label={t('Random colours')} onClick={dice} tip className={styles.stopsDice} />
          </div>
          <ColorPicker value={spec.colors[at]!} onChange={setColor} label={t('Colour {n}: {color}', { n: at + 1, color: spec.colors[at]! })} />
          {spec.colors.length > GRADIENT_COLORS.min ? (
            <div className={styles.editorActions}>
              <Button kind="text" icon="minus" small onClick={remove}>
                {t('Remove this colour')}
              </Button>
            </div>
          ) : null}

          <div className={styles.editorHead}>
            <h3 className="t-meta-strong">{t('Style')}</h3>
          </div>
          <Segmented<GradientForm> label={t('Style')} value={spec.form} onChange={form => setSpec({ ...spec, form })} options={GRADIENT_FORMS.map(form => ({ value: form, label: GRADIENT_FORM_NAMES[form] }))} />

          <button type="button" role="switch" aria-checked={grain} className={styles.switchRow} onClick={() => setGrain(!grain)}>
            <span className={`${styles.switchText} t-body`}>{t('Grain on the background')}</span>
            <SwitchMark checked={grain} />
          </button>
        </DialogFrame>
      </Layer>
      {unsaved.dialog}
    </>
  );
}
