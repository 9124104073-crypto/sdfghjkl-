# Supabase Production Setup

NIRMAN AI uses Supabase in three places when the environment variables in
`.env.example` are set:

- **Postgres** holds every SQLAlchemy model: sites, scores, projects, reports,
  audit records, client profiles and all decision-engine output.
- **Auth** creates password accounts and sends the confirmation email. The app
  does not sign a new account in until Supabase reports `email_confirmed_at`.
- **Storage** privately archives replaceable seed files under `seed/` and DPR
  PDFs under `dpr/`.

## 1. Create and configure the project

Create a Supabase project, then copy its Postgres connection string from
**Connect**. For a long-running container use the direct connection, or use
the session pooler on IPv4-only hosting. Convert its prefix to
`postgresql+psycopg://` and set it as `DATABASE_URL`.

In **Authentication > Providers > Email**, enable email/password sign-in and
turn on **Confirm email**. In **Authentication > URL Configuration**, set the
Site URL and add the exact production callback, for example
`https://app.example.com/login`, as a Redirect URL. Configure custom SMTP
before inviting real users so email delivery is reliable.

Add these backend-only secrets to your host:

```env
DATABASE_URL=postgresql+psycopg://...
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_STORAGE_BUCKET=nirman-files
SUPABASE_REDIRECT_URL=https://app.example.com/login
JWT_SECRET=a-long-random-value
DEMO_MODE=false
AUTO_SEED=false
```

Never add `SUPABASE_SERVICE_ROLE_KEY` to `VITE_*` variables or the frontend.
It can bypass Storage policies and belongs only in the FastAPI deployment.

## 2. Move existing local data

Run the application once with `AUTO_SEED=true` against the new empty Supabase
database to create tables and import the supplied datasets. After confirming
the records in the Supabase Table Editor, switch `AUTO_SEED=false`.

For existing SQLite data, export from the old database and import selected
tables with a migration script; do not copy `sqlite_sequence` or passwords.
The application will create schema and Postgres extensions at startup.

## 3. Host

Build the frontend and run the FastAPI container with the environment values
above. Configure the public frontend origin in `CORS_ORIGINS`; use HTTPS and a
reverse proxy. The existing Docker services are suitable for local testing,
but production should use Supabase for Postgres rather than the bundled
database container.
