import { useEffect, useMemo, useState } from 'react'

// --- i18n ------------------------------------------------------------------
const T = {
  de: {
    locale: 'de-DE',
    search: 'Filme suchen…',
    kids: '🧒 Kinderfilme',
    kidsTitle: 'Filme für Familien mit Kindern von 6 bis 12',
    lastMinute: '⏰ Last Minute',
    lastMinuteTitle: 'Filme, die jetzt oder in den nächsten 4 Stunden starten',
    filter: 'Filter',
    sortLabel: 'Sortieren:',
    sortNew: 'Neu',
    bothCities: 'Beide',
    favorites: 'Favoriten',
    films: 'Filme',
    stand: 'Stand',
    genres: 'Genres',
    version: 'Fassung',
    allVersions: 'Alle Fassungen',
    germanVersion: 'Deutsch',
    cinemaLabel: 'Kino',
    allCinemas: 'Alle Kinos',
    dateLabel: 'Datum',
    allDays: 'Alle Tage',
    imdbMin: 'IMDb mindestens:',
    anyRating: 'egal',
    timeLabel: 'Uhrzeit:',
    reset: 'Filter zurücksetzen',
    today: 'Heute',
    tomorrow: 'Morgen',
    loading: 'Lade Programm…',
    loadError: (e) => `Programm konnte nicht geladen werden (${e}).`,
    empty: 'Keine Filme für diese Filter. Setz die Filter zurück, um alles zu sehen.',
    trailerDe: '▶ Trailer (Deutsch)',
    trailerOrig: '▶ Trailer (Original)',
    trailerOnly: '▶ Trailer',
    imdbLink: 'Auf IMDb ansehen',
    metaLink: 'Auf Metacritic suchen',
    lbLink: 'Auf Letterboxd ansehen',
    favOn: 'Aus Favoriten entfernen',
    favOff: 'Als Favorit merken',
    langBadgeDe: 'Deutsch',
    topicsLabel: 'Themen',
    topics: {
      women_directed: '♀ Regie: Frauen',
      queer: '🏳️‍🌈 Queer',
      international: '🌍 International',
    },
    origLangLabel: 'Originalsprache',
    origLabel: 'Original',
    countryLabel: 'Land',
    director: 'Regie',
    footer: 'Bewertungen: IMDb & Metascore via OMDb, Metadaten & FSK via TMDB. Themen- und Sprachfilter basieren auf TMDB-Daten (Originalsprache, Regie, Verschlagwortung) — sie zeigen Filme auf, sind aber nicht vollständig. OV/OmU wird aus den Kino-Angaben erkannt; einige Programmkinos kennzeichnen Originalfassungen nicht immer.',
    thanksPre: 'Inspiriert von Steven Kocadags wunderbarem',
    thanksPost: 'für Berlin — danke! 💙',
  },
  en: {
    locale: 'en-GB',
    search: 'Search movies…',
    kids: '🧒 Kids movies',
    kidsTitle: 'Movies for families with kids aged 6 to 12',
    lastMinute: '⏰ Last minute',
    lastMinuteTitle: 'Movies starting now or within the next 4 hours',
    filter: 'Filters',
    sortLabel: 'Sort by:',
    sortNew: 'Recent',
    bothCities: 'Both',
    favorites: 'Favorites',
    films: 'movies',
    stand: 'Updated',
    genres: 'Genres',
    version: 'Version',
    allVersions: 'All versions',
    germanVersion: 'German',
    cinemaLabel: 'Cinema',
    allCinemas: 'All cinemas',
    dateLabel: 'Date',
    allDays: 'All days',
    imdbMin: 'IMDb at least:',
    anyRating: 'any',
    timeLabel: 'Time:',
    reset: 'Reset filters',
    today: 'Today',
    tomorrow: 'Tomorrow',
    loading: 'Loading program…',
    loadError: (e) => `Could not load the program (${e}).`,
    empty: 'No movies match these filters. Reset the filters to see everything.',
    trailerDe: '▶ Trailer (German)',
    trailerOrig: '▶ Trailer (Original)',
    trailerOnly: '▶ Trailer',
    imdbLink: 'View on IMDb',
    metaLink: 'Search on Metacritic',
    lbLink: 'View on Letterboxd',
    favOn: 'Remove from favorites',
    favOff: 'Mark as favorite',
    langBadgeDe: 'German',
    topicsLabel: 'Topics',
    topics: {
      women_directed: '♀ Directed by women',
      queer: '🏳️‍🌈 Queer',
      international: '🌍 International',
    },
    origLangLabel: 'Original language',
    origLabel: 'Original',
    countryLabel: 'Country',
    director: 'Director',
    footer: 'Ratings: IMDb & Metascore via OMDb, metadata & FSK via TMDB. Topic and language filters are based on TMDB data (original language, director, keywords) — they surface films but aren\'t exhaustive. OV/OmU is read from the cinemas\' listings; some arthouse cinemas don\'t always tag original-version screenings.',
    thanksPre: 'Inspired by Steven Kocadag\'s wonderful',
    thanksPost: 'for Berlin — thank you! 💙',
  },
}

