# Summit Book Club

A Vercel-ready Next.js app backed by Supabase, with explicit tables for members, current book, nominations, votes, quotes, and reading history.

## Setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Install dependencies and run the app:

```bash
npm install
npm run dev
```

## Deploying to Vercel

1. Import the repo into Vercel or run `vercel deploy` from this directory.
2. Add these environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy.

The app renders a setup screen when Supabase environment variables are missing, so a first deploy can still verify that the Next.js/Vercel shell works before the database is connected.

The app intentionally uses no login. Members pick their name from the selector, and Supabase Row Level Security policies allow anonymous read/write access for this trusted coworker club.
