import { useEffect, useMemo, useState } from 'react'

const CITIES = ['Alle', 'Bonn', 'Köln']
const LANGS = [
  { id: 'alle', label: 'Alle Fassungen' },
  { id: 'ovomu', label: 'OV / OmU' },
  { id: 'de', label: 'Deutsch' },
]
const SORTS = [
  { id: 'imdb', label: 'IMDb' },
  { id: 'metascore', label: 'Metascore' },
  { id: 'letterboxd', label: 'Letterboxd' },
]
const MIN_IMDB = [0, 6, 7, 8]

function matchesLang(show, lang) {
  if (lang === 'alle') return true
  if (lang === 'de') return show.language === 'DE'
  return show.language === 'OV' || show.language === 'OmU'
}

function fmtTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function fmtDay(iso) {
  const d = new Date(iso)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) return 'Heute'
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Placeholder({ title }) {
  return <div className="poster placeholder" aria-hidden="true">{title.slice(0, 2)}</div>
}

function Ratings({ r }) {
  const cell = (label, value) => (
    <div className="rating">
      <span className="rating-label">{label}</span>
      <span className="rating-value">{value ?? '–'}</span>
    </div>
  )
  return (
    <div className="ratings">
      {cell('IMDb', r.imdb)}
      {cell('Meta', r.metascore)}
      {cell('LB', r.letterboxd)}
    </div>
  )
}

function FilmRow({ movie, lang, city }) {
  const shows = movie.showtimes.filter(
    (s) => matchesLang(s, lang) && (city === 'Alle' || s.city === city)
  )
  if (shows.length === 0) return null

  const byCinema = {}
  for (const s of shows) {
    const key = `${s.cinema} · ${s.city}`
    ;(byCinema[key] = byCinema[key] || []).push(s)
  }

  return (
    <article className="film">
      {movie.poster
        ? <img className="poster" src={movie.poster} alt="" loading="lazy" />
        : <Placeholder title={movie.title_original || movie.title_de} />}
      <div className="film-main">
        <header>
          <h2>{movie.title_de}</h2>
          <p className="film-sub">
            {movie.title_original !== movie.title_de && <span>{movie.title_original} · </span>}
            {movie.year}{movie.runtime ? ` · ${movie.runtime} min` : ''}
          </p>
        </header>
        <div className="cinemas">
          {Object.entries(byCinema).map(([cinema, times]) => (
            <div className="cinema-row" key={cinema}>
              <span className="cinema-name">{cinema}</span>
              <span className="times">
                {times.map((t, i) => {
                  const chip = (
                    <span key={i} className={`time lang-${t.language.toLowerCase()}`}>
                      <span className="time-day">{fmtDay(t.datetime)}</span> {fmtTime(t.datetime)}
                      <span className="lang-tag">{t.language}</span>
                    </span>
                  )
                  return t.booking_url
                    ? <a key={i} href={t.booking_url} target="_blank" rel="noreferrer">{chip}</a>
                    : chip
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
      <Ratings r={movie.ratings} />
    </article>
  )
}

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [city, setCity] = useState('Alle')
  const [lang, setLang] = useState('alle')
  const [sort, setSort] = useState('imdb')
  const [minImdb, setMinImdb] = useState(0)

  useEffect(() => {
    fetch('data/movies.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  const movies = useMemo(() => {
    if (!data) return []
    return data.movies
      .filter((m) => (m.ratings.imdb ?? 0) >= minImdb)
      .filter((m) => m.showtimes.some(
        (s) => matchesLang(s, lang) && (city === 'Alle' || s.city === city)
      ))
      .sort((a, b) => (b.ratings[sort] ?? -1) - (a.ratings[sort] ?? -1))
  }, [data, city, lang, sort, minImdb])

  return (
    <div className="page">
      <header className="masthead">
        <h1>Kinoprogramm</h1>
        <p className="masthead-sub">
          Bonn · Köln
          {data && <span className="masthead-date"> — Stand {new Date(data.generated_at).toLocaleDateString('de-DE')}</span>}
        </p>
      </header>

      <nav className="filters" aria-label="Filter">
        <div className="filter-group" role="group" aria-label="Stadt">
          {CITIES.map((c) => (
            <button key={c} className={city === c ? 'on' : ''} onClick={() => setCity(c)}>{c}</button>
          ))}
        </div>
        <div className="filter-group" role="group" aria-label="Sprache">
          {LANGS.map((l) => (
            <button key={l.id} className={lang === l.id ? 'on' : ''} onClick={() => setLang(l.id)}>{l.label}</button>
          ))}
        </div>
        <div className="filter-group" role="group" aria-label="Mindestbewertung">
          {MIN_IMDB.map((v) => (
            <button key={v} className={minImdb === v ? 'on' : ''} onClick={() => setMinImdb(v)}>
              {v === 0 ? 'Alle' : `IMDb ≥ ${v}`}
            </button>
          ))}
        </div>
        <div className="filter-group" role="group" aria-label="Sortierung">
          {SORTS.map((s) => (
            <button key={s.id} className={sort === s.id ? 'on' : ''} onClick={() => setSort(s.id)}>
              ↓ {s.label}
            </button>
          ))}
        </div>
      </nav>

      <main>
        {error && <p className="empty">Programm konnte nicht geladen werden ({error}). Liegt data/movies.json vor?</p>}
        {!error && !data && <p className="empty">Lade Programm…</p>}
        {data && movies.length === 0 && (
          <p className="empty">Keine Vorstellungen für diese Filter. Filter zurücksetzen, um alles zu sehen.</p>
        )}
        {movies.map((m) => <FilmRow key={m.id} movie={m} lang={lang} city={city} />)}
      </main>

      <footer>
        <p>Bewertungen: IMDb &amp; Metascore via OMDb, Metadaten via TMDB. Ohne Gewähr.</p>
      </footer>
    </div>
  )
}
