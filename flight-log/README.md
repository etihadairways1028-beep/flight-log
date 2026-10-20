# Flight Log

![Flight Log](public/brand/flight-log-banner.jpg)

**Every flight tells a story.** Flight Log is a premium flight logbook and aviation analytics web app for enthusiasts, flight-sim pilots, student pilots, licensed pilots and virtual-airline pilots.

It's a fast static site (React + TypeScript + Vite) that runs on GitHub Pages. Optional **sign-in and cloud sync** use Supabase.

---

## Put it on GitHub Pages (about 5 minutes)

1. **Create a repository** on GitHub, e.g. `flight-log` (public, or private on a paid plan).
2. **Upload the project.** Unzip this download, then either:
   - drag every file and folder from the unzipped `flight-log` folder into the repo's **Add file → Upload files** page (include the hidden `.github` folder: on macOS press `Cmd+Shift+.` in Finder to show it), and commit to `main`; or
   - from a terminal:
     ```bash
     cd flight-log
     git init && git add . && git commit -m "Flight Log"
     git branch -M main
     git remote add origin https://github.com/<you>/flight-log.git
     git push -u origin main
     ```
3. **Turn on Pages:** repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Open the **Actions** tab. The *Deploy Flight Log to GitHub Pages* workflow installs, runs the tests, builds and publishes. When it's green, your site is at
   `https://<you>.github.io/flight-log/`

Every later push to `main` redeploys automatically.

> **No Actions?** The download also contains a ready-built `dist/` folder. Put its *contents* in a branch called `gh-pages` (or in `/docs` on `main`) and pick that branch/folder under **Settings → Pages → Deploy from a branch**. Cloud sign-in then has to be configured from the app's sign-in screen instead of at build time.

---

## Turn on sign-in and cloud sync (optional, free)

Without this, Flight Log works fully offline-first: each browser keeps its own logbook, with JSON backup/restore and CSV export. To give every user a real account whose flights sync across devices:

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), click **Run**. This creates one table with **row-level security**: a signed-in user can only ever read and write their own rows.
3. **Authentication → URL Configuration:** set **Site URL** to your Pages address (e.g. `https://<you>.github.io/flight-log/`) and add the same URL under **Redirect URLs**. Email confirmation, magic links and password resets return here.
4. **Project Settings → API:** copy the **Project URL** and the **anon / publishable key**.
5. In GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**, add
   - `VITE_SUPABASE_URL` = the project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon key
6. Re-run the workflow (**Actions → Deploy → Run workflow**).

The sign-in screen now offers **email + password**, **magic link** and **forgot password**. People can still choose *Continue without an account*.

**Security notes**
- The anon key is meant to be public. RLS policies protect the data. **Never** use the `service_role` key in this app.
- Synced: your personal logbook, saved filters, custom aircraft and settings. Photos and the demo workspace stay on each device, so attach photos per device or keep them in a JSON backup.
- If a device already has unsynced flights when someone signs in, Flight Log asks whether to **merge**, use the **account's** flights, or use **this device's** flights. Nothing is overwritten silently.
- Signing out flushes pending changes, then clears the device's copy of the personal logbook.

---

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 26 unit tests: time zones, overnight flights, DST, units, CSV round-trip, aggregates
npm run build      # production build in dist/
npm run preview    # serve dist/ locally
```

For local cloud testing, copy `.env.example` to `.env.local` and fill in your values.

> Opening `dist/index.html` straight from disk won't load the airport database (browsers block `fetch` on `file://`). Use `npm run preview` or any static server.

---

## What's inside

