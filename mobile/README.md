# Orgaplattform Mobile

Private mobile client for the Orgaplattform. Android and iOS use the same Supabase backend as the web application.

## Development

1. Install a current Node.js version and Expo tooling.
2. Copy `.env.example` to `.env`.
3. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the same public Supabase values used by the web app.
4. Run `npm install` inside `mobile/`.
5. Start with `npm run start`.

The mobile app is intended for private/internal distribution. No public App Store or Google Play release is part of the project plan.

## Distribution

Android can be distributed directly to the trusted network as an APK. For iPhone/iPad, the final internal distribution method will be chosen during the packaging phase; the web PWA remains available as a store-free fallback.

Never commit `.env` or any private service-role credentials.
