import { setLocale } from '@unlease/core/i18n';
import { formatCountdown, scaleIngredient, servingsOf, servingsUnit, servingsWords, stepFactor, stepTimers } from '../recipes';

const durations = (text: string) => stepTimers(text).map(timer => [text.slice(timer.start, timer.end), timer.seconds]);

describe('a recipe for another number', () => {
  afterEach(() => setLocale('fr'));

  it('reads how many it serves from the reading’s facts', () => {
    expect(servingsOf([{ label: 'Temps total', value: '40 min' }, { label: 'Portions', value: '6' }])).toBe(6);
    expect(servingsOf([{ label: 'Servings', value: '4-6 people' }])).toBe(4);
    expect(servingsOf([{ label: 'Temps', value: '40 min' }])).toBeNull();
    expect(servingsOf([{ label: 'Portions', value: 'beaucoup' }])).toBeNull();
  });

  it('counts what the recipe counts when it is not people', () => {
    const unit = (value: string) => servingsUnit([{ label: 'Portions', value }]);
    expect(unit('15 crêpes')).toBe('crêpes');
    expect(unit('24 cookies environ')).toBe('cookies');
    expect(unit('1 gâteau (8 parts)')).toBe('gâteau');
    expect(unit('4 petits pots de crème')).toBe('petits pots');
    expect(unit('4 à 6 personnes')).toBeNull();
    expect(unit('6 parts')).toBeNull();
    expect(unit('6')).toBeNull();
    expect(servingsWords(15, 20 / 15, 'crêpes')).toMatch(/^20\scrêpes$/);
    expect(servingsWords(15, 1 / 15, 'crêpes')).toMatch(/^1\scrêpe$/);
    expect(servingsWords(1, 2, 'gâteau')).toMatch(/^2\sgâteaux$/);
    expect(servingsWords(1, 3, 'petit pot')).toMatch(/^3\spetits pots$/);
  });

  it('steps a person at a time, or a factor at a time when the recipe does not say', () => {
    expect(stepFactor(4, 1, 1)).toBe(1.25);
    expect(stepFactor(4, 0.25, -1)).toBe(0.25);
    // A recipe for a crowd still steps up, to twice its own.
    expect(stepFactor(30, 1, 1)).toBe(31 / 30);
    expect(stepFactor(30, 2, 1)).toBe(2);
    expect(stepFactor(4, 6, 1)).toBe(6);
    expect(stepFactor(null, 1, 1)).toBe(1.5);
    expect(stepFactor(null, 4, 1)).toBe(4);
    expect(stepFactor(null, 0.5, -1)).toBe(0.5);
    expect(servingsWords(4, 1.25)).toMatch(/^5\spersonnes$/);
    expect(servingsWords(null, 1.5)).toBe('× 1,5');
    setLocale('en');
    expect(servingsWords(4, 0.25)).toMatch(/^1\sperson$/);
  });

  it('scales the first quantity as a cook measures it, and leaves a line without one', () => {
    const scaled = (factor: number) => ['1 pâte feuilletée', '4 pommes', '40 g de beurre', '250 g de farine', '1 l de lait', '2 à 3 œufs', '½ cuillère à café de sel', '1 1/2 tasse de riz', '200g de chocolat', 'Sel, poivre'].map(line => scaleIngredient(line, factor));
    expect(scaled(7 / 6)).toEqual(['1 pâte feuilletée', '4½ pommes', '47 g de beurre', '290 g de farine', '1,15 l de lait', '2½ à 3½ œufs', '½ cuillère à café de sel', '2 tasse de riz', '235g de chocolat', 'Sel, poivre']);
    expect(scaled(0.5)).toEqual(['½ pâte feuilletée', '2 pommes', '20 g de beurre', '125 g de farine', '½ l de lait', '1 à 1½ œufs', '¼ cuillère à café de sel', '¾ tasse de riz', '100g de chocolat', 'Sel, poivre']);
    expect(scaleIngredient('2 œufs', 1)).toBe('2 œufs');
  });

  it('scales the amount, never a share, a reference or a weight under ten to the gram', () => {
    expect(scaleIngredient('Chocolat noir 70 % : 200 g', 2)).toBe('Chocolat noir 70 % : 400 g');
    expect(scaleIngredient('Farine T45 (250 g)', 2)).toBe('Farine T45 (500 g)');
    expect(scaleIngredient('1\u20442 cup sugar', 2)).toBe('1 cup sugar');
    expect(scaleIngredient('2 œufs (de 60 g)', 2)).toBe('4 œufs (de 60 g)');
    expect(scaleIngredient('0,2 g de safran', 0.5)).toBe('0,1 g de safran');
    expect(scaleIngredient('2 g d’agar-agar', 0.25)).toBe('0,5 g d’agar-agar');
    expect(scaleIngredient('1 boîte de 400 g de tomates', 2)).toBe('2 boîte de 400 g de tomates');
  });
});

describe('a step’s timers', () => {
  it('finds the durations a step names, a range at its shorter end', () => {
    expect(durations('Enfourner 25 à 30 minutes.')).toEqual([['25 à 30 minutes', 1500]]);
    expect(durations('Cuire 1 h 30 à feu doux, puis 10 min à couvert.')).toEqual([
      ['1 h 30', 5400],
      ['10 min', 600],
    ]);
    expect(durations('Laisser reposer 1h30.')).toEqual([['1h30', 5400]]);
    expect(durations('Cuire 2 min 30 de chaque côté.')).toEqual([['2 min 30', 150]]);
    expect(durations('Bake for 45 minutes, then rest 5 mins.')).toEqual([
      ['45 minutes', 2700],
      ['5 mins', 300],
    ]);
    expect(durations('Chauffer 30 s au micro-ondes.')).toEqual([['30 s', 30]]);
    expect(durations('Cuire 2 h 15 min.')).toEqual([['2 h 15 min', 8100]]);
  });

  it('reads fractions of an hour, and no time of day', () => {
    expect(durations('Laisser 1/2 heure au frais.')).toEqual([['1/2 heure', 1800]]);
    expect(durations('Bake 1 1/2 hours.')).toEqual([['1 1/2 hours', 5400]]);
    expect(durations('Cuire 3/4 h.')).toEqual([['3/4 h', 2700]]);
    expect(durations('Servir à 20 h.')).toEqual([]);
    expect(durations('Laisser mariner 24 h.')).toEqual([['24 h', 86_400]]);
  });

  it('takes no count for a duration', () => {
    expect(durations('Ajouter 2 sachets et 3 œufs.')).toEqual([]);
    expect(durations('Mélanger 1 min 3 œufs')).toEqual([['1 min', 60]]);
    expect(durations('Préchauffer le four à 180 °C.')).toEqual([]);
  });

  it('counts down as a clock does', () => {
    expect(formatCountdown(605)).toBe('10:05');
    expect(formatCountdown(3725)).toBe('1:02:05');
    expect(formatCountdown(0.2)).toBe('0:01');
    expect(formatCountdown(-3)).toBe('0:00');
  });
});
