import type { ExpoConfig } from 'expo/config';

export default ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...config,
  name: 'Orgaplattform',
  slug: 'orgaplattform',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  scheme: 'orgaplattform',
  ios: {
    ...(config.ios ?? {}),
    supportsTablet: true,
    bundleIdentifier: 'de.orgaplattform.app',
  },
  android: {
    ...(config.android ?? {}),
    package: 'de.orgaplattform.app',
  },
  web: {
    ...(config.web ?? {}),
    bundler: 'metro',
  },
});
