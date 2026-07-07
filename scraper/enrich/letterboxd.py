"""Letterboxd average rating (0–5) for an IMDb id, via polite page scraping.

Letterboxd has no open API (theirs is invite-only). Their robots.txt (checked
2026-07-07) only disallows browse/sort pages for generic user agents — film
pages are fine. The rating sits in a meta tag:

    <meta name="twitter:data2" content="4.23 out of 5" />

reachable via the stable redirect https://letterboxd.com/imdb/<imdb_id>/.

We stay polite: identifying User-Agent, ~1 request/second, and a 7-day file
cache so a daily scrape re-fetches each film at most weekly. Any failure
returns None — a missing Letterboxd score must never break the pipeline.
"""
from __future__ import annotations

import os
import re
import json
import time

import requests

CACHE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "letterboxd_cache.json")
CACHE_TTL = 7 * 24 * 3600
THROTTLE_SECONDS = 1.0

HEADERS = {"User-Agent": "Mozilla/5.0 (kinoguide-koeln; personal project)"}

RATING_RE = re.compile(r'name="twitter:data2"\s+content="([\d.]+) out of 5"')

_last_request = 0.0


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


def rating(imdb_id: str) -> float | None:
    """Return the Letterboxd average (e.g. 4.2) or None. Never raises."""
    if not imdb_id:
        return None
    try:
        cache = _load_cache()
        hit = cache.get(imdb_id)
        if hit and time.time() - hit["ts"] < CACHE_TTL:
            return hit["rating"]

        global _last_request
        wait = THROTTLE_SECONDS - (time.time() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.time()

        r = requests.get(f"https://letterboxd.com/imdb/{imdb_id}/",
                         headers=HEADERS, timeout=20, allow_redirects=True)
        value = None
        if r.status_code == 200:
            m = RATING_RE.search(r.text)
            if m:
                value = round(float(m.group(1)), 2)

        # cache misses too (film not on Letterboxd / no rating yet),
        # so we don't hammer the same missing films every day
        cache[imdb_id] = {"ts": time.time(), "rating": value}
        _save_cache(cache)
        return value
    except Exception:
        return None
