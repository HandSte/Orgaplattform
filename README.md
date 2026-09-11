# Orgaplattform

Professionelle Kanban-/Projektplattform für Teams. Web-App auf Next.js mit Supabase als gemeinsamem Backend; die Datenbasis ist für spätere Android/iOS-Clients vorbereitet.

## Aktueller Stand

- Next.js + TypeScript
- Supabase Auth (E-Mail/Passwort)
- Boards, Listen und Karten
- Rollenmodell: owner, admin, member, viewer
- Row Level Security (RLS)
- Supabase Realtime für Listen/Karten
- GitHub → Vercel Deployment
- responsive Web-Oberfläche

## Lokale Einrichtung

```bash
npm install
npm run dev
```

Benötigte Umgebungsvariablen:

```env
NEXT_PUBLIC_SUPABASE_URL=https://btfqvxoaawpgrlstkthn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase-Publishable-Key>
```

Die Datei `.env.example` enthält die Platzhalter. Niemals Service-Role-Keys oder Passwörter committen.

## Deployment

Das Repository `HandSte/Orgaplattform` ist mit dem Vercel-Projekt `orgaplattform` verbunden. Commits auf `main` können dadurch automatisch als Production Deployment gebaut werden.

In Vercel müssen einmalig die beiden `NEXT_PUBLIC_SUPABASE_*` Variablen für die Production-Umgebung hinterlegt werden.

## Datenbank

Die aktuelle Supabase-Struktur ist unter `supabase/migrations/20260911_initial_orgaplattform_schema.sql` versioniert. Das Produktionsprojekt wurde bereits mit der entsprechenden initialen Struktur eingerichtet.
