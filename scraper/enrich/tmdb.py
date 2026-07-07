"""Resolve a (German) movie title to TMDB metadata + IMDb ID.

Get a free API key at https://www.themoviedb.org/settings/api and export it
as TMDB_API_KEY.
"""
from __future__ import annotations

import os
import requests

API = "https://api.themoviedb.org/3"
IMG = "https://image.tmdb.org/t/p/w342"


def _key() -> str:
    key = os.environ.get("TMDB_API_KEY", "")
    if not key:
        raise RuntimeError("TMDB_API_KEY is not set")
    return key


def lookup(title: str, year: int | None = None) -> dict | None:
    """Search TMDB with a German title, return metadata dict or None."""
    params = {"api_key": _key(), "query": title, "language": "de-DE"}
    if year:
        params["year"] = year
    r = requests.get(f"{API}/search/movie", params=params, timeout=30)
    r.raise_for_status()
    results = r.json().get("results", [])
    if not results:
        return None

    best = results[0]
    detail = requests.get(
        f"{API}/movie/{best['id']}",
        params={"api_key": _key(), "language": "de-DE",
                "append_to_response": "external_ids"},
        timeout=30,
    ).json()

    return {
        "tmdb_id": best["id"],
        "imdb_id": detail.get("external_ids", {}).get("imdb_id"),
        "title_de": detail.get("title") or title,
        "title_original": detail.get("original_title") or title,
        "year": int((detail.get("release_date") or "0000")[:4]) or None,
        "runtime": detail.get("runtime"),
        "poster": IMG + detail["poster_path"] if detail.get("poster_path") else None,
    }
