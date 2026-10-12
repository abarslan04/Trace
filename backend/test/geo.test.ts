import { describe, expect, it } from 'vitest';
import { clip, destination, distance, length, overlap } from '../src/geo';
import type { Coordinate } from '../src/types';
import { origin } from './fixtures';

describe('geographic calculations', () => {
  it('places candidates at the requested geodesic distance and bearing', () => {
    expect(distance(origin, destination(origin, 90, 2500))).toBeCloseTo(2500, 5);
    expect(destination(origin, 0, 1000)[1]).toBeGreaterThan(origin[1]);
    expect(destination(origin, 90, 1000)[0]).toBeGreaterThan(origin[0]);
  });

  it('trims on the actual multi-segment path, retaining earlier vertices', () => {
    const turn = destination(origin, 90, 1000);
    const end = destination(turn, 0, 2000);
    const trimmed = clip([origin, turn, end], 2500);
    expect(trimmed.coordinates).toHaveLength(3);
    expect(trimmed.coordinates[1]).toEqual(turn);
    expect(trimmed.coordinates[2]![0]).toBeCloseTo(turn[0], 7);
    expect(length(trimmed.coordinates)).toBeCloseTo(2500, 1);
  });

  it('keeps the right segment index when trimming exactly at a vertex', () => {
    const turn = destination(origin, 90, 1000);
    const end = destination(turn, 0, 1000);
    expect(clip([origin, turn, end], distance(origin, turn)).endIndex).toBe(1);
  });

  it('handles the international date line without drawing a path around the world', () => {
    const start: Coordinate = [179.999, 0];
    const end = destination(start, 90, 1000);
    const midpoint = clip([start, end], 500).coordinates.at(-1)!;
    expect(end[0]).toBeLessThan(-179);
    expect(distance(start, midpoint)).toBeCloseTo(500, 4);
  });

  it('detects shared corridors even with sparse geometry or reversed vertices', () => {
    const end = destination(origin, 0, 2500);
    const midpoint = destination(origin, 0, 1250);
    expect(overlap([origin, end], [end, midpoint, origin])).toBe(1);
    expect(overlap([origin, end], [origin, destination(origin, 120, 2500)])).toBeLessThan(0.1);
  });
});
