# Kinoprogramm Bonn · Köln

A [kinoguide.fyi](https://kinoguide.fyi/)-style cinema guide for Bonn and Cologne: every film currently playing, whether it's shown in OV / OmU / German, filterable and sortable by IMDb rating and Metascore (Letterboxd optional).

**How it works:** a Python scraper runs daily via GitHub Actions, writes `data/movies.json`, and a static React frontend renders it. No server, no database, free hosting.

```
scraper/    Python: scrape showtimes, enrich with ratings
data/       movies.json (the daily output) + ratings cache
web/        Vite + React frontend
.github/    daily cron workflow: scrape → commit → build → deploy
```

## Quick start (frontend with sample data)

```bash
cd web
npm install
npm run dev        # opens on http://localhost:5173
```

The repo ships with sample data in `web/public/data/movies.json`, so the UI works immediately.

## Setting up the scraper

1. **API keys** (both free):
   - TMDB: https://www.themoviedb.org/settings/api → `TMDB_API_KEY`
   - OMDb: https://www.omdbapi.com/apikey.aspx → `OMDB_API_KEY` (1,000 req/day; the cache in `data/ratings_cache.json` keeps usage tiny)

2. **Cinema IDs** — the manual step. `scraper/cinemas.json` lists the Bonn/Cologne cinemas but the kinoheld IDs are `null`. For each cinema:
   - Open its ticket page on kinoheld.de
   - DevTools → Network → filter XHR → find the request returning the show list
   - Note the numeric cinema ID and put it in `cinemas.json`

   ⚠️ `sources/kinoheld.py` targets kinoheld's **unofficial** widget endpoint. It may have changed shape — run `python -m sources.kinoheld <id>` to dump the raw response, then adjust the field names in `fetch_shows()` to match what you see. Kinopolis and Cinedom run their own sites; implement them in `sources/custom.py` (requests + BeautifulSoup is enough, both render server-side).

3. **Run it:**
   ```bash
   cd scraper
   pip install -r requirements.txt
   TMDB_API_KEY=xxx OMDB_API_KEY=yyy python main.py
   cp ../data/movies.json ../web/public/data/
   ```

## Deployment (GitHub Pages)

1. Push the repo to GitHub
2. Settings → Pages → Source: **GitHub Actions**
3. Settings → Secrets → Actions: add `TMDB_API_KEY` and `OMDB_API_KEY`
4. The workflow in `.github/workflows/scrape.yml` runs daily at 04:00 UTC and on every push; you can also trigger it manually from the Actions tab

Alternatively deploy `web/` on Vercel/Netlify and keep the Action just for the daily data commit — a data commit will trigger their redeploy automatically.

## Scraping etiquette

- One run per day is plenty; keep the identifying User-Agent in `kinoheld.py`
- Check robots.txt / terms of the sites you scrape, especially before adding Letterboxd (see `enrich/letterboxd.py` for the options)
- Each cinema source is isolated — one broken scraper logs an error but never kills the run

## Roadmap ideas

- Letterboxd scores, week/calendar view, per-cinema pages, PWA install, festival flags (35mm, previews, Sneak)
