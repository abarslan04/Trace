import { describe, expect, it, vi } from 'vitest';
vi.mock('react-native', () => ({ useColorScheme: () => 'light' }));
import { routeBounds, turnaroundCoordinate } from '../src/components/mapShared';
import { darkColors, lightColors } from '../src/theme/tokens';
import { route } from './fixtures';
function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)!.map(part => parseInt(part, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string) { const values = [luminance(a), luminance(b)].sort((x, y) => x - y); return (values[1]! + 0.05) / (values[0]! + 0.05); }
describe('map and visual accessibility', () => {
  it('locates turnaround by travelled distance even with uneven vertex density', () => {
    const value = { ...route, geometry: { ...route.geometry, coordinates: [[0, 0], [0, 0.01], [0, 0.009], [0, 0.008], [0, 0.007], [0, 0]] as [number, number][] } };
    expect(turnaroundCoordinate(value)[1]).toBeCloseTo(0.01, 6);
  });
  it('keeps date-line crossing routes in a compact camera extent', () => {
    const value = { ...route, geometry: { ...route.geometry, coordinates: [[179.99, 0], [-179.99, 0], [179.99, 0]] as [number, number][] } };
    const [west, , east] = routeBounds(value);
    expect(east - west).toBeLessThan(0.03);
  });
  for (const [name, colors] of [['light', lightColors], ['dark', darkColors]] as const) {
    it(`${name} text and button pairs meet WCAG AA contrast`, () => {
      for (const surface of [colors.background, colors.surface, colors.surfaceMuted]) {
        expect(contrast(colors.text, surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.textSecondary, surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.error, colors.errorBackground)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
