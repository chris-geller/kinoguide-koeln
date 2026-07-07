"""Scrapers for cinemas that are not (usably) on kinoheld.

Each scraper takes the cinema config dict and returns the same normalized
shape as kinoheld.fetch_shows:
    [{title, datetime, language, booking_url}]

Dispatch: the cinema entry in cinemas.json names its scraper via a
"scraper" key, e.g. { "source": "custom", "scraper": "metropolis", ... }.

Metropolis Köln (checked 2026-07-07): runs on CineWeb. The /programm page
embeds the entire program server-side as one JSON blob:

    <script type="text/javascript">
      var city = 491;
      var films = { "<slug>": { "filmTitle": ..., "performances": [ {
          "siteName": "Metropolis",
          "performances": { "<id>": {
              "date": "2026-07-07", "time": "16:15:00",
              "unixdatetime": 1783433700,
              "combinedAttributes": "OV" | null,     <- language marker
              "releasesCombined": ["2D"],
              "bookingLink": "https://kinotickets.express/metropolis-koeln/booking/<id>"
          } } } ] } };

Language: OV screenings carry combinedAttributes "OV"; OmeU films carry the
marker in the title (e.g. "... (OmeU)"); dubbed kids' films carry nothing.
NOTE: don't classify from the film-level release list — a film can have both
OV and dubbed showings (e.g. Minions), only the per-performance fields are
reliable.
"""
from __future__ import annotations

import re
import json
from datetime import datetime, timezone, timedelta

import requests

from language import classify

HEADERS = {"User-Agent": "Mozilla/5.0 (kinoguide-koeln; personal project)"}

FILMS_RE = re.compile(r"var films = (\{.*?\});\n", re.DOTALL)


def _iso_with_offset(date: str, time_: str, unixdatetime) -> str:
    """Build '2026-07-07T16:15:00+02:00' from the local date/time strings.

    The correct UTC offset falls out of comparing the local wall time with
    the unix timestamp — no timezone database needed.
    """
    local = datetime.fromisoformat(f"{date}T{time_}")
    try:
        utc = datetime.fromtimestamp(int(unixdatetime), tz=timezone.utc).replace(tzinfo=None)
        offset = round((local - utc).total_seconds() / 900) * 900  # nearest 15 min
        return local.replace(tzinfo=timezone(timedelta(seconds=offset))).isoformat()
    except (TypeError, ValueError, OSError):
        return local.isoformat()  # naive local time is still sortable/displayable


def metropolis(cinema: dict) -> list[dict]:
    url = cinema.get("url", "https://www.metropolis-koeln.de/programm")
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    m = FILMS_RE.search(resp.text)
    if not m:
        raise RuntimeError(
            "no 'var films = {...}' blob on the program page — "
            "the CineWeb site layout changed, re-inspect it (see module docstring)"
        )
    films = json.loads(m.group(1))

    shows_out = []
    for film in films.values():
        title = film.get("filmTitle") or ""
        for site in film.get("performances") or []:
            for perf in (site.get("performances") or {}).values():
                date, time_ = perf.get("date"), perf.get("time")
                if not (title and date and time_):
                    continue
                shows_out.append({
                    "title": title,
                    "datetime": _iso_with_offset(date, time_, perf.get("unixdatetime")),
                    "language": classify(
                        title,
                        perf.get("combinedAttributes") or "",
                        " ".join(perf.get("releasesCombined") or []),
                        perf.get("originalReleases") or "",
                    ),
                    "booking_url": perf.get("bookingLink") or "",
                })
    return shows_out


SCRAPERS = {"metropolis": metropolis}


def fetch_shows(cinema: dict) -> list[dict]:
    scraper = SCRAPERS.get(cinema.get("scraper", ""))
    if not scraper:
        print(f"  [todo] custom scraper for {cinema['name']} not implemented yet")
        return []
    return scraper(cinema)
