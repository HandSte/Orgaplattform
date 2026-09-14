# Orgaplattform Mobile

Private mobile client for the Orgaplattform. Android and iOS use the same Supabase backend as the web application.

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
5. Start with `npm run start`.

The mobile app is intended for private/internal distribution. No public App Store or Google Play release is part of the project plan.

## Distribution

Android can be distributed directly to the trusted network as an APK. For iPhone/iPad, the final internal distribution method will be chosen during the packaging phase; the web PWA remains available as a store-free fallback.

Before packaging, verify the Expo SDK/runtime compatibility of the installed dependency versions and create platform-specific build configuration. Do not commit `.env`, signing credentials, provisioning profiles or any private service-role credentials.
