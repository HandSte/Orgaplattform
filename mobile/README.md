# Essentia Mobile

Private mobile client for **Essentia**. Android and iOS use the same Supabase backend as the web application.

## Current release

- App version: **0.2.0**
- Android versionCode: **2**
- iOS buildNumber: **2**
- Release focus: synchronized board workspace, collaborative checklists, realtime collaboration, runtime recovery and refreshed Essentia visual shell.

## Current functionality

- Supabase login and persistent session
- Board and list overview
- Realtime synchronization of lists and cards
- Card creation, editing and deletion according to board role
- Viewer role with enforced read-only UI
- Card search across title and description
- Collaborative checklists, including the shared To-do-Liste workflow
- Card comments
- Private card attachments with signed access URLs
- Realtime notification center
- Scrollable mobile workspace for long boards and nested board controls
- Branded Essentia shell with release/version indicator

## Development

1. Install a current Node.js version and Expo tooling.
2. Copy `.env.example` to `.env`.
3. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the same public Supabase values used by the web app.
4. Run `npm install` inside `mobile/`.
5. Run `npm run typecheck` to validate the mobile TypeScript project.
6. Start with `npm run start` (use `npm run start:clear` after dependency/config changes if the Expo cache is stale).

## Internal APK / builds

The repository contains `app.config.ts` and `eas.json` for internal packaging. Android preview and production profiles are configured to emit installable APKs; iOS profiles use internal distribution. These profiles are not public App Store or Google Play releases.

Before the first build, authenticate with EAS (`eas login`) and make sure the Expo/EAS account has Android signing credentials available. Then:

- Android preview APK: `npm run build:android:preview`
- Android internal production APK: `npm run build:android`
- iOS internal preview: `npm run build:ios:preview`
- iOS internal production: `npm run build:ios`

The current release is prepared as **Essentia 0.2.0 / Android versionCode 2**. Build versioning is explicitly kept local in `eas.json`, so future releases should bump `version`, `android.versionCode` and `ios.buildNumber` together before the next release build.

Do not commit `.env`, signing credentials, provisioning profiles or any private service-role credentials.

The web PWA remains available as a store-free fallback.

## Branding

The mobile client is branded consistently as **Essentia**. Branding constants are centralized in `branding.ts`, and the integrated mobile shell shows the Essentia monogram, tagline and current release version. The 0.2.0 shell uses a darker branded header, stronger hierarchy and clearer synchronization/error states while keeping the workspace light and readable.

No public store listing or store distribution profile is configured.
