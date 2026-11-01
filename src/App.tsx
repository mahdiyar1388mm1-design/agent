import { useEffect, useState } from 'react'
import type { AgentRecord } from './data/org'
import { ROUTES, useHashRoute } from './lib/router'
import { Shell } from './components/Shell'
import { AgentDrawer } from './components/AgentDrawer'
import { SearchPalette } from './components/SearchPalette'
import { Home } from './pages/Home'
import { MapPage } from './pages/MapPage'
import { StructurePage } from './pages/StructurePage'
import { CompaniesPage } from './pages/CompaniesPage'
import { DirectoryPage } from './pages/DirectoryPage'
import { OperationsPage } from './pages/OperationsPage'
import { InfrastructurePage } from './pages/InfrastructurePage'
import { RoadmapPage } from './pages/RoadmapPage'

const pageTitles: Record<string, string> = {
  '/': 'ATLAS — معماری سازمانی هلدینگ هوش مصنوعی',
  '/map': 'نقشه ریشه — ATLAS',
  '/structure': 'ساختار سازمانی — ATLAS',
  '/companies': 'سه شرکت عملیاتی — ATLAS',
  '/directory': 'فهرست Agentها — ATLAS',
  '/operations': 'همکاری و خزانه — ATLAS',
  '/infrastructure': 'زیرساخت مرکزی — ATLAS',
  '/roadmap': 'نقشه راه اجرا — ATLAS',
}

export default function App() {
  const [route, navigate] = useHashRoute()
  const [agent, setAgent] = useState<AgentRecord | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  const routeKey = `${route.path}?${route.query.toString()}`

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.title = pageTitles[route.path] ?? pageTitles['/']
  }, [routeKey, route.path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const go = (to: string) => {
    setSearchOpen(false)
    navigate(to)
  }

  const locate = (a: AgentRecord) => {
    setAgent(null)
    navigate(`${ROUTES.structure}?b=${a.branchKey}&a=${a.id}`)
  }

  let page: React.ReactNode
  switch (route.path) {
    case ROUTES.map:
      page = <MapPage routeQuery={route.query} onAgent={setAgent} />
      break
    case ROUTES.structure:
      page = <StructurePage routeQuery={route.query} navigate={go} onAgent={setAgent} />
      break
    case ROUTES.companies:
      page = <CompaniesPage navigate={go} onAgent={setAgent} />
      break
    case ROUTES.directory:
      page = <DirectoryPage onAgent={setAgent} />
      break
    case ROUTES.operations:
      page = <OperationsPage navigate={go} onAgent={setAgent} />
      break
    case ROUTES.infrastructure:
      page = <InfrastructurePage onAgent={setAgent} />
      break
    case ROUTES.roadmap:
      page = <RoadmapPage navigate={go} />
      break
    default:
      page = <Home navigate={go} onAgent={setAgent} />
  }

  return (
    <>
      <Shell path={route.path} navigate={go} onSearch={() => setSearchOpen(true)}>
        {page}
      </Shell>
      <AgentDrawer agent={agent} onClose={() => setAgent(null)} onLocate={locate} />
      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onAgent={setAgent}
        onNavigate={go}
      />
    </>
  )
}
