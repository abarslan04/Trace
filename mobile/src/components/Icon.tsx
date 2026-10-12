import { Platform } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

type IconName = 'route' | 'arrow' | 'location' | 'check' | 'refresh' | 'close' | 'info';
export function Icon({ name, color, size = 24 }: { name: IconName; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false })}>
      {name === 'route' && <><Circle cx={6} cy={18} r={2.5}/><Circle cx={18} cy={6} r={2.5}/><Path d="M8.5 18h6.75a4.25 4.25 0 0 0 0-8.5h-6.5A3.25 3.25 0 0 1 8.75 3H12"/></>}
      {name === 'arrow' && <><Path d="M4 12h16"/><Polyline points="14 6 20 12 14 18"/></>}
      {name === 'location' && <><Circle cx={12} cy={12} r={7}/><Circle cx={12} cy={12} r={2.5}/><Path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>}
      {name === 'check' && <Polyline points="5 12 10 17 20 7"/>}
      {name === 'refresh' && <><Path d="M20 10a8 8 0 1 0-.7 6"/><Polyline points="20 4 20 10 14 10"/></>}
      {name === 'close' && <Path d="m6 6 12 12M6 18 18 6"/>}
      {name === 'info' && <><Circle cx={12} cy={12} r={9}/><Path d="M12 11v6m0-10v.1"/></>}
    </Svg>
  );
}
