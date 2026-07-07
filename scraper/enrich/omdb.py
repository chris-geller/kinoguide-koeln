"""Fetch IMDb rating + Metascore from OMDb, with a 7-day file cache.

Free key (1,000 requests/day): https://www.omdbapi.com/apikey.aspx
Export as OMDB_API_KEY. With ~40 films in cinemas at once and caching,
you'll use a fraction of the quota.
"""
from __future__ import annotations

import os
import json
import time
import requests

CACHE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "ratings_cache.json")
CACHE_TTL = 7 * 24 * 3600  # ratings rarely move; refresh weekly


def _load_cache() -> dict:
    try:
        with open(CACHE_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_cache(cache: dict) -> None:
    os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=1)


def ratings(imdb_id: str) -> dict:
    """Return {'imdb': float|None, 'metascore': int|None} for an IMDb ID."""
    if not imdb_id:
        return {"imdb": None, "metascore": None}

    cache = _load_cache()
    hit = cache.get(imdb_id)
    if hit and time.time() - hit["ts"] < CACHE_TTL:
        return hit["ratings"]

    key = os.environ.get("OMDB_API_KEY", "")
    if not key:
        raise RuntimeError("OMDB_API_KEY is not set")

    r = requests.get("https://www.omdbapi.com/",
                     params={"i": imdb_id, "apikey": key}, timeout=30)
    r.raise_for_status()
    data = r.json()

    def num(v, cast):
        try:
            return cast(v)
        except (TypeError, ValueError):
            return None

    result = {
        "imdb": num(data.get("imdbRating"), float),
        "metascore": num(data.get("Metascore"), int),
    }
    cache[imdb_id] = {"ts": time.time(), "ratings": result}
    _save_cache(cache)
    return result
