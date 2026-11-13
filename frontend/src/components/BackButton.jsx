import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { visit, backTarget, loadTrail, saveTrail } from '../utils/backTrail.js'

let trail = loadTrail()

// Rendered once in App: records every page visit on the trail.
export function BackTrailTracker() {
  const { pathname, search } = useLocation()
  useEffect(() => {
    trail = visit(trail, pathname, search)
    saveTrail(trail)
  }, [pathname, search])
  return null
}

// "← Terug" to the page you came from; `fallback` when this page was opened directly.
export default function BackButton({ fallback, children = '← Terug' }) {
  const { pathname, search } = useLocation()
  return (
    <Link to={backTarget(trail, pathname, search) ?? fallback} className="btn btn-secondary">
      {children}
    </Link>
  )
}
