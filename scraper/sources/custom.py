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


def cineweb(cinema: dict) -> list[dict]:
    """Generic CineWeb scraper — works for any cinema on that platform.

    Currently: Metropolis (metropolis-koeln.de) and Rex am Ring
    (rex-koeln.de). Rex am Ring is also on kinoheld, but kinoheld drops
    almost all of their OmU/OV markers (4 marked shows vs 128 on their own
    site), so their own site is the truthful source.
    """
    url = cinema["url"]
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


# --- Filmpalette language correction -------------------------------------
# Filmpalette is on kinoheld (clean showtimes + booking), but kinoheld drops
# their language markers. Their own homepage lists the program as plain text
# with markers like "Amores Perros (OmeU)" — we parse that once per run and
# use it to correct the language of their kinoheld showtimes by title.
# Title chars deliberately exclude digits/colons so showtimes ("20:30") act
# as separators — otherwise neighbouring titles bleed into the match.
FILMPALETTE_MARK_RE = re.compile(r"([A-Za-zÄÖÜäöüß&'’.\-][A-Za-zÄÖÜäöüß&'’.\- ]{2,60}?)\s*\((OmU|OmeU|OmdU|OV|OF)\)")


def filmpalette_language_map(url: str = "http://www.filmpalette-koeln.de/") -> dict[str, str]:
    """Return {lowercased title: 'OmU'|'OV'} parsed from filmpalette-koeln.de."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
        text = re.sub(r"<[^>]*>", " ", resp.text)
        text = text.replace("&nbsp;", " ")
        text = re.sub(r"\s+", " ", text)
    except Exception as e:
        print(f"  [warn] Filmpalette language page failed: {e}")
        return {}
    mapping = {}
    for title, marker in FILMPALETTE_MARK_RE.findall(text):
        mapping[title.strip().lower()] = classify(f"({marker})")
    return mapping


def apply_filmpalette_languages(shows: list[dict]) -> None:
    """Correct 'language' in-place for Filmpalette shows using their site."""
    mapping = filmpalette_language_map()
    if not mapping:
        return
    for s in shows:
        t = s["title"].strip().lower()
        for marked_title, lang in mapping.items():
            # exact match, or containment for reasonably long titles only
            # (avoids a short key like 'rose' hijacking unrelated films)
            if t == marked_title or (len(marked_title) >= 5 and (marked_title in t or t in marked_title)):
                s["language"] = lang
                break


# --- Kinopolis language correction ---------------------------------------
# kinoheld carries none of Kinopolis' OV/OmU markers (only tech flags), so
# their shows all defaulted to DE. Kinopolis' own program page encodes the
# version PER screening: each showtime is a <div data-performance-id="<ID>">…
# whose booking button carries data-version='["2d","ov",…]' (and a visible
# "ov Englisch" / "OmU" tech label). The <ID> equals the id in our kinoheld
# booking link (…/vorstellung/<ID>), so we map id -> version and correct by id.
#
# IMPORTANT: read the version from THIS per-showtime attribute, not from the
# nearby "OV: Moana" caption headings — those group a film's day-blocks and do
# NOT imply every screening under them is OV (a mostly-German film like Vaiana
# has a handful of OV screenings mixed in). Verified against the live page:
# this yields ~17% OV, matching what the site shows users; the caption
# approach wrongly reported ~70%.
KINOPOLIS_SHOW_RE = re.compile(r'data-performance-id="([A-Z0-9]{16,})"')
KINOPOLIS_VERSION_RE = re.compile(r"data-version='(\[[^\]]*\])'")


def kinopolis_language_map(url: str) -> dict[str, str]:
    """Return {performance_id: 'OV'|'OmU'} from a Kinopolis program page.

    Only OV/OmU ids are recorded; everything else keeps the DE default.
    """
    try:
        text = requests.get(url, headers=HEADERS, timeout=30).text
    except Exception as e:
        print(f"  [warn] Kinopolis language page failed: {e}")
        return {}
    mapping: dict[str, str] = {}
    parts = KINOPOLIS_SHOW_RE.split(text)  # [pre, id1, body1, id2, body2, …]
    for k in range(1, len(parts), 2):
        vid, body = parts[k], parts[k + 1]
        vm = KINOPOLIS_VERSION_RE.search(body[:1500])  # this show's buy button
        versions = (vm.group(1).lower() if vm else "")
        if '"omu"' in versions or '"omeu"' in versions:
            mapping[vid] = "OmU"
        elif '"ov"' in versions:
            mapping[vid] = "OV"
    return mapping


def apply_kinopolis_languages(shows: list[dict], url: str) -> None:
    """Correct 'language' in-place for Kinopolis shows using their site."""
    mapping = kinopolis_language_map(url)
    if not mapping:
        return
    for s in shows:
        m = re.search(r"vorstellung/([A-Z0-9]{16,})", s.get("booking_url") or "")
        if m and m.group(1) in mapping:
            s["language"] = mapping[m.group(1)]


SCRAPERS = {"metropolis": cineweb, "cineweb": cineweb}


def fetch_shows(cinema: dict) -> list[dict]:
    scraper = SCRAPERS.get(cinema.get("scraper", ""))
    if not scraper:
        print(f"  [todo] custom scraper for {cinema['name']} not implemented yet")
        return []
    return scraper(cinema)
