# Kinoguide Bonn/Köln — project briefing

The user is **not a coder** — explain things simply, run terminal commands for them,
and confirm before destructive actions. They are on **Windows** (use PowerShell-
compatible commands).

## What this project is

A kinoguide.fyi clone for Bonn and Cologne: daily Python scraper collects all
cinema showtimes with language version (OV / OmU / DE), enriches them with
IMDb rating + Metascore (TMDB + OMDb APIs), writes `data/movies.json`; a
Vite/React frontend in `web/` displays it with filters. GitHub Actions
(`.github/workflows/scrape.yml`) automates daily scrape + deploy to Pages.

## Current status (July 2026)

DONE:
- Frontend works with sample data (`cd web; npm install; npm run dev`)
- Language classifier tested (`scraper/language.py`)
- TMDB + OMDb enrichment with cache written (`scraper/enrich/`)
- API keys are in `.env` at repo root (gitignored — NEVER commit it;
  the deploy workflow uses GitHub Secrets instead)
- User discovered via DevTools: kinoheld uses a **GraphQL API**, requests
  named `graphql`, query `programByMovie`, **Woki Bonn cinema ID = 1283**
  (already set in `scraper/cinemas.json`)

NOT DONE — this is where you pick up:

## Next steps, in order

1. **Capture the real GraphQL payload.** The QUERY in
   `scraper/sources/kinoheld.py` is a placeholder skeleton. Ask the user to:
   open the Woki page on kinoheld.de → F12 → Network → filter `graphql` →
   click the request whose Response contains the film program → Payload tab →
   right-click the request → "Copy as cURL" → paste it to you.
   Save it to `scraper/debug/woki_curl.txt`, then rewrite QUERY, ENDPOINTS
   and `normalize()` in `kinoheld.py` to match the real schema exactly.
   Verify with: `cd scraper; python -m sources.kinoheld 1283`

2. **Test the full pipeline:** `cd scraper; python main.py` — should write
   `data/movies.json` with real Woki showtimes, enriched with ratings.
   Then `copy data\movies.json web\public\data\` and check the site locally.

3. **Find IDs for the remaining cinemas** in `scraper/cinemas.json`
   (currently null). Same DevTools procedure per cinema, or the IDs may be
   discoverable via a kinoheld search/city GraphQL query once the schema is
   known. Cologne priority: Metropolis (OV-only house), Odeon, Filmpalette,
   OFF Broadway, Rex am Ring, Weisshaus.

4. **Kinopolis Bad Godesberg + Cinedom** are not on kinoheld — implement
   `scraper/sources/custom.py` (requests + BeautifulSoup; their sites render
   server-side).

5. **Deploy:** GitHub Desktop → publish repo → Settings→Pages→Source:
   GitHub Actions → add Secrets `TMDB_API_KEY` and `OMDB_API_KEY` (values
   are in `.env`).

## Conventions

- One scraper module per source in `scraper/sources/`; a failing cinema must
  never abort the whole run (main.py already isolates errors)
- Ratings are cached in `data/ratings_cache.json` (7-day TTL) — keep OMDb
  usage low
- Scrape politely: identifying User-Agent, once daily, no hammering
- Frontend reads `web/public/data/movies.json`; keep the JSON schema stable
  (see sample) or update `web/src/App.jsx` together with it