// Country ISO code → flag emoji (regional indicator symbols) + localized name
const countryFlag = (iso) =>
  iso && iso.length === 2
    ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
    : ''
const countryName = (iso, ui) => {
  try {
    return new Intl.DisplayNames([ui === 'en' ? 'en' : 'de'], { type: 'region' }).of(iso) || iso
  } catch {
    return iso
  }
}

const TOPIC_IDS = ['women_directed', 'queer', 'international']

// Original-language ISO 639-1 → display names + flag, for the language filter
// and the "Original: …" line in the popup. Only codes that appear in the data
// get a button; anything unmapped falls back to the raw code.
const LANGUAGES = {
  en: { flag: '🇬🇧', de: 'Englisch', en: 'English' },
  de: { flag: '🇩🇪', de: 'Deutsch', en: 'German' },
  fr: { flag: '🇫🇷', de: 'Französisch', en: 'French' },
  es: { flag: '🇪🇸', de: 'Spanisch', en: 'Spanish' },
  it: { flag: '🇮🇹', de: 'Italienisch', en: 'Italian' },
  ja: { flag: '🇯🇵', de: 'Japanisch', en: 'Japanese' },
  ko: { flag: '🇰🇷', de: 'Koreanisch', en: 'Korean' },
  zh: { flag: '🇨🇳', de: 'Chinesisch', en: 'Chinese' },
  hi: { flag: '🇮🇳', de: 'Hindi', en: 'Hindi' },
  sv: { flag: '🇸🇪', de: 'Schwedisch', en: 'Swedish' },
  no: { flag: '🇳🇴', de: 'Norwegisch', en: 'Norwegian' },
  nl: { flag: '🇳🇱', de: 'Niederländisch', en: 'Dutch' },
  pt: { flag: '🇵🇹', de: 'Portugiesisch', en: 'Portuguese' },
  el: { flag: '🇬🇷', de: 'Griechisch', en: 'Greek' },
  uk: { flag: '🇺🇦', de: 'Ukrainisch', en: 'Ukrainian' },
  ar: { flag: '🇸🇦', de: 'Arabisch', en: 'Arabic' },
  tr: { flag: '🇹🇷', de: 'Türkisch', en: 'Turkish' },
  is: { flag: '🇮🇸', de: 'Isländisch', en: 'Icelandic' },
  ka: { flag: '🇬🇪', de: 'Georgisch', en: 'Georgian' },
  tl: { flag: '🇵🇭', de: 'Philippinisch', en: 'Filipino' },
}
const langName = (code, ui) => (LANGUAGES[code] ? LANGUAGES[code][ui] : (code || '').toUpperCase())
const langFlag = (code) => (LANGUAGES[code] ? LANGUAGES[code].flag + ' ' : '')

// TMDB delivers genre names in German; translate for the English UI.
const GENRES_EN = {
  'Abenteuer': 'Adventure', 'Dokumentarfilm': 'Documentary', 'Familie': 'Family',
  'Historie': 'History', 'Komödie': 'Comedy', 'Kriegsfilm': 'War', 'Krimi': 'Crime',
  'Liebesfilm': 'Romance', 'Musik': 'Music', 'TV-Film': 'TV Movie',
}
const genreName = (g, ui) => (ui === 'en' ? (GENRES_EN[g] || g) : g)

