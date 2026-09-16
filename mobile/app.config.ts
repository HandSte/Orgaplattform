import type { ExpoConfig } from 'expo/config';

export default ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...config,
  name: 'Essentia',
  slug: 'essentia',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  scheme: 'essentia',
  ios: {
    ...(config.ios ?? {}),
    supportsTablet: true,
    bundleIdentifier: 'de.essentia.app',
    buildNumber: '1',
  },
  android: {
    ...(config.android ?? {}),
    package: 'de.essentia.app',
    versionCode: 1,
  },
  web: {
    ...(config.web ?? {}),
    bundler: 'metro',
  },
});
