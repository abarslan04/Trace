import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Trace',
  slug: 'trace-running',
  version: '0.1.0',
  scheme: 'trace',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.trace.running',
    infoPlist: {
      NSLocationWhenInUseUsageDescription: 'Trace uses your current location to find running routes that start near you.',
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: process.env.TRACE_ALLOW_LOCAL_HTTP === 'true' },
    },
  },
  android: {
    package: 'app.trace.running',
  },
  web: { bundler: 'metro', name: 'Trace — Find your next run', shortName: 'Trace' },
  plugins: [
    '@maplibre/maplibre-react-native',
    './plugins/withLocalHttp.cjs',
    ['expo-location', { locationWhenInUsePermission: 'Trace uses your current location to find running routes that start near you.' }],
  ],
});
