/**
 * LocationSearch
 *
 * Unified location search for SatQuery AI.
 *
 * Behaviour:
 *   1. When Google Maps JS API (with Places library) is loaded,
 *      uses AutocompleteService to provide real worldwide predictions.
 *   2. When the API is not yet loaded (or has no key), falls back
 *      gracefully to Nominatim (OSM) — no errors shown to the user.
 *   3. When the query looks like a feature search ("show X in Y",
 *      "X near Y"), also queries POST /geodata and adds a backend
 *      result to the dropdown so the map flies there with real overlays.
 *
 * When a result is selected it calls:
 *   onSelect({ label, center: [lat, lng], zoom, overlays?, summary? })
 *
 * Coordinate input is also supported — typing "35.68, 139.69" will
 * parse and jump directly without a Places lookup.
 *
 * Props:
 *   onSelect   — ({ label, center: [lat, lng], zoom, overlays?, summary? }) => void
 *   presets    — Array<{ label, center, zoom }>   (fallback / shortcuts)
 *   className  — string
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { geodataApi } from '../../services/geodataApi'

/* ── Coordinate regex: "lat, lng" or "lat lng" ── */
const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/

function parseCoords(str) {
  const m = str.match(COORD_RE)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lng = parseFloat(m[2])
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

/* ── Derive a natural zoom level for a Places result by type ── */
function zoomForTypes(types = []) {
  if (types.includes('street_address') || types.includes('premise'))   return 17
  if (types.includes('neighborhood') || types.includes('sublocality')) return 14
  if (types.includes('locality') || types.includes('postal_code'))     return 12
  if (types.includes('administrative_area_level_2'))                   return 10
  if (types.includes('administrative_area_level_1'))                    return 8
  if (types.includes('country'))                                        return 5
  if (types.includes('natural_feature') || types.includes('park'))     return 8
  return 12 // sensible default
}

export default function LocationSearch({ onSelect, presets = [], className = '' }) {
  const [query,        setQuery]       = useState('')
  const [open,         setOpen]        = useState(false)
  const [predictions,  setPredictions] = useState([])
  const [loading,      setLoading]     = useState(false)
  const [usePlaces,    setUsePlaces]   = useState(false)
  // Backend geodata suggestion (POST /geodata)
  const [geodataSugg,  setGeodataSugg] = useState(null)

  const containerRef   = useRef(null)
  const inputRef       = useRef(null)
  const autocompleteRef = useRef(null)   // google.maps.places.AutocompleteService
  const geocoderRef    = useRef(null)    // google.maps.Geocoder
  const debounceRef    = useRef(null)
  const sessionTokenRef = useRef(null)
  const geodataDebRef  = useRef(null)    // debounce ref for geodata

  /* ── Detect a feature-style query ("show X in Y", "X near Y", etc.) ── */
  function isFeatureQuery(str) {
    return /\b(show|find|detect|map|get|where|near|around|in|within)\b/i.test(str)
      && str.trim().length > 8
  }

  /* ── Detect when Google Maps Places API is available ── */
  useEffect(() => {
    const check = () => {
      if (window.google?.maps?.places?.AutocompleteService) {
        autocompleteRef.current  = new window.google.maps.places.AutocompleteService()
        geocoderRef.current      = new window.google.maps.Geocoder()
        sessionTokenRef.current  = new window.google.maps.places.AutocompleteSessionToken()
        setUsePlaces(true)
      }
    }
    check()
    // Poll until ready (the map may still be loading when this mounts)
    const interval = setInterval(() => {
      if (window.google?.maps?.places?.AutocompleteService) {
        check()
        clearInterval(interval)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  /* ── Close on outside click ── */
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── Nominatim fallback geocoder (free, no key) ── */
  const fetchNominatimPredictions = useCallback(async (input) => {
    if (!input.trim()) { setPredictions([]); setLoading(false); return }
    setLoading(true)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(input)}`
      const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data = await res.json()
      // Convert Nominatim results to the same shape as Google Places predictions
      setPredictions(data.map(r => ({
        place_id:            r.place_id,
        description:         r.display_name,
        _nominatim_lat:      parseFloat(r.lat),
        _nominatim_lng:      parseFloat(r.lon),
        structured_formatting: {
          main_text:      r.name || r.display_name.split(',')[0],
          secondary_text: r.display_name.split(',').slice(1).join(',').trim(),
        },
      })))
    } catch {
      setPredictions([])
    } finally {
      setLoading(false)
    }
  }, [])

  /* ── Fetch Places predictions ── */
  const fetchPredictions = useCallback((input) => {
    if (!autocompleteRef.current || !input.trim()) {
      setPredictions([])
      setLoading(false)
      return
    }
    setLoading(true)
    autocompleteRef.current.getPlacePredictions(
      {
        input,
        sessionToken: sessionTokenRef.current,
        // No type restriction — allow addresses, cities, landmarks, countries
      },
      (results, status) => {
        setLoading(false)
        const ok = window.google?.maps?.places?.PlacesServiceStatus?.OK
        if (status === ok && results?.length) {
          setPredictions(results)
        } else {
          // Fall back to Nominatim if Places fails
          fetchNominatimPredictions(input)
        }
      }
    )
  }, [fetchNominatimPredictions])

  /* ── Handle text input ── */
  function handleInput(e) {
    const val = e.target.value
    setQuery(val)
    setOpen(true)

    // Debounce Places API calls
    clearTimeout(debounceRef.current)
    clearTimeout(geodataDebRef.current)

    if (val.trim().length < 2) {
      setPredictions([])
      setGeodataSugg(null)
      return
    }
    // Coordinate shortcut — no API call needed
    if (parseCoords(val)) {
      setPredictions([])
      setGeodataSugg(null)
      return
    }
    if (usePlaces) {
      debounceRef.current = setTimeout(() => fetchPredictions(val), 280)
    } else {
      // Use Nominatim fallback when Google Places not available
      debounceRef.current = setTimeout(() => fetchNominatimPredictions(val), 400)
    }

    // Fire geodata for feature-style queries (debounced separately — slower)
    if (isFeatureQuery(val)) {
      geodataDebRef.current = setTimeout(async () => {
        try {
          const result = await geodataApi.queryAndParse(val)
          setGeodataSugg(result)
        } catch {
          setGeodataSugg(null)
        }
      }, 700)
    } else {
      setGeodataSugg(null)
    }
  }

  /* ── Geocode a Places/Nominatim prediction to lat/lng ── */
  function selectPrediction(prediction) {
    setQuery(prediction.description)
    setOpen(false)
    setPredictions([])

    // Nominatim results have lat/lng directly embedded
    if (prediction._nominatim_lat != null) {
      onSelect?.({
        label:  prediction.description,
        center: [prediction._nominatim_lat, prediction._nominatim_lng],
        zoom:   12,
      })
      return
    }

    if (!geocoderRef.current) return

    geocoderRef.current.geocode(
      { placeId: prediction.place_id },
      (results, status) => {
        if (status === 'OK' && results?.[0]) {
          const loc   = results[0].geometry.location
          const types = results[0].types || []
          const zoom  = zoomForTypes(types)
          // Refresh session token after successful geocode
          sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken()
          onSelect?.({
            label:  prediction.description,
            center: [loc.lat(), loc.lng()],
            zoom,
          })
        }
      }
    )
  }

  /* ── Select a preset shortcut ── */
  function selectPreset(preset) {
    setQuery(preset.label)
    setOpen(false)
    setPredictions([])
    onSelect?.(preset)
  }

  /* ── Handle Enter / coordinate submit ── */
  function handleKeyDown(e) {
    if (e.key !== 'Enter') return
    e.preventDefault()

    const coords = parseCoords(query)
    if (coords) {
      setOpen(false)
      onSelect?.({
        label:  `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        center: [coords.lat, coords.lng],
        zoom:   14,
      })
      return
    }

    // Select first prediction on Enter
    if (predictions.length > 0) {
      selectPrediction(predictions[0])
    }
  }

  /* ── Filtered presets (when no Places predictions) ── */
  const filteredPresets = query.trim().length >= 1
    ? presets.filter(p => p.label.toLowerCase().includes(query.toLowerCase()))
    : presets

  /* ── What to show in the dropdown ── */
  const showPredictions = predictions.length > 0
  const showPresets     = !showPredictions && filteredPresets.length > 0
  const showCoordHint   = !showPredictions && !showPresets && !!parseCoords(query)
  const showGeodataSugg = !!geodataSugg
  const dropdownVisible = open && (showPredictions || showPresets || showCoordHint || showGeodataSugg || loading)

  return (
    <div ref={containerRef} className={`relative w-72 ${className}`}>
      {/* ── Input ── */}
      <div className="flex items-center gap-2 bg-[#111318]/95 border border-white/10 rounded-lg px-3 py-2
                      focus-within:border-[#adc6ff]/40 transition-colors backdrop-blur-sm shadow-lg">
        {loading
          ? <span className="w-4 h-4 border-2 border-[#adc6ff]/20 border-t-[#adc6ff] rounded-full animate-spin-slow flex-shrink-0" />
          : <span className="material-symbols-outlined text-[16px] text-[#c2c6d6]/50 flex-shrink-0">search</span>
        }
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search location or coordinates…"
          autoComplete="off"
          spellCheck={false}
          className="bg-transparent border-none text-xs text-[#e2e2e8] placeholder:text-[#c2c6d6]/35
                     focus:ring-0 focus:outline-none flex-1 font-mono min-w-0"
          aria-label="Search location"
          aria-expanded={dropdownVisible}
          aria-autocomplete="list"
          role="combobox"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setPredictions([]); setGeodataSugg(null); setOpen(false); inputRef.current?.focus() }}
            className="material-symbols-outlined text-[14px] text-[#c2c6d6]/40 hover:text-[#c2c6d6]
                       flex-shrink-0 focus:outline-none"
            aria-label="Clear search"
          >
            close
          </button>
        )}
      </div>

      {/* ── Dropdown ── */}
      {dropdownVisible && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1.5 bg-[#111318] border border-white/10
                     rounded-xl overflow-hidden z-[700] shadow-2xl max-h-72 overflow-y-auto scroll-thin"
        >
          {/* ── Places predictions ── */}
          {showPredictions && predictions.map(p => (
            <li key={p.place_id} role="option">
              <button
                onClick={() => selectPrediction(p)}
                className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left
                           hover:bg-white/[0.06] transition-colors"
              >
                <span className="material-symbols-outlined text-[14px] text-[#adc6ff] mt-0.5 flex-shrink-0">
                  location_on
                </span>
                <div className="min-w-0">
                  {/* Main text (bold) + secondary text (dim) */}
                  <span className="font-mono text-xs text-[#e2e2e8] leading-tight">
                    {p.structured_formatting?.main_text || p.description}
                  </span>
                  {p.structured_formatting?.secondary_text && (
                    <span className="block font-mono text-[10px] text-[#c2c6d6]/50 mt-0.5 truncate">
                      {p.structured_formatting.secondary_text}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}

          {/* ── Preset shortcuts (shown when no Places results) ── */}
          {showPresets && (
            <>
              {query.trim().length === 0 && (
                <li className="px-3 py-1.5 border-b border-white/[0.05]">
                  <span className="font-mono text-[8px] text-[#c2c6d6]/35 uppercase tracking-widest">
                    Quick locations
                  </span>
                </li>
              )}
              {filteredPresets.map(p => (
                <li key={p.label} role="option">
                  <button
                    onClick={() => selectPreset(p)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left
                               hover:bg-white/[0.06] transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px] text-[#adc6ff]">
                      location_on
                    </span>
                    <span className="font-mono text-xs text-[#c2c6d6] hover:text-[#e2e2e8]">
                      {p.label}
                    </span>
                  </button>
                </li>
              ))}
            </>
          )}

          {/* ── Coordinate jump hint ── */}
          {showCoordHint && (() => {
            const c = parseCoords(query)
            return (
              <li role="option">
                <button
                  onClick={() => {
                    setOpen(false)
                    onSelect?.({
                      label:  `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`,
                      center: [c.lat, c.lng],
                      zoom:   14,
                    })
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left
                             hover:bg-white/[0.06] transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px] text-[#4edea3]">
                    pin_drop
                  </span>
                  <div>
                    <span className="font-mono text-xs text-[#e2e2e8]">
                      Jump to coordinates
                    </span>
                    <span className="block font-mono text-[10px] text-[#c2c6d6]/50">
                      {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                    </span>
                  </div>
                </button>
              </li>
            )
          })()}

          {/* ── Geodata backend suggestion (feature / NL queries) ── */}
          {showGeodataSugg && (
            <>
              <li className="px-3 py-1.5 border-t border-white/[0.05]">
                <span className="font-mono text-[8px] text-[#4edea3]/60 uppercase tracking-widest">
                  SatQuery AI · live features
                </span>
              </li>
              <li role="option">
                <button
                  onClick={() => {
                    setQuery(geodataSugg.location.label)
                    setOpen(false)
                    setPredictions([])
                    setGeodataSugg(null)
                    onSelect?.({
                      label:    geodataSugg.location.label,
                      center:   geodataSugg.location.center,
                      zoom:     geodataSugg.location.zoom,
                      overlays: geodataSugg.overlays,
                      summary:  geodataSugg.summary,
                    })
                  }}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left
                             hover:bg-white/[0.06] transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px] text-[#4edea3] mt-0.5 flex-shrink-0">
                    satellite_alt
                  </span>
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-[#e2e2e8] leading-tight">
                      {geodataSugg.location.label}
                    </span>
                    <span className="block font-mono text-[10px] text-[#4edea3]/70 mt-0.5 truncate">
                      {geodataSugg.summary}
                    </span>
                  </div>
                </button>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  )
}
