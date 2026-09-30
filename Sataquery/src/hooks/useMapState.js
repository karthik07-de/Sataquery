/**
 * useMapState — centralized map state for SatQuery.
 *
 * Tracks: lat/lng, zoom, heading, tilt, map type, view mode,
 * selected location, Street View state, and active overlays.
 *
 * Designed to be instantiated once per page (Dashboard, Layers)
 * and passed down via props or context as needed.
 */
import { useState, useCallback, useRef } from 'react'

/**
 * View modes supported by GoogleEarthMap.
 * @typedef {'map'|'satellite'|'3d'|'360'} ViewMode
 */

export const VIEW_MODES = /** @type {const} */ ({
  MAP:       'map',
  SATELLITE: 'satellite',
  THREE_D:   '3d',
  PANORAMA:  '360',
})

const DEFAULT_STATE = {
  lat: 35.68,
  lng: 139.69,
  zoom: 11,
  heading: 0,       // camera heading (degrees north-clockwise)
  tilt: 0,          // camera tilt (0 = top-down, 45 = angled)
  viewMode: VIEW_MODES.SATELLITE,
  selectedLocation: null,  // { label, lat, lng, zoom }
  streetViewActive: false,
  streetViewPov: { heading: 0, pitch: 0, zoom: 1 },
  activeOverlays: [],      // SatQuery AI overlay descriptors
  isFullscreen: false,
}

export function useMapState(initialOverrides = {}) {
  const [state, setState] = useState({ ...DEFAULT_STATE, ...initialOverrides })

  // Ref for the Google Maps instance — not reactive, set by onMapReady
  const mapInstanceRef = useRef(null)
  // Ref for StreetViewPanorama instance
  const panoramaRef = useRef(null)

  /** Replace a subset of the map state. */
  const update = useCallback((patch) => {
    setState(prev => ({ ...prev, ...patch }))
  }, [])

  /** Navigate to a location. Updates center, zoom, label, and clears 360° mode. */
  const goTo = useCallback((location) => {
    const lat = location.center?.[0] ?? location.lat
    const lng = location.center?.[1] ?? location.lng
    const zoom = location.zoom ?? 12

    setState(prev => ({
      ...prev,
      lat,
      lng,
      zoom,
      selectedLocation: { label: location.label, lat, lng, zoom },
      // Exit street view when navigating to a new location
      streetViewActive: prev.viewMode === VIEW_MODES.PANORAMA ? prev.streetViewActive : false,
    }))

    // Imperatively move the live map instance
    const map = mapInstanceRef.current
    if (map) {
      map.panTo({ lat, lng })
      map.setZoom(zoom)
    }
  }, [])

  /** Switch the view mode. Handles tilt for 3D, resets tilt for others. */
  const setViewMode = useCallback((mode) => {
    setState(prev => {
      const next = { ...prev, viewMode: mode }
      if (mode === VIEW_MODES.THREE_D) {
        next.tilt = 45
      } else if (mode !== VIEW_MODES.PANORAMA) {
        next.tilt = 0
        next.streetViewActive = false
      }
      return next
    })
  }, [])

  /** Store the live map instance from a map component's onMapReady callback. */
  const setMapInstance = useCallback((map) => {
    mapInstanceRef.current = map
  }, [])

  /** Set overlays from a SatQuery AI analysis result. */
  const setOverlays = useCallback((overlays) => {
    setState(prev => ({ ...prev, activeOverlays: overlays }))
  }, [])

  /** Clear all AI overlays. */
  const clearOverlays = useCallback(() => {
    setState(prev => ({ ...prev, activeOverlays: [] }))
  }, [])

  /** Called when the 3D camera changes (tilt/heading). */
  const updateCamera = useCallback((tilt, heading) => {
    setState(prev => ({ ...prev, tilt, heading }))
  }, [])

  /** Toggle fullscreen state (syncs with actual fullscreen API externally). */
  const setFullscreen = useCallback((val) => {
    setState(prev => ({ ...prev, isFullscreen: val }))
  }, [])

  /** Activate/deactivate Street View mode. */
  const setStreetView = useCallback((active, pov = null) => {
    setState(prev => ({
      ...prev,
      streetViewActive: active,
      viewMode: active ? VIEW_MODES.PANORAMA : prev.viewMode,
      streetViewPov: pov ?? prev.streetViewPov,
    }))
  }, [])

  return {
    // State values
    ...state,

    // Raw refs (set by map component)
    mapInstanceRef,
    panoramaRef,

    // Actions
    update,
    goTo,
    setViewMode,
    setMapInstance,
    setOverlays,
    clearOverlays,
    updateCamera,
    setFullscreen,
    setStreetView,
  }
}
