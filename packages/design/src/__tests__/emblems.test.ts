import { EMBLEMS, EMBLEM_PATHS, emblemShape, LABEL_TAG_PATH } from '../emblems';
import { collageEntrances, COLLAGE_STAGGER, CUTOUT_LAY, GHOST_ENTRANCE, SCENES, type CollageScene } from '../collage';

describe('emblems', () => {
  it('has a path for every emblem, and a hole only where the shape is cut through', () => {
    for (const emblem of EMBLEMS) expect(EMBLEM_PATHS[emblem]).toMatch(/^M.*Z$/);
    for (const emblem of EMBLEMS) expect([emblem, emblemShape(emblem).rule === 'evenodd']).toEqual([emblem, /Z\s*M/.test(EMBLEM_PATHS[emblem])]);
    expect(LABEL_TAG_PATH).toMatch(/^M.*Z\s*M.*Z$/);
  });
});

describe('empty states’ collages', () => {
  it('lays every piece down after the one under it, from just outside its place, never grown from nothing', () => {
    for (const scene of Object.keys(SCENES) as CollageScene[]) {
      const entrances = collageEntrances(scene);
      expect(entrances).toHaveLength(SCENES[scene].length);
      entrances.forEach((entrance, index) => {
        expect(entrance.delay).toBe(index * COLLAGE_STAGGER);
        expect(entrance.scale).toBeGreaterThanOrEqual(0.9);
        expect(Math.hypot(entrance.dx, entrance.dy)).toBeLessThanOrEqual(16);
      });
    }
  });

  it('lays a collection’s ghost as a cut-out: from just beyond its top right corner, upright into its slant', () => {
    expect(Math.hypot(GHOST_ENTRANCE.dx, GHOST_ENTRANCE.dy)).toBeCloseTo(CUTOUT_LAY.drift);
    expect(GHOST_ENTRANCE.dx).toBeGreaterThan(0);
    expect(GHOST_ENTRANCE.dy).toBeLessThan(0);
    expect(GHOST_ENTRANCE).toMatchObject({ turn: CUTOUT_LAY.turn, scale: CUTOUT_LAY.scale, delay: 0 });
  });
});
