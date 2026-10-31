import { useCallback, useEffect, useState } from 'react'

export interface Route {
  path: string
  query: URLSearchParams
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [path, qs = ''] = raw.split('?')
  return { path: path || '/', query: new URLSearchParams(qs) }
}

export function useHashRoute(): [Route, (to: string, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(parse)

  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    if (!window.location.hash) window.history.replaceState(null, '', '#/')
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((to: string, replace = false) => {
    const next = to.startsWith('#') ? to : `#${to}`
    if (replace) {
      window.history.replaceState(null, '', next)
      setRoute(parse())
    } else if (window.location.hash === next) {
      setRoute(parse())
    } else {
      window.location.hash = next
    }
  }, [])

  return [route, navigate]
}

export const ROUTES = {
  home: '/',
  map: '/map',
  structure: '/structure',
  companies: '/companies',
  directory: '/directory',
  operations: '/operations',
  infrastructure: '/infrastructure',
  roadmap: '/roadmap',
} as const