// --- filter option definitions -------------------------------------------
const CITIES = ['Alle', 'Bonn', 'Köln']
const LANGS = [
  { id: 'alle', labelKey: 'allVersions' },
  { id: 'ovomu', label: 'OV / OmU' },
  { id: 'de', labelKey: 'germanVersion' },
]
const SORTS = [
  { id: 'imdb', label: 'IMDb' },
  { id: 'metascore', label: 'Metascore' },
  { id: 'letterboxd', label: 'Letterboxd' },
  { id: 'recent', labelKey: 'sortNew' },
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

// Topic pills: women_directed/queer come from TMDB tags; "international" is
// derived from the film's original language (anything but German or English).
function matchTopic(m, tag) {
  if (tag === 'international') {
    const l = m.original_language
    return !!l && l !== 'de' && l !== 'en'
  }
  return (m.tags || []).includes(tag)
}

function dayKey(iso) {
  return iso.slice(0, 10)
}

function fmtTime(iso, t) {
  return new Date(iso).toLocaleTimeString(t.locale, { hour: '2-digit', minute: '2-digit' })
}

function fmtDay(iso, t) {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return t.today
  if (d.toDateString() === tomorrow.toDateString()) return t.tomorrow
  return d.toLocaleDateString(t.locale, { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtDayShort(key, t) {
  const d = new Date(key + 'T12:00:00')
  const today = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === today.toDateString()) return t.today
  if (d.toDateString() === tomorrow.toDateString()) return t.tomorrow
  return d.toLocaleDateString(t.locale, { weekday: 'short', day: '2-digit', month: '2-digit' })
}

// Display title / overview depending on UI language
const displayTitle = (m, ui) => (ui === 'en' ? (m.title_original || m.title_de) : m.title_de)
const displaySubtitle = (m, ui) => {
  const other = ui === 'en' ? m.title_de : m.title_original
  return other !== displayTitle(m, ui) ? other : null
}
const displayOverview = (m, ui) =>
  ui === 'en' ? (m.overview_en || m.overview_de) : (m.overview_de || m.overview_en)

// --- small components ------------------------------------------------------
function LangBadge({ lang, t }) {
  const label = lang === 'DE' ? t.langBadgeDe : lang
  return <span className={`badge-lang lang-${lang.toLowerCase()}`}>{label}</span>
}

// Corner badge mirrors the metric the list is sorted by
const BADGE_METRICS = {
  imdb:       { emoji: '⭐', fmt: (v) => v.toFixed(1) },
  metascore:  { emoji: '🎯', fmt: (v) => String(v) },
  letterboxd: { emoji: '🎬', fmt: (v) => v.toFixed(1) },
}

function Card({ movie, onOpen, isFav, onToggleFav, t, ui, sort }) {
  const langs = [...new Set(movie.showtimes.map((s) => s.language))]
  const metricKey = BADGE_METRICS[sort] ? sort : 'imdb'
  const metric = BADGE_METRICS[metricKey]
  const value = movie.ratings[metricKey]
  return (
    <div
      className="card" role="button" tabIndex={0}
      onClick={() => onOpen(movie)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(movie) } }}
    >
      <div className="card-poster">
        {movie.poster
          ? <img
              src={movie.poster}
              srcSet={`${movie.poster.replace('/w342/', '/w185/')} 185w, ${movie.poster} 342w`}
              sizes="(max-width: 640px) 45vw, 200px"
              width="342" height="513"
              alt="" loading="lazy" decoding="async" />
          : <div className="poster-fallback">{(movie.title_original || movie.title_de).slice(0, 2)}</div>}
        {value != null && (
          <span className="badge-rating"><span className="star">{metric.emoji}</span>{metric.fmt(value)}</span>
        )}
        <div className="badge-langs">
          {langs.includes('OV') && <LangBadge lang="OV" t={t} />}
          {langs.includes('OmU') && <LangBadge lang="OmU" t={t} />}
          {langs.includes('DE') && <LangBadge lang="DE" t={t} />}
        </div>
        {movie.age_rating != null && <span className="badge-fsk">FSK {movie.age_rating}</span>}
        <button
          className={`fav-btn ${isFav ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleFav(movie.id) }}
          title={isFav ? t.favOn : t.favOff}
          aria-label="Favorit"
        >
          {isFav ? '♥' : '♡'}
        </button>
      </div>
      <div className="card-body">
        <h3 title={displayTitle(movie, ui)}>{displayTitle(movie, ui)}</h3>
        <p className="card-meta">
          {movie.year}
          {(movie.genres || []).slice(0, 2).map((g) => <span className="genre-pill" key={g}>{genreName(g, ui)}</span>)}
        </p>
      </div>
    </div>
  )
}

// One rating in the modal — a clickable chip (with emoji + arrow) when we can
// link to the review site, a plain unboxed value otherwise.
function Rating({ value, label, emoji, href, title }) {
  const inner = <>{emoji} <b>{value ?? '–'}</b> {label}</>
  if (!href) return <span className="rating-plain">{inner}</span>
  return (
    <a className="rating-link" href={href} target="_blank" rel="noreferrer" title={title}>
      {inner}<span className="ext">↗</span>
    </a>
  )
}

function Modal({ movie, shows, onClose, t, ui }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // movie.id is the IMDb id when TMDB could resolve one (tt…), else a title key
  const imdbId = typeof movie.id === 'string' && movie.id.startsWith('tt') ? movie.id : null
  const metaSearch = `https://www.metacritic.com/search/${encodeURIComponent(movie.title_original || movie.title_de)}/`
  const overview = displayOverview(movie, ui)

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
            <h2>{displayTitle(movie, ui)}</h2>
            {displaySubtitle(movie, ui) && <p className="modal-orig">{displaySubtitle(movie, ui)}</p>}
            <p className="modal-sub">
              {[movie.year, movie.runtime && `${movie.runtime} min`, movie.age_rating != null && `FSK ${movie.age_rating}`]
                .filter(Boolean).join(' · ')}
            </p>
            {(movie.directors || []).length > 0 && (
              <p className="modal-sub">{t.director}: {movie.directors.join(', ')}</p>
            )}
            {movie.original_language && movie.original_language !== 'de' && (
              <p className="modal-sub">{t.origLabel}: {langFlag(movie.original_language)}{langName(movie.original_language, ui)}</p>
            )}
            {(movie.countries || []).length > 0 && (
              <p className="modal-sub">
                {t.countryLabel}: {movie.countries.map((c) => `${countryFlag(c)} ${countryName(c, ui)}`).join(', ')}
              </p>
            )}
            <p className="modal-genres">
              {(movie.genres || []).map((g) => <span className="genre-pill" key={g}>{genreName(g, ui)}</span>)}
              {(movie.tags || []).map((tg) => <span className="topic-pill" key={tg}>{t.topics[tg]}</span>)}
            </p>
            <div className="modal-ratings">
              <Rating value={movie.ratings.imdb} label="IMDb" emoji="⭐"
                href={imdbId && `https://www.imdb.com/title/${imdbId}/`}
                title={t.imdbLink} />
              <Rating value={movie.ratings.metascore} label="Meta" emoji="🎯"
                href={movie.ratings.metascore != null ? metaSearch : null}
                title={t.metaLink} />
              <Rating value={movie.ratings.letterboxd} label="Letterboxd" emoji="🎬"
                href={imdbId && `https://letterboxd.com/imdb/${imdbId}/`}
                title={t.lbLink} />
            </div>
            {(movie.trailer_de || movie.trailer_en) && (
              <div className="trailer-row">
                {movie.trailer_de && (
                  <a className="trailer-btn" href={movie.trailer_de} target="_blank" rel="noreferrer">
                    {movie.trailer_en ? t.trailerDe : t.trailerOnly}
                  </a>
                )}
                {movie.trailer_en && (
                  <a className="trailer-btn" href={movie.trailer_en} target="_blank" rel="noreferrer">
                    {movie.trailer_de ? t.trailerOrig : t.trailerOnly}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        {overview && <p className="modal-desc">{overview}</p>}
        <div className="modal-shows">
          {Object.entries(byCinema).map(([cinema, times]) => {
            return (
              <div className="cinema-row" key={cinema}>
                <span className="cinema-name">{cinema}</span>
                <span className="times">
                  {times.map((tm, i) => {
                    const chip = (
                      <span className={`time lang-${tm.language.toLowerCase()}`}>
                        <span className="time-day">{fmtDay(tm.datetime, t)}</span> {fmtTime(tm.datetime, t)}
                        <span className="lang-tag">{tm.language}</span>
                      </span>
                    )
                    return tm.booking_url
                      ? <a key={i} href={tm.booking_url} target="_blank" rel="noreferrer">{chip}</a>
                      : <span key={i}>{chip}</span>
                  })}
                </span>
              </div>
            )
          })}
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

  const [ui, setUi] = useState(() => localStorage.getItem('kinoguide-lang') || 'de')
  useEffect(() => { localStorage.setItem('kinoguide-lang', ui) }, [ui])
  const t = T[ui]

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
  const [topics, setTopics] = useState([])       // women_directed / queer / international
  const [origLangs, setOrigLangs] = useState([]) // selected original-language ISO codes
  const [lastMinute, setLastMinute] = useState(false) // only shows starting within 4h

  // favorites survive reloads via localStorage
  const [favs, setFavs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kinoguide-favs')) || [] } catch { return [] }
  })
  const [favsOnly, setFavsOnly] = useState(false)
  useEffect(() => {
    localStorage.setItem('kinoguide-favs', JSON.stringify(favs))
  }, [favs])
  const toggleFav = (id) =>
    setFavs((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])

  useEffect(() => {
    fetch('data/movies.json')
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setData)
      .catch((e) => setError(String(e)))
  }, [])

  // original languages present in the data, most common first, for the
  // language filter buttons (German excluded — it's the home language)
  const allLangs = useMemo(() => {
    if (!data) return []
    const count = {}
    for (const m of data.movies) {
      const l = m.original_language
      if (l && l !== 'de') count[l] = (count[l] || 0) + 1
    }
    return Object.entries(count)
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([code]) => code)
  }, [data])

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
    const today = dayKey(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString())
    const set = new Set()
    for (const m of data.movies) for (const s of m.showtimes) {
      const d = dayKey(s.datetime)
      if (d >= today) set.add(d)
    }
    return [...set].sort()
  }, [data])

  // showtimes of a movie that pass the when/where/version filters
  const showsFor = (m) => m.showtimes.filter((s) => {
    // hide screenings that ended: data refreshes only each morning, but
    // through the day past shows should drop out (30 min grace for latecomers)
    if (new Date(s.datetime) < Date.now() - 30 * 60000) return false
    if (!matchesLang(s, lang)) return false
    if (city !== 'Alle' && s.city !== city) return false
    if (cinema !== 'Alle' && s.cinema !== cinema) return false
    if (date !== 'Alle' && dayKey(s.datetime) !== date) return false
    if (lastMinute) {
      const diff = new Date(s.datetime) - Date.now()
      if (diff < 0 || diff > 4 * 3600 * 1000) return false
    }
    const d = new Date(s.datetime)
    const hour = d.getHours() + d.getMinutes() / 60
    if (hour < timeFrom || hour > timeTo) return false
    return true
  })

  // diacritic-insensitive search: "tochter" finds "Töchter", "leon" finds "Léon"
  const fold = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const movies = useMemo(() => {
    if (!data) return []
    const needle = fold(q.trim())
    return data.movies
      .filter((m) => !favsOnly || favs.includes(m.id))
      .filter((m) => (m.ratings.imdb ?? 0) >= minImdb)
      .filter((m) => !kidsOnly || isKidsFilm(m))
      .filter((m) => genres.length === 0 || (m.genres || []).some((g) => genres.includes(g)))
      .filter((m) => topics.every((tg) => matchTopic(m, tg)))  // AND: each selected topic must match
      .filter((m) => origLangs.length === 0 || origLangs.includes(m.original_language))
      .filter((m) => !needle
        || fold(m.title_de).includes(needle)
        || fold(m.title_original).includes(needle))
      .map((m) => ({ m, shows: showsFor(m) }))
      .filter((x) => x.shows.length > 0)
      .sort((a, b) => {
        // in last-minute mode the soonest screening comes first
        if (lastMinute) return a.shows[0].datetime.localeCompare(b.shows[0].datetime)
        // 'Neu' = newest theatrical release first (full date, not just year).
        // Far-future dates (event cinema announced for next season) sort last —
        // they haven't "hit cinemas" yet. Two weeks of lead time still counts
        // so preview screenings of this week's releases show up.
        if (sort === 'recent') {
          const horizon = new Date(Date.now() + 14 * 86400e3).toISOString().slice(0, 10)
          const rd = (m) => {
            const d = m.release_date || (m.year ? `${m.year}` : '')
            return d > horizon ? '' : d
          }
          return rd(b.m).localeCompare(rd(a.m))
        }
        return (b.m.ratings[sort] ?? -1) - (a.m.ratings[sort] ?? -1)
      })
  }, [data, q, city, lang, sort, minImdb, genres, kidsOnly, cinema, date, timeFrom, timeTo, favsOnly, favs, topics, origLangs, lastMinute])

  const toggleGenre = (g) =>
    setGenres((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])

  const toggleTopic = (tg) =>
    setTopics((prev) => prev.includes(tg) ? prev.filter((x) => x !== tg) : [...prev, tg])

  const toggleLang = (code) =>
    setOrigLangs((prev) => prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code])

  const resetFilters = () => {
    setQ(''); setCity('Alle'); setLang('alle'); setMinImdb(0); setGenres([])
    setKidsOnly(false); setCinema('Alle'); setDate('Alle'); setTimeFrom(0); setTimeTo(24)
    setTopics([]); setOrigLangs([]); setLastMinute(false)
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">Kinoguide <span>Köln · Bonn</span></div>
        <div className="topbar-right">
          <div className="lang-switch" role="group" aria-label="Sprache / Language">
            <button className={ui === 'de' ? 'on' : ''} onClick={() => setUi('de')}>DE</button>
            <button className={ui === 'en' ? 'on' : ''} onClick={() => setUi('en')}>EN</button>
          </div>
          {data && <div className="stand">{t.stand} {new Date(data.generated_at).toLocaleDateString(t.locale)}</div>}
        </div>
      </header>

      <div className="toolbar">
        <div className="search">
          <span className="search-icon">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} />
        </div>
        <button
          className={`kids-btn ${lastMinute ? 'on' : ''}`}
          onClick={() => setLastMinute((v) => !v)}
          title={t.lastMinuteTitle}
        >
          {t.lastMinute}
        </button>
        <button
          className={`kids-btn ${kidsOnly ? 'on' : ''}`}
          onClick={() => setKidsOnly((v) => !v)}
          title={t.kidsTitle}
        >
          {t.kids}
        </button>
        <button className={`filters-btn ${showFilters ? 'on' : ''}`} onClick={() => setShowFilters((v) => !v)}>
          ⚙ {t.filter} {showFilters ? '▲' : '▼'}
        </button>
      </div>

      <div className="sortrow">
        <div className="city-switch" role="group" aria-label="Stadt">
          {CITIES.map((c) => (
            <button key={c} className={city === c ? 'on' : ''} onClick={() => setCity(c)}>
              {c === 'Alle' ? t.bothCities : c}
            </button>
          ))}
        </div>
        <span className="sortrow-label">{t.sortLabel}</span>
        {SORTS.map((s) => (
          <button key={s.id} className={`chip ${sort === s.id ? 'on' : ''}`} onClick={() => setSort(s.id)}>
            {s.labelKey ? t[s.labelKey] : s.label}
          </button>
        ))}
        {favs.length > 0 && (
          <button className={`chip fav-chip ${favsOnly ? 'on' : ''}`} onClick={() => setFavsOnly((v) => !v)}>
            ♥ {t.favorites} ({favs.length})
          </button>
        )}
        {data && <span className="count">{movies.length} {t.films}</span>}
      </div>

      {allDates.length > 0 && (
        <div className="dayrow" role="group" aria-label={t.dateLabel}>
          <button className={`chip ${date === 'Alle' ? 'on' : ''}`} onClick={() => setDate('Alle')}>{t.allDays}</button>
          {allDates.slice(0, 7).map((d) => (
            <button key={d} className={`chip ${date === d ? 'on' : ''}`} onClick={() => setDate(d)}>{fmtDayShort(d, t)}</button>
          ))}
        </div>
      )}

      {showFilters && (
        <section className="panel">
          <div className="field">
            <label>{t.topicsLabel}</label>
            <div className="pills">
              {TOPIC_IDS.map((tg) => (
                <button key={tg} className={`pill ${topics.includes(tg) ? 'on' : ''}`} onClick={() => toggleTopic(tg)}>
                  {t.topics[tg]}
                </button>
              ))}
            </div>
          </div>

          {allLangs.length > 0 && (
            <div className="field">
              <label>{t.origLangLabel}</label>
              <div className="pills">
                {allLangs.map((code) => (
                  <button key={code} className={`pill ${origLangs.includes(code) ? 'on' : ''}`} onClick={() => toggleLang(code)}>
                    {langFlag(code)}{langName(code, ui)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="field">
            <label>{t.genres}</label>
            <div className="pills">
              {allGenres.map((g) => (
                <button key={g} className={`pill ${genres.includes(g) ? 'on' : ''}`} onClick={() => toggleGenre(g)}>{genreName(g, ui)}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>{t.version}</label>
            <div className="pills">
              {LANGS.map((l) => (
                <button key={l.id} className={`pill ${lang === l.id ? 'on' : ''}`} onClick={() => setLang(l.id)}>
                  {l.labelKey ? t[l.labelKey] : l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid2">
            <div className="field">
              <label>{t.cinemaLabel}</label>
              <select value={cinema} onChange={(e) => setCinema(e.target.value)}>
                <option value="Alle">{t.allCinemas}</option>
                {allCinemas.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label>{t.dateLabel}</label>
              <select value={date} onChange={(e) => setDate(e.target.value)}>
                <option value="Alle">{t.allDays}</option>
                {allDates.map((d) => <option key={d} value={d}>{fmtDayShort(d, t)}</option>)}
              </select>
            </div>
          </div>

          <div className="field">
            <label>{t.imdbMin} <b>{minImdb === 0 ? t.anyRating : minImdb.toFixed(1)}</b></label>
            <input type="range" min="0" max="9" step="0.5" value={minImdb} onChange={(e) => setMinImdb(+e.target.value)} />
          </div>

          <div className="field">
            <label>{t.timeLabel} <b>{String(timeFrom).padStart(2, '0')}:00 – {timeTo === 24 ? '24:00' : String(timeTo).padStart(2, '0') + ':00'}</b></label>
            <div className="time-sliders">
              <input type="range" min="0" max="24" value={timeFrom} onChange={(e) => setTimeFrom(Math.min(+e.target.value, timeTo))} />
              <input type="range" min="0" max="24" value={timeTo} onChange={(e) => setTimeTo(Math.max(+e.target.value, timeFrom))} />
            </div>
          </div>

          <button className="reset" onClick={resetFilters}>{t.reset}</button>
        </section>
      )}

      <main>
        {error && <p className="empty">{t.loadError(error)}</p>}
        {!error && !data && <p className="empty">{t.loading}</p>}
        {data && movies.length === 0 && <p className="empty">{t.empty}</p>}
        <div className="grid">
          {movies.map(({ m }, i) => (
            <Card key={`${m.id}-${i}`} movie={m} onOpen={setSelected}
              isFav={favs.includes(m.id)} onToggleFav={toggleFav} t={t} ui={ui} sort={sort} />
          ))}
        </div>
      </main>

      {selected && (
        <Modal movie={selected} shows={showsFor(selected)}
          onClose={() => setSelected(null)} t={t} ui={ui} />
      )}

      <footer>
        <p className="credits">
          {t.thanksPre}{' '}
          <a href="https://kinoguide.fyi" target="_blank" rel="noreferrer">kinoguide.fyi</a>{' '}
          {t.thanksPost}
        </p>
        <p>{t.footer}</p>
      </footer>
    </div>
  )
}
