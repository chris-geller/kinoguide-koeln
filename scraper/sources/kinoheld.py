"""Fetch showtimes from kinoheld's GraphQL API (unofficial).

Schema captured 2026-07-07 from the Woki Bonn page via DevTools
(raw cURL preserved in scraper/debug/woki_curl.txt):

  POST https://next-live.kinoheld.de/graphql
  operationName: FetchProgramByMovie
  variables: {"cinemaIds": ["1283"], "first": 5, "page": 1}

Response shape:
  data.programByMovie.data[]          one entry per movie
    .name                             program title (may carry OV/OmU markers)
    .movie.title
    .showGroups[]                     one per version (e.g. dubbed vs. OmU)
      .flags[].name                   language/technology flags live here...
      .shows.data[]
        .beginning                    ISO datetime of the screening
        .deeplink                     booking URL
        .name / .flags[].name         ...and here
  data.programByMovie.paginatorInfo   count / currentPage / hasMorePages

The site pages 5 movies at a time; we request bigger pages and follow
hasMorePages so one cinema is 1-2 requests, not a dozen.

QUERY below is the captured query trimmed to the fields we parse (GraphQL
lets clients request any subset). If kinoheld changes the schema, re-capture
per the procedure in debug/woki_curl.txt.

Debug helper:
  python -m sources.kinoheld 1283            # fetch + normalize, dump JSON
  python -m sources.kinoheld 1283 --raw      # dump raw first page instead
"""
from __future__ import annotations

import sys
import json
import requests

from language import classify

ENDPOINT = "https://next-live.kinoheld.de/graphql"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (kinoguide-koeln; personal project)",
    "Content-Type": "application/json",
    "Accept": "application/graphql-response+json, application/json",
    "Accept-Language": "de",
    "Origin": "https://www.kinoheld.de",
    "Referer": "https://www.kinoheld.de/",
}

QUERY = """
query FetchProgramByMovie($cinemaIds: [ID!]!, $first: Int, $page: Int) {
  programByMovie(cinemaIds: $cinemaIds, first: $first, page: $page) {
    data {
      name
      movie {
        title
      }
      showGroups {
        flags {
          name
        }
        shows {
          data {
            id
            name
            beginning
            deeplink
            flags {
              name
            }
            cinema {
              urlSlug
              city {
                urlSlug
              }
            }
          }
        }
      }
    }
    paginatorInfo {
      count
      currentPage
      hasMorePages
    }
  }
}
"""

PAGE_SIZE = 50
MAX_PAGES = 10  # safety net; a cinema program should fit in 1-2 pages


