import { useEffect, useMemo, useState } from 'react'

// --- filter option definitions -------------------------------------------
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
  { id: 'recent', label: 'Neu' },
]
// German TMDB genre names that actually signal a film made for kids/families.
// (Deliberately NOT "Abenteuer" — Adventure also tags FSK-12 blockbusters like
// Dune or Inception, which aren't kids films.)
const KID_GENRES = ['Familie', 'Animation']

// A film counts as one for families with children ~6–12 if it carries a
// family/animation genre and is rated at most FSK 12 (or not yet rated).
// Tunable here without re-scraping.
function isKidsFilm(m) {
  const age = m.age_rating
  if (age != null && age > 12) return false
  return (m.genres || []).some((g) => KID_GENRES.includes(g))
}

function matchesLang(show, lang) {
  if (lang === 'alle') return true
  if (lang === 'de') return show.language === 'DE'
  return show.language === 'OV' || show.language === 'OmU'
}

function dayKey(iso) {
  return iso.slice(0, 10)
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function fmtDay(iso) {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Heute'
  if (d.toDateString() === tomorrow.toDateString()) return 'Morgen'
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtDayShort(key) {
  const d = new Date(key + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return 'Heute'
  if (d.toDateString() === tomorrow.toDateString()) return 'Morgen'
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

// --- small components ------------------------------------------------------
function LangBadge({ lang }) {
  const label = lang === 'DE' ? 'German' : lang
  return <span className={`badge-lang lang-${lang.toLowerCase()}`}>{label}</span>
}

function Card({ movie, onOpen }) {
  const langs = [...new Set(movie.showtimes.map((s) => s.language))]
  const imdb = movie.ratings.imdb
  return (
    <button className="card" onClick={() => onOpen(movie)}>
      <div className="card-poster">
        {movie.poster
          ? <img src={movie.poster} alt="" loading="lazy" />
          : <div className="poster-fallback">{(movie.title_original || movie.title_de).slice(0, 2)}</div>}
        {imdb != null && (
          <span className="badge-rating"><span className="star">★</span>{imdb.toFixed(1)}</span>
        )}
        <div className="badge-langs">
          {langs.includes('OV') && <LangBadge lang="OV" />}
          {langs.includes('OmU') && <LangBadge lang="OmU" />}
          {langs.includes('DE') && <LangBadge lang="DE" />}
        </div>
        {movie.age_rating != null && <span className="badge-fsk">FSK {movie.age_rating}</span>}
      </div>
      <div className="card-body">
        <h3 title={movie.title_de}>{movie.title_de}</h3>
        <p className="card-meta">
          {movie.year}
          {(movie.genres || []).slice(0, 2).map((g) => <span className="genre-pill" key={g}>{g}</span>)}
        </p>
        {movie.overview && <p className="card-desc">{movie.overview}</p>}
      </div>
    </button>
  )
}

function Modal({ movie, shows, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const byCinema = {}
  for (const s of shows) {
    const key = `${s.cinema} · ${s.city}`
    ;(byCinema[key] = byCinema[key] || []).push(s)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Schließen">✕</button>
        <div className="modal-head">
          {movie.poster && <img className="modal-poster" src={movie.poster} alt="" />}
          <div>
            <h2>{movie.title_de}</h2>
            {movie.title_original !== movie.title_de && <p className="modal-orig">{movie.title_original}</p>}
            <p className="modal-sub">
              {[movie.year, movie.runtime && `${movie.runtime} min`, movie.age_rating != null && `FSK ${movie.age_rating}`]
                .filter(Boolean).join(' · ')}
            </p>
            <p className="modal-genres">{(movie.genres || []).map((g) => <span className="genre-pill" key={g}>{g}</span>)}</p>
            <div className="modal-ratings">
              <span><b>{movie.ratings.imdb ?? '–'}</b> IMDb</span>
              <span><b>{movie.ratings.metascore ?? '–'}</b> Meta</span>
              <span><b>{movie.ratings.letterboxd ?? '–'}</b> Letterboxd</span>
            </div>
          </div>
        </div>
        {movie.overview && <p className="modal-desc">{movie.overview}</p>}
        <div className="modal-shows">
          {Object.entries(byCinema).map(([cinema, times]) => (
            <div className="cinema-row" key={cinema}>
              <span className="cinema-name">{cinema}</span>
              <span className="times">
                {times.map((t, i) => {
                  const chip = (
                    <span className={`time lang-${t.language.toLowerCase()}`}>
                      <span className="time-day">{fmtDay(t.datetime)}</span> {fmtTime(t.datetime)}
                      <span className="lang-tag">{t.language}</span>
                    </span>
                  )
                  return t.booking_url
                    ? <a key={i} href={t.booking_url} target="_blank" rel="noreferrer">{chip}</a>
                    : <span key={i}>{chip}</span>
                })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- main app --------------------------------------------------------------
export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [selected, setSelected] = useState(null)

  const [q, setQ] = useState('')
  const [city, setCity] = useState('Alle')
  const [lang, setLang] = useState('alle')
  const [sort, setSort] = useState('imdb')
  const [minImdb, setMinImdb] = useState(0)
  const [genres, setGenres] = useState([])       // selected genre names
  const [kidsOnly, setKidsOnly] = useState(false)
  const [cinema, setCinema] = useState('Alle')
  const [date, setDate] = useState('Alle')
  const [timeFrom, setTimeFrom] = useState(0)
  const [timeTo, setTimeTo] = useState(24)

  useEffect(() => {
    fetch('data/movies.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  // option lists derived from the data
  const allGenres = useMemo(() => {
    if (!data) return []
    const set = new Set()
    for (const m of data.movies) for (const g of m.genres || []) set.add(g)
    return [...set].sort((a, b) => a.localeCompare(b, 'de'))
  }, [data])

  const allCinemas = useMemo(() => {
    if (!data) return []
    const set = new Set()
    for (const m of data.movies) for (const s of m.showtimes) set.add(s.cinema)
    return [...set].sort((a, b) => a.localeCompare(b, 'de'))
  }, [data])

  const allDates = useMemo(() => {
    if (!data) return []
    const set = new Set()
    for (const m of data.movies) for (const s of m.showtimes) set.add(dayKey(s.datetime))
    return [...set].sort()
  }, [data])

  // showtimes of a movie that pass the when/where/version filters
  const showsFor = (m) => m.showtimes.filter((s) => {
    if (!matchesLang(s, lang)) return false
    if (city !== 'Alle' && s.city !== city) return false
    if (cinema !== 'Alle' && s.cinema !== cinema) return false
    if (date !== 'Alle' && dayKey(s.datetime) !== date) return false
    const d = new Date(s.datetime)
    const hour = d.getHours() + d.getMinutes() / 60
    if (hour < timeFrom || hour > timeTo) return false
    return true
  })

  const movies = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    return data.movies
      .filter((m) => (m.ratings.imdb ?? 0) >= minImdb)
      .filter((m) => !kidsOnly || isKidsFilm(m))
      .filter((m) => genres.length === 0 || (m.genres || []).some((g) => genres.includes(g)))
      .filter((m) => !needle
        || m.title_de.toLowerCase().includes(needle)
        || (m.title_original || '').toLowerCase().includes(needle))
      .map((m) => ({ m, shows: showsFor(m) }))
      .filter((x) => x.shows.length > 0)
      .sort((a, b) => {
        if (sort === 'recent') return (b.m.year ?? 0) - (a.m.year ?? 0)
        return (b.m.ratings[sort] ?? -1) - (a.m.ratings[sort] ?? -1)
      })
  }, [data, q, city, lang, sort, minImdb, genres, kidsOnly, cinema, date, timeFrom, timeTo])

  const toggleGenre = (g) =>
    setGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])

  const resetFilters = () => {
    setQ(''); setCity('Alle'); setLang('alle'); setMinImdb(0); setGenres([])
    setKidsOnly(false); setCinema('Alle'); setDate('Alle'); setTimeFrom(0); setTimeTo(24)
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">Kinoguide <span>Bonn · Köln</span></div>
        {data && <div className="stand">Stand {new Date(data.generated_at).toLocaleDateString('de-DE')}</div>}
      </header>

      <div className="toolbar">
        <div className="search">
          <span className="search-icon">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filme suchen…" />
        </div>
        <button
          className={`kids-btn ${kidsOnly ? 'on' : ''}`}
          onClick={() => setKidsOnly((v) => !v)}
          title="Filme für Familien mit Kindern von 6 bis 12"
        >
          🧒 Kinderfilme
        </button>
        <button className={`filters-btn ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters((v) => !v)}>
          ⚙ Filter {showFilters ? '▲' : '▼'}
        </button>
      </div>

      <div className="sortrow">
        <div className="city-switch" role="group" aria-label="Stadt">
          {CITIES.map((c) => (
            <button key={c} className={city === c ? 'on' : ''} onClick={() => setCity(c)}>
              {c === 'Alle' ? 'Beide' : c}
            </button>
          ))}
        </div>
        <span className="sortrow-label">Sortieren:</span>
        {SORTS.map((s) => (
          <button key={s.id} className={`chip ${sort === s.id ? 'on' : ''}`} onClick={() => setSort(s.id)}>{s.label}</button>
        ))}
        {data && <span className="count">{movies.length} Filme</span>}
      </div>

      {showFilters && (
        <section className="panel">
          <div className="field">
            <label>Genres</label>
            <div className="pills">
              {allGenres.map((g) => (
                <button key={g} className={`pill ${genres.includes(g) ? 'on' : ''}`} onClick={() => toggleGenre(g)}>{g}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Fassung</label>
            <div className="pills">
              {LANGS.map((l) => (
                <button key={l.id} className={`pill ${lang === l.id ? 'on' : ''}`} onClick={() => setLang(l.id)}>{l.label}</button>
              ))}
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label>Kino</label>
              <select value={cinema} onChange={(e) => setCinema(e.target.value)}>
                <option value="Alle">Alle Kinos</option>
                {allCinemas.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Datum</label>
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                <option value="Alle">Alle Tage</option>
                {allDates.map((d) => <option key={d} value={d}>{fmtDayShort(d)}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>IMDb mindestens: <b>{minImdb === 0 ? 'egal' : minImdb.toFixed(1)}</b></label>
            <input type="range" min="0" max="9" step="0.5" value={minImdb} onChange={(e) => setMinImdb(+e.target.value)} />
          </div>

          <div className="field">
            <label>Uhrzeit: <b>{String(timeFrom).padStart(2, '0')}:00 – {timeTo === 24 ? '24:00' : String(timeTo).padStart(2, '0') + ':00'}</b></label>
            <div className="time-sliders">
              <input type="range" min="0" max="24" value={timeFrom} onChange={(e) => setTimeFrom(Math.min(+e.target.value, timeTo))} />
              <input type="range" min="0" max="24" value={timeTo} onChange={(e) => setTimeTo(Math.max(+e.target.value, timeFrom))} />
            </div>
          </div>

          <button className="reset" onClick={resetFilters}>Filter zurücksetzen</button>
        </section>
      )}

      <main>
        {error && <p className="empty">Programm konnte nicht geladen werden ({error}).</p>}
        {!error && !data && <p className="empty">Lade Programm…</p>}
        {data && movies.length === 0 && <p className="empty">Keine Filme für diese Filter. Setz die Filter zurück, um alles zu sehen.</p>}
        <div className="grid">
          {movies.map(({ m }, i) => <Card key={`${m.id}-${i}`} movie={m} onOpen={setSelected} />)}
        </div>
      </main>

      {selected && <Modal movie={selected} shows={showsFor(selected)} onClose={() => setSelected(null)} />}

      <footer>
        <p>Bewertungen: IMDb &amp; Metascore via OMDb, Metadaten &amp; FSK via TMDB. Alle Angaben ohne Gewähr.</p>
      </footer>
    </div>
  )
}
