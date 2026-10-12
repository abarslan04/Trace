import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#F6F7F2',
  surface: '#FFFFFF',
  surfaceMuted: '#EDF2EA',
  text: '#152C23',
  textSecondary: '#526158',
  primary: '#225940',
  onPrimary: '#FFFFFF',
  primarySoft: '#E5EEE1',
  border: '#CCD5CA',
  focus: '#1B6B43',
  error: '#A52F2F',
  errorBackground: '#FFF0EC',
  warning: '#75551C',
  route: ['#205B3D', '#5C54A3', '#AA4B27'],
  routeHalo: '#FFFFFF',
  location: '#2672B8',
  mapBackground: '#E1E9DC',
};

export const darkColors: typeof lightColors = {
  background: '#101A15',
  surface: '#19251E',
  surfaceMuted: '#233329',
  text: '#F1F6ED',
  textSecondary: '#B3C4B5',
  primary: '#BCD9A8',
  onPrimary: '#163222',
  primarySoft: '#2C4232',
  border: '#586B5A',
  focus: '#D3E9C5',
  error: '#FFB8AC',
  errorBackground: '#442724',
  warning: '#E9CD97',
  route: ['#B8E691', '#BEB1FF', '#FFC092'],
  routeHalo: '#15241B',
  location: '#87C7FF',
  mapBackground: '#1D2C23',
};

export type Colors = typeof lightColors;
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const radius = { sm: 12, md: 20, lg: 28, full: 100 };
export const motion = { camera: 450 };

export function useTheme() {
  const isDark = useColorScheme() === 'dark';
  return { colors: isDark ? darkColors : lightColors, isDark };
}
