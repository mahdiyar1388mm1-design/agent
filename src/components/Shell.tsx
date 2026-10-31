import { useEffect, useState, type ReactNode } from 'react'
import { stats } from '../data/org'
import { fa, faNum } from '../lib/format'
import { ROUTES } from '../lib/router'
import { Icon } from './Icon'

const nav = [
  { path: ROUTES.home, label: 'نمای کلی', en: 'Overview', icon: 'Sparkles', count: null },
  { path: ROUTES.map, label: 'نقشه ریشه', en: 'Root Map', icon: 'Radar', count: stats.agents },
  { path: ROUTES.structure, label: 'ساختار سازمانی', en: 'Structure', icon: 'ListTree', count: stats.sections },
  { path: ROUTES.companies, label: 'سه شرکت', en: 'Companies', icon: 'Building2', count: stats.companies },
  { path: ROUTES.directory, label: 'فهرست Agentها', en: 'Directory', icon: 'Users', count: stats.agents },
  { path: ROUTES.operations, label: 'همکاری و خزانه', en: 'Operations', icon: 'Workflow', count: 30 },
  { path: ROUTES.infrastructure, label: 'زیرساخت مرکزی', en: 'Infrastructure', icon: 'Server', count: stats.systems },
  { path: ROUTES.roadmap, label: 'نقشه راه اجرا', en: 'Roadmap', icon: 'Route', count: null },
]

const titles: Record<string, { fa: string; en: string }> = {
  '/': { fa: 'نمای کلی هلدینگ', en: 'Overview' },
  '/map': { fa: 'نقشه ریشه', en: 'Root Map' },
  '/structure': { fa: 'ساختار سازمانی', en: 'Structure' },
  '/companies': { fa: 'سه شرکت عملیاتی', en: 'Companies' },
  '/directory': { fa: 'فهرست Agentها', en: 'Directory' },
  '/operations': { fa: 'همکاری و خزانه', en: 'Operations' },
  '/infrastructure': { fa: 'زیرساخت مرکزی', en: 'Infrastructure' },
  '/roadmap': { fa: 'نقشه راه اجرا', en: 'Roadmap' },
}

function NavItems({
  path,
  go,
  close,
}: {
  path: string
  go: (to: string) => void
  close?: () => void
}) {
  return (
    <>
      {nav.map((item) => (
        <button
          key={item.path}
          type="button"
          className={`nav-item${path === item.path ? ' active' : ''}`}
          onClick={() => {
            go(item.path)
            close?.()
          }}
          aria-current={path === item.path ? 'page' : undefined}
        >
          <Icon name={item.icon} size={17} />
          <span>{item.label}</span>
          {item.count != null && <span className="nav-count">{fa(item.count)}</span>}
        </button>
      ))}
    </>
  )
}

export function Shell({
  path,
  navigate,
  onSearch,
  children,
}: {
  path: string
  navigate: (to: string) => void
  onSearch: () => void
  children: ReactNode
}) {
  const [mobile, setMobile] = useState(false)
  const title = titles[path] ?? titles['/']
  const activePct = Math.round((stats.active / stats.agents) * 100)

  useEffect(() => {
    setMobile(false)
  }, [path])

  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobile])

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="ناوبری اصلی">
        <button
          type="button"
          className="brand"
          onClick={() => navigate(ROUTES.home)}
          style={{ background: 'none', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', textAlign: 'right' }}
          aria-label="ATLAS — خانه"
        >
          <span className="brand-mark">
            <Icon name="GitFork" size={21} />
          </span>
          <span>
            <span className="brand-title">ATLAS</span>
            <span className="brand-sub" style={{ display: 'block' }}>
              هلدینگ هوش مصنوعی · AI HOLDING
            </span>
          </span>
        </button>

        <nav className="nav-group" aria-label="صفحات">
          <span className="nav-label">NAVIGATE</span>
          <NavItems path={path} go={navigate} />
        </nav>

        <div className="sidebar-foot">
          <div className="pulse-row">
            <span className="pulse">نیروی فعال</span>
            <span className="num" style={{ color: 'var(--text-soft)' }}>
              {faNum(stats.active)} / {faNum(stats.agents)}
            </span>
          </div>
          <div className="mini-meter">
            <span style={{ width: `${activePct}%` }} />
          </div>
          <div className="pulse-row">
            <span>عمق ساختار</span>
            <span className="num" style={{ color: 'var(--text-soft)' }}>
              ۶ سطح
            </span>
          </div>
          <div className="pulse-row">
            <span>نسخه معماری</span>
            <span className="en" style={{ fontSize: 10, color: '#7f8498' }}>
              v1.0 · BLUEPRINT
            </span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setMobile(true)}
            aria-label="باز کردن منو"
          >
            <Icon name="Menu" size={18} />
          </button>

          <div className="crumbs">
            <span>ATLAS</span>
            <span className="sep">/</span>
            <strong>{title.fa}</strong>
            <span className="sep">/</span>
            <span className="en" style={{ fontSize: 10, letterSpacing: '0.14em' }}>
              {title.en}
            </span>
          </div>

          <div className="topbar-right">
            <button type="button" className="search-trigger" onClick={onSearch} aria-label="جستجو">
              <Icon name="Search" size={15} />
              <span className="search-label">جستجوی Agent، دپارتمان، شرکت…</span>
              <span className="kbd">⌘K</span>
            </button>
            <a
              className="icon-btn"
              href="https://github.com/mahdiyar1388mm1-design/agent"
              target="_blank"
              rel="noreferrer"
              aria-label="مخزن پروژه"
              title="مخزن پروژه"
            >
              <Icon name="GitBranch" size={16} />
            </a>
          </div>
        </header>

        <main>{children}</main>

        <footer className="footer">
          <div>
            <strong>ATLAS</strong> — معماری سازمانی هلدینگ هوش مصنوعی
            <div style={{ marginTop: 4, fontSize: 11 }}>
              {fa(stats.branches)} شاخه · {fa(stats.sections)} دپارتمان · {fa(stats.agents)} نقش ·{' '}
              {fa(stats.systems)} سامانه مرکزی
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div className="en">AI HOLDING OPERATING SYSTEM</div>
            <div style={{ marginTop: 4, fontSize: 10.5 }}>
              ارقام وضعیت، شبیه‌سازی نمونه برای نمایش معماری است.
            </div>
          </div>
        </footer>
      </div>

      <div className={`overlay${mobile ? ' open' : ''}`} onClick={() => setMobile(false)} />
      <aside className={`mobile-sheet${mobile ? ' open' : ''}`} aria-hidden={!mobile}>
        <div className="brand" style={{ paddingBottom: 12 }}>
          <span className="brand-mark">
            <Icon name="GitFork" size={20} />
          </span>
          <span>
            <span className="brand-title">ATLAS</span>
            <span className="brand-sub" style={{ display: 'block' }}>
              AI HOLDING · نقشه سازمان
            </span>
          </span>
          <button
            type="button"
            className="icon-btn"
            style={{ marginInlineStart: 'auto' }}
            onClick={() => setMobile(false)}
            aria-label="بستن منو"
          >
            <Icon name="X" size={16} />
          </button>
        </div>
        <nav className="nav-group">
          <NavItems path={path} go={navigate} close={() => setMobile(false)} />
        </nav>
      </aside>
    </div>
  )
}
