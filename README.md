# Daily XP

Daily XP is a gamified daily progress tracker for habits, streaks, XP, rewards, insights, and reflective notes.

## Architecture

This migration keeps the existing Vite + React UI usable while introducing a TypeScript-first full-stack structure:

- `src/main.tsx` — Daily XP React app and local-first sync orchestration.
- `src/lib/supabase.ts` — browser Supabase client helper for future authenticated flows.
- `api/daily-progress.ts` — Vercel serverless API for the first database-backed vertical slice.
- `supabase/migrations/` — database schema for profiles, habits, daily check-ins, XP events, quests, badges, rewards, and redemptions.

The app remains local-first. If Supabase environment variables are missing, the UI continues to save to `localStorage` and shows a local-mode sync status. When Supabase is configured, habit/check-in/note data syncs through the backend API.

## Environment variables

Copy `.env.example` to `.env.local` for local development or set these in Vercel:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-for-server-only-operations
```

Do not commit real credentials.

## Supabase setup

1. Create or open the Supabase project.
2. Run the SQL migration in `supabase/migrations/202605120001_daily_xp_core.sql`.
3. Add the environment variables above to local dev and Vercel.
4. Start the app and create/update a habit or daily check-in; the API will upsert the profile, habits, daily check-ins, and notes.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run typecheck
npm run build
```

## Migration notes

Database-backed in this slice:

- Profile shell keyed by a browser/profile identifier.
- Habits.
- Daily habit check-ins.
- Daily notes.
- Freeze count.

Still local in this staged migration:

- Reward shop definitions and redemptions.
- Derived level/XP display calculations, which remain computed in the UI from check-ins.
- Authentication/user management.

Next recommended slices: add Supabase Auth, persist rewards/redemptions, move XP ledger creation into server-side logic, and replace the temporary browser/profile identifier with authenticated profile ownership.
