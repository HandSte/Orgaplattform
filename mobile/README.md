# Essentia Mobile

Private mobile client for **Essentia**. Android and iOS use the same Supabase backend as the web application.

## Current functionality

- Supabase login and persistent session
- Board and list overview
- Realtime synchronization of lists and cards
- Card creation, editing and deletion according to board role
- Viewer role with enforced read-only UI
- Card search across title and description
- Collaborative checklists
- Card comments
- Private card attachments with signed access URLs
- Realtime notification center

## Development

1. Install a current Node.js version and Expo tooling.
2. Copy `.env.example` to `.env`.
3. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the same public Supabase values used by the web app.
4. Run `npm install` inside `mobile/`.
5. Run `npm run typecheck` to validate the mobile TypeScript project.
6. Start with `npm run start` (use `npm run start:clear` after dependency/config changes if the Expo cache is stale).

## Internal builds

The repository contains `app.config.ts` and `eas.json` for internal packaging. Android preview builds are configured as installable APKs; iOS preview builds use internal distribution. These profiles are not public App Store or Google Play releases.

- Android: `npm run build:android:preview`
- iOS: `npm run build:ios:preview`

An Expo/EAS account and the platform signing credentials are required when actually creating a build. Apple provisioning is handled by the normal iOS internal-distribution process. Do not commit `.env`, signing credentials, provisioning profiles or any private service-role credentials.

The web PWA remains available as a store-free fallback.

## Branding

The mobile client is branded consistently as **Essentia**. Branding constants are centralized in `branding.ts`, and the integrated mobile shell shows the Essentia monogram and tagline. No public store listing or store distribution profile is configured.

The current monogram is intentionally rendered in code so the identity is usable without committing binary logo assets. A final supplied logo can be integrated later without changing the app identity or build configuration.
