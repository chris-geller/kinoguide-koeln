"""Orchestrator: scrape all cinemas -> enrich -> write data/movies.json.

Usage:
    cd scraper
    TMDB_API_KEY=... OMDB_API_KEY=... python main.py

Design: each cinema is scraped in isolation and failures are logged but never
abort the run — one broken source shouldn't take down the whole guide.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone

from sources import kinoheld, custom
from enrich import tmdb, omdb, letterboxd
from language import clean_title

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_PATH = os.path.join(HERE, "..", "data", "movies.json")


def load_env() -> None:
    """Load API keys from ../.env so beginners don't have to set variables."""
    path = os.path.join(HERE, "..", ".env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip())


load_env()

SOURCES = {"kinoheld": kinoheld.fetch_shows, "custom": custom.fetch_shows}


def load_cinemas() -> list[dict]:
    with open(os.path.join(HERE, "cinemas.json"), encoding="utf-8") as f:
        return json.load(f)["cinemas"]


def fix_metropolis_ov(showtimes: list[dict], original_language: str | None) -> None:
    """Correct the one place our source data reliably lies about language.

    Metropolis is an original-version arthouse that tags its explicit OV
    screenings (combinedAttributes 'OV') but leaves foreign-language films
    shown with subtitles unmarked — so they fall through to 'DE'. We relabel
    such a Metropolis screening as OmU only when we're confident:
      - the film's original language is not German, and
      - the film has NO OV/OmU screening at Metropolis at all
        (if it does, the unmarked ones are the German-dubbed counterpart,
         e.g. Minions runs both OV and dubbed — leave those as DE).
    German-language films (Conni etc.) are never touched. Mutates in place.
    """
    if not original_language or original_language == "de":
        return
    metro = [s for s in showtimes if s["cinema"] == "Metropolis"]
    if any(s["language"] in ("OV", "OmU") for s in metro):
        return
    for s in metro:
        if s["language"] == "DE":
            s["language"] = "OmU"


def main() -> None:
    movies: dict[str, dict] = {}  # keyed by cleaned title

    for cinema in load_cinemas():
        fetch = SOURCES.get(cinema.get("source"))
        if not fetch:
            continue
        print(f"Scraping {cinema['name']} ({cinema['city']})…")
        try:
            shows = fetch(cinema)
        except Exception as e:  # isolate failures per cinema
            print(f"  [error] {cinema['name']}: {e}")
            continue

        # kinoheld drops Filmpalette's language markers; their own homepage
        # has them ("Amores Perros (OmeU)") — correct the labels from there.
        if cinema["name"] == "Filmpalette":
            custom.apply_filmpalette_languages(shows)
        # kinoheld carries no language markers for Kinopolis; their own program
        # page does (per-screening id). Correct by booking id.
        if cinema["name"] == "Kinopolis Bad Godesberg" and cinema.get("website"):
            custom.apply_kinopolis_languages(shows, cinema["website"].rstrip("/") + "/programm")

        for show in shows:
            key = clean_title(show["title"]).lower()
            entry = movies.setdefault(key, {"title_raw": clean_title(show["title"]),
                                            "showtimes": []})
            # Link policy: exact page for that showtime. Chain deeplinks and
            # kinotickets/CineWeb links are already exact; for kinoheld-only
            # cinemas the kinoheld per-show page is the exact one (it's also
            # their actual ticket shop). Cinema homepage only as last resort.
            url = show.get("booking_url", "") or cinema.get("website", "")
            entry["showtimes"].append({
                "cinema": cinema["name"],
                "city": cinema["city"],
                "datetime": show["datetime"],
                "language": show["language"],
                "booking_url": url,
            })

    print(f"\nEnriching {len(movies)} unique films…")
    result = []
    for key, entry in movies.items():
        meta = None
        try:
            meta = tmdb.lookup(entry["title_raw"])
        except Exception as e:
            print(f"  [warn] TMDB failed for '{entry['title_raw']}': {e}")

        scores = {"imdb": None, "metascore": None, "letterboxd": None}
        imdb_id = (meta or {}).get("imdb_id")
        if imdb_id:
            try:
                scores.update(omdb.ratings(imdb_id))
            except Exception as e:
                print(f"  [warn] OMDb failed for {imdb_id}: {e}")
            scores["letterboxd"] = letterboxd.rating(imdb_id)

        orig_lang = (meta or {}).get("original_language")
        showtimes = sorted(entry["showtimes"], key=lambda s: s["datetime"])
        fix_metropolis_ov(showtimes, orig_lang)

        result.append({
            "id": imdb_id or key,
            "title_de": (meta or {}).get("title_de", entry["title_raw"]),
            "title_original": (meta or {}).get("title_original", entry["title_raw"]),
            "year": (meta or {}).get("year"),
            "release_date": (meta or {}).get("release_date"),
            "runtime": (meta or {}).get("runtime"),
            "poster": (meta or {}).get("poster"),
            "genres": (meta or {}).get("genres", []),
            "age_rating": (meta or {}).get("age_rating"),
            "overview_de": (meta or {}).get("overview_de"),
            "overview_en": (meta or {}).get("overview_en"),
            "original_language": orig_lang,
            "countries": (meta or {}).get("countries", []),
            "directors": (meta or {}).get("directors", []),
            "tags": (meta or {}).get("tags", []),
            "trailer_de": (meta or {}).get("trailer_de"),
            "trailer_en": (meta or {}).get("trailer_en"),
            "ratings": scores,
            "showtimes": showtimes,
        })

    # Two title variants (e.g. kinoheld vs. Metropolis punctuation) can resolve
    # to the same IMDb film — merge those so each movie is one card.
    merged: dict[str, dict] = {}
    for m in result:
        hit = merged.get(m["id"])
        if hit:
            hit["showtimes"] = sorted(hit["showtimes"] + m["showtimes"],
                                      key=lambda s: s["datetime"])
        else:
            merged[m["id"]] = m
    result = list(merged.values())

    result.sort(key=lambda m: m["ratings"]["imdb"] or 0, reverse=True)
    # static per-cinema facts for the frontend
    cinema_info = {c["name"]: {"city": c["city"], "website": c.get("website")}
                   for c in load_cinemas()}
    payload = {"generated_at": datetime.now(timezone.utc).isoformat(),
               "cinemas": cinema_info,
               "movies": result}

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
    print(f"\nWrote {len(result)} films to {OUT_PATH}")


if __name__ == "__main__":
    main()
