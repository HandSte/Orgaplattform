import type { ExpoConfig } from 'expo/config';

export default ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...config,
  name: 'Essentia',
  slug: 'essentia',
  version: '0.2.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#f1f5f9',
  primaryColor: '#0f172a',
  scheme: 'essentia',
  ios: {
    ...(config.ios ?? {}),
    supportsTablet: true,
    bundleIdentifier: 'de.essentia.app',
    buildNumber: '2',
  },
  android: {
    ...(config.android ?? {}),
    package: 'de.essentia.app',
    versionCode: 2,
  },
  web: {
    ...(config.web ?? {}),
    bundler: 'metro',
  },
});
