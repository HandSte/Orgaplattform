import type { ExpoConfig } from 'expo/config';

type SplashConfig = { backgroundColor: string; resizeMode: 'contain' | 'cover' };

type ExtendedExpoConfig = ExpoConfig & { splash?: SplashConfig };

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const base = config as ExtendedExpoConfig;
  return {
    ...config,
    name: 'Essentia',
    slug: 'essentia',
    version: '0.3.0',
    orientation: 'default',
    userInterfaceStyle: 'automatic',
    backgroundColor: '#f1f5f9',
    primaryColor: '#0f172a',
    scheme: 'essentia',
    splash: {
      ...(base.splash ?? {}),
      backgroundColor: '#0f172a',
      resizeMode: 'contain',
    },
    ios: {
      ...(config.ios ?? {}),
      supportsTablet: true,
      bundleIdentifier: 'de.essentia.app',
      buildNumber: '3',
    },
    android: {
      ...(config.android ?? {}),
      package: 'de.essentia.app',
      versionCode: 3,
      adaptiveIcon: {
        ...(config.android?.adaptiveIcon ?? {}),
        backgroundColor: '#0f172a',
      },
    },
    web: {
      ...(config.web ?? {}),
      bundler: 'metro',
    },
  } as ExpoConfig;
};
