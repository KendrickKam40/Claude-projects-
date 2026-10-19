# Sniffari 🐾

**Where can the dogs go right now?** Sniffari answers that for Sydney and NSW, using the real council rules:
- off-leash hours that change by time of day
- weekends and public holidays
- daylight saving
- sunrise and sunset

It also plans a dog-friendly day out.

Other dog apps list places. Sniffari tells you **what applies at the moment you'll get there**, and shows where that answer comes from.

## What it does

- **Near me, at any time.** Pick right now, this arvo, tomorrow 7am, Saturday 8am or any time you like. Every place shows "Off-leash now · until 9am" or "On lead now · off-leash from 4pm", nearest first, as a list or a map.
- **Filters that matter.** Off-leash then, fully fenced, reactive-friendly (fully fenced or with a separate small-dog area), and saved.
- **Every rule has a receipt.** Each place lists its rules with the council page they came from and the date they were checked. Places backed only by a local guide are labelled as such.
- **Today's timeline** for each place, so you can see when it switches.
- **Reports from the pack:** still right, rules wrong, quiet now, busy now, hazard, gate open. Quiet and busy reports build up into "usually quiet around this time".
- **Plan a day out.**
  - Add places, set when you leave, and Sniffari works out drive times and arrival times.
  - It shows what the dogs can do when you arrive, and warns you if dogs aren't allowed then or the rules change mid-visit.
  - You can open the whole route in Google Maps, or share the plan as a link.
- **Installable.** Add it to your home screen and it works like an app. The map keeps the places you've already seen, for spots with patchy reception.

## Where the data comes from

1. **29 hand-checked starter places.** These cover the Hills & north-west, the Northern Beaches & North Shore, the Eastern Suburbs & Inner West, South Sydney, and day trips. They are in `src/data/seed.ts`, with sources.
   - Rules were checked on 17 Oct 2026.
   - Most map pins are approximate (the place page says so).
   - Mona Vale's dog-beach trial has ended.
   - Woollahra's and Mosman's pages give conflicting details in places, so check the signs.
   - Silver Beach is only backed by a local guide.
2. **OpenStreetMap dog parks and dog-friendly cafés, restaurants and pubs across NSW.** A weekly import adds every `leisure=dog_park` mapped by OSM volunteers.
   - It skips anything within 150 m of a hand-checked place.
   - It removes parks that disappear from OSM.
   - It never overwrites a hand-checked place.
3. **Community reports** from signed-in friends.

NSW has no statewide off-leash dataset, so the hand-checked places carry the detailed time rules. The OSM parks are a broad backstop.

## Run it locally

```bash
cd sniffari
npm install          # uses legacy-peer-deps via .npmrc
npm run dev          # http://localhost:5173
npm test             # rules engine, data, planner, importer
npm run build
```

Without Supabase settings, the app runs on the bundled starter places. Saves and reports stay on that device. That is fine for trying it out.

## Put it online (Vercel)

1. In Vercel, click **Add New… → Project** and import `kendrickkam40/claude-projects-`.
2. Set **Root Directory** to `sniffari`. Vercel detects **Vite**, so leave the build settings as they are.
3. Click **Deploy**. Your Mt Wilson trip page stays as its own project. This is a second one.

## Add the backend (Supabase, free tier)

This turns on shared reports, saved places across devices, invite-only sign-in and the NSW-wide OpenStreetMap places.

1. **Create the project**
   - Go to [supabase.com](https://supabase.com) and click **New project**.
   - Name it `sniffari`, pick region **Sydney (ap-southeast-2)**, set a database password and save it somewhere.
2. **Create the tables.** In **SQL Editor → New query**, paste and **Run** each file in this order:
   1. `supabase/migrations/20261018000000_init.sql`
   2. `supabase/migrations/20261018010000_import_places.sql`
   3. `supabase/seed.sql` (the 29 starter places)

   Or paste `supabase/setup.sql`, which is all three in one file.
3. **Make sign-in invite-only**
   - Go to **Authentication → Sign In / Providers** (on older dashboards, **Authentication → Settings**).
   - Turn **off** "Allow new users to sign up".
   - Leave **Email** enabled.
4. **Tell Supabase where the app lives**
   - Go to **Authentication → URL Configuration**.
   - Set **Site URL** to your Vercel address, e.g. `https://sniffari.vercel.app`.
   - Add the same address under **Redirect URLs**.
5. **Invite friends and family**
   - Go to **Authentication → Users → Add user → Send invitation**, once per email.
   - After that, they sign in with an email link from the **Sign in** button.
6. **Connect the app**
   - In **Project Settings → API Keys**, copy the **Project URL** and the **anon** / **publishable** key. Both are safe to put in the browser.
   - In Vercel, go to **Settings → Environment Variables** and add them:
     - `VITE_SUPABASE_URL` = the project URL
     - `VITE_SUPABASE_ANON_KEY` = the anon or publishable key
   - Redeploy from **Deployments → ⋯ → Redeploy**.
7. **Turn on the weekly NSW import (optional)**
   - In GitHub, go to the repo's **Settings → Secrets and variables → Actions → New repository secret** and add:
     - `SNIFFARI_SUPABASE_URL` = the project URL
     - `SNIFFARI_SUPABASE_SERVICE_ROLE_KEY` = the **service_role** or **secret** key. **Never put this one in Vercel or the app.**
   - Run it once from **Actions → Sniffari open-data import → Run workflow**. After that it runs every Monday morning.

## How it's built (and how it scales)

```
src/domain/    rules engine: Sydney time, NSW public holidays, sunrise/sunset, seasons, overlapping rules
src/data/      starter places, and one Repository interface: on-device or Supabase
src/app/       testable app logic: "when", filters, sorting, freshness, the day-out planner
src/ui/        React components: list cards, map (MapLibre + free OpenFreeMap tiles), place sheet, planner
supabase/      Postgres + PostGIS schema with row-level security, nearby search and report summaries
scripts/       OpenStreetMap importer, seed SQL generator
```

- **Rules as data.** Each rule says when it applies: days (including public holidays), a time window (which can run past midnight or use sunrise and sunset), and a season or daylight saving. When rules overlap, the most specific one wins. Adding a council means adding data, not code.
- **One rules engine everywhere.** The engine is pure TypeScript, so the app, the tests and the importers all agree.
- **Nearby search runs in the database** (PostGIS) once there are thousands of places. The app never downloads the whole state.
- **Row-level security.**
  - Anyone can read places.
  - Only invited members can read and add reports, and only as themselves.
  - Saved places and plans are private.
  - Only the importer, using the service key, can bulk-write.
- **Costs nothing to run** at friends-and-family scale: Vercel hobby, Supabase free tier, and OpenFreeMap tiles (OpenStreetMap data, no key).

## Adding or fixing a place

Edit `src/data/seed.ts`, then:
- run `npm test` (it checks sources, dates, times and coordinates)
- run `npm run seed:sql`
- paste `supabase/seed.sql` into the SQL editor

Running the seed again updates existing places.
