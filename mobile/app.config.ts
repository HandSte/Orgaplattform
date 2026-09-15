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
  },
  android: {
    ...(config.android ?? {}),
    package: 'de.essentia.app',
  },
  web: {
    ...(config.web ?? {}),
    bundler: 'metro',
  },
});