| Area | Highlights |
|---|---|
| **Overview** | Personal greeting, cinematic hero, next planned flight, mini route map, 12 configurable stat cards (each links to its filtered view), data-driven insights, 8 charts with 12m/24m/all-time ranges, recent flights |
| **My Flights** | Search, sort, date/aircraft/registration/airline/airport/route/tag filters, saved presets, column visibility, pagination, bulk select, CSV export, delete with undo |
| **Flight form** | Collapsible sections; airport search over 9,500+ airports (+10k small airfields on demand); ICAO type picker; times entered in **airport-local or UTC** with automatic **+1 day** for overnight legs; flight time and block time calculated separately (block time is never inferred); photos, tags, rating, crew, weather, fuel, landings |
| **Flight detail** | Boarding-pass route header, timeline with local + Zulu times and delays, great-circle map, airport cards, aircraft classification, related flights |
| **Analytics** | Global filters; Time (real vs sim always separate, YoY, cumulative, duration histogram, time by aircraft/airline/route), Aircraft (type, variant, manufacturer, body, engine, fleet history), Routes (heat map, longest, top airports, domestic/intl), Activity heatmap, Compare (years, aircraft, airlines, routes, date ranges; % change only when the baseline is non-zero), Insights with "how it's calculated" |
| **Map** | Natural Earth projection, true great-circle arcs (antimeridian-safe), Atlantic/Pacific centring, density mode, zoom/pan, route and airport popovers. Historical only, never fake live traffic |
| **Aircraft / Airports** | Type vs individual registration, custom airframes with your own photos; full airport directory with verified-vs-user-entered labels, local time, visits |
| **Calendar** | Month and year views, category colours, planned flights, quick-add on any day; clear date convention (local departure date or UTC) |
| **Achievements** | 19 milestones with stated thresholds, awarded only from data, with the date and flight that earned them; personal timeline; privacy-conscious share card (PNG) |
| **Reports & Export** | Monthly, annual, aircraft, route, airport, hours and custom reports; print / Save as PDF; CSV export & template; JSON backup with photos; CSV import with column mapping, validation, duplicate detection and preview; merge or replace restore with confirmation |
| **Settings** | Account & sync, profile and avatar, flying type, units (km/NM/mi, ft/m, kt/km/h/mph), H:MM or decimal, date/time formats, time zones, theme, reduce transparency, sounds and volume, defaults, dashboard card order, privacy, integrations status, storage usage |
| **Integrations** | **SimBrief**: fetch your latest OFP into a planned sim flight. MSFS/X-Plane/live tracking/weather show honest *Not connected* status, since they need a local bridge or server-side key |
| **Feel** | Liquid-glass design system, Geist + Geist Mono, synthesised cabin-chime sounds (toggleable), page/number/chart transitions, `prefers-reduced-motion` respected, keyboard shortcuts (`N` new flight, `⌘K` / `/` search) |

### Data model and correctness

- Stored in canonical units: **km, ft, kt, minutes, UTC instants**. Converted only for display.
- Durations are computed from UTC instants, so overnight flights, date-line crossings and DST are handled (see `src/__tests__/core.test.ts`).
- **Planned and cancelled flights never count** toward totals. Simulator time is never mixed into real-world time without a clearly labelled combined figure.
- Missing values are left out and flagged (e.g. "12/15" badges), never estimated.
- Demo data is fictional, labelled **DEMO**, and lives in a completely separate workspace.

### Architecture

```
src/
  lib/          pure logic: types, time, geo, units, stats, insights, achievements, csv, demo, cloud, simbrief
  store/        zustand store + repository (IndexedDB locally, Supabase when signed in)
  components/   design system (ui), layout (shell, nav, search), flight (form, pickers), charts, map
  pages/        one file per route (hash routing, so deep links work on GitHub Pages)
public/data/    airports.json, airports-ext.json, airlines.json (prebuilt; see scripts/build-data.py)
supabase/       schema.sql with RLS policies
```

To swap in a different backend, implement the `Repository` interface in `src/store/db.ts` and the `pull/push` functions in `src/lib/cloud.ts`.

### Regenerating the datasets

```bash
mkdir data-src
curl -o data-src/oa.csv        https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv
curl -o data-src/mwgg.json     https://raw.githubusercontent.com/mwgg/Airports/master/airports.json
curl -o data-src/airlines.dat  https://raw.githubusercontent.com/jpatokal/openflights/master/data/airlines.dat
npm run data
```

---

## Credits and licences

- Airport data: [OurAirports](https://ourairports.com/data/) (public domain). Time zones from [mwgg/Airports](https://github.com/mwgg/Airports) (MIT).
- Airline names: [OpenFlights](https://openflights.org/data) (Open Database License).
- Country shapes: [Natural Earth](https://www.naturalearthdata.com/) via `world-atlas`.
- Photography: [Unsplash](https://unsplash.com/license), loaded from images.unsplash.com. Photos are atmospheric and never presented as the specific aircraft you flew. Turn them off in Settings → Privacy.
- Fonts: Geist and Geist Mono (SIL Open Font License).

**Disclaimer:** Flight Log is a personal record. It is not an approved regulatory pilot logbook and makes no claim of compliance with EASA, FAA, GCAA or other authority requirements. Achievements are personal milestones, not qualifications.