def fetch_page(cinema_id: int | str, page: int = 1) -> dict:
    resp = requests.post(
        ENDPOINT,
        json={
            "query": QUERY,
            "variables": {
                "cinemaIds": [str(cinema_id)],
                "first": PAGE_SIZE,
                "page": page,
            },
            "operationName": "FetchProgramByMovie",
        },
        headers=HEADERS,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("errors"):
        raise RuntimeError(f"GraphQL errors: {data['errors']}")
    return data


def fetch_raw(cinema_id: int | str) -> list[dict]:
    """Return all programByMovie entries for a cinema, following pagination."""
    entries: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        result = (fetch_page(cinema_id, page).get("data") or {}).get("programByMovie") or {}
        entries.extend(result.get("data") or [])
        if not (result.get("paginatorInfo") or {}).get("hasMorePages"):
            break
    return entries


def _flag_names(flags: list | None) -> list[str]:
    return [f.get("name", "") for f in (flags or []) if isinstance(f, dict)]


import re as _re

_FSK_SUFFIX = _re.compile(r"[,·]?\s*(ab \d+|keine Angabe|FSK\s*\w*)\s*$", _re.IGNORECASE)
# trailing language markers some cinemas append to show names ("… D", "… OmU")
_LANG_SUFFIX = _re.compile(r"\s+(D|DF|OmU|OmeU|OmdU|OV|OF|Engl\.?\s*OF)\s*$")


def _title_for(show_name: str | None, movie_title: str) -> str:
    """Pick the trustworthy title for one show.

    kinoheld sometimes files a different film under a movie entry — e.g. the
    Egyptian 'Sakr w Canaria' sat inside an entry titled 'An Island Away From
    You', which then TMDB-matched to the wrong film and sent visitors to a
    ticket page for a film other than the one on the card. When the show's
    own name shares (almost) no words with the entry title, the show name is
    the one that matches what the ticket page sells — use it.
    """
    clean = lambda s: _LANG_SUFFIX.sub("", _FSK_SUFFIX.sub("", s)).strip(" -–·")
    if not show_name:
        return movie_title
    if not movie_title:
        return clean(show_name)

    tokens = lambda s: set(_re.findall(r"[a-zà-ÿäöüß0-9]+", s.lower()))
    a, b = tokens(show_name), tokens(movie_title)
    if not a or not b:
        return movie_title
    overlap = len(a & b) / min(len(a), len(b))
    if overlap >= 0.34:
        return movie_title
    return clean(show_name)


def _booking_url(show: dict) -> str:
    """Prefer the API's deeplink when it points at a specific show; fall back
    to the canonical per-show page (pattern verified live 2026-07-07):
      https://www.kinoheld.de/kino/{city}/{cinema}/vorstellung/{showId}

    Some cinemas set a generic deeplink (e.g. Bonner Kinemathek points at
    their homepage) — a URL with no path and no query identifies nothing,
    so the exact kinoheld page wins there.
    """
    deeplink = show.get("deeplink") or ""
    if deeplink:
        rest = deeplink.split("://", 1)[-1]
        is_root_only = "/" not in rest.rstrip("/") and "?" not in rest
        if not is_root_only:
            return deeplink
    cinema = show.get("cinema") or {}
    city_slug = (cinema.get("city") or {}).get("urlSlug")
    cinema_slug = cinema.get("urlSlug")
    show_id = show.get("id")
    if city_slug and cinema_slug and show_id:
        # the program listing with the show pre-selected, NOT the deep
        # /vorstellung/<id> page — that page component crashes with a JS
        # error ("can't access lexical declaration before initialization")
        # in real browsers (reported for Odeon, 2026-07-08)
        return (f"https://www.kinoheld.de/kino/{city_slug}/{cinema_slug}"
                f"/vorstellungen?showId={show_id}")
    return ""


def normalize(entries: list[dict]) -> list[dict]:
    """Turn programByMovie entries into [{title, datetime, language, booking_url}]."""
    shows_out = []
    for entry in entries:
        program_name = entry.get("name") or ""
        title = (entry.get("movie") or {}).get("title") or program_name
        for group in entry.get("showGroups") or []:
            group_flags = _flag_names(group.get("flags"))
            for show in (group.get("shows") or {}).get("data") or []:
                begin = show.get("beginning")
                if isinstance(begin, dict):  # defensive: some APIs nest this
                    begin = begin.get("iso") or begin.get("isoFull") or ""
                if not (title and begin):
                    continue
                shows_out.append({
                    "title": _title_for(show.get("name"), title),
                    "datetime": begin,
                    "language": classify(
                        program_name,
                        show.get("name") or "",
                        *group_flags,
                        *_flag_names(show.get("flags")),
                    ),
                    "booking_url": _booking_url(show),
                })
    return shows_out


def fetch_shows(cinema: dict) -> list[dict]:
    cinema_id = cinema.get("kinoheld_id")
    if not cinema_id:
        print(f"  [skip] {cinema['name']}: no kinoheld_id configured")
        return []
    return normalize(fetch_raw(cinema_id))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--raw"]
    cid = int(args[0]) if args else 1283
    if "--raw" in sys.argv:
        print(json.dumps(fetch_page(cid), indent=2, ensure_ascii=False))
    else:
        shows = normalize(fetch_raw(cid))
        print(json.dumps(shows, indent=2, ensure_ascii=False))
        print(f"\n{len(shows)} shows", file=sys.stderr)
