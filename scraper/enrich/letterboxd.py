"""Letterboxd ratings — optional, not implemented by default.

Letterboxd has no open public API (their API is invite-only). Options:
  1. Skip it. IMDb + Metascore already cover most filtering needs.
  2. Scrape the film page: https://letterboxd.com/imdb/<imdb_id>/ redirects to
     the film, whose HTML contains the average rating in a meta tag.
     If you do this: cache aggressively (weekly), throttle to ~1 req/sec,
     and check their robots.txt / terms first.
  3. Apply for API access: https://letterboxd.com/api-beta/
"""


def rating(imdb_id: str) -> float | None:
    return None
