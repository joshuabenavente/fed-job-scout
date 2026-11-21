# Fed Job Scout

A small invite-only web app for federal job alerts and tailored resume drafts.

- Front end: React (Vite), hosted on GitHub Pages
- Back end: Supabase (auth, database, scheduled functions)

The Supabase key in `src/supabase.js` is a publishable key and is safe to be public;
all data is protected by per-user row-level security in the database.
