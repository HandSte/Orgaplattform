import type { ExpoConfig } from 'expo/config';

export default ({ config }: { config: ExpoConfig }): ExpoConfig => ({
  ...config,
  name: 'Orgaplattform',
  slug: 'orgaplattform',
  version: '0.1.0',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  android: {
    ...(config.android ?? {}),
    package: 'de.orgaplattform.mobile',
  },
  ios: {
    ...(config.ios ?? {}),
    bundleIdentifier: 'de.orgaplattform.mobile',
  },
  extra: {
    ...(config.extra ?? {}),
  },
});
