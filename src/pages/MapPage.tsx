import { useEffect, useMemo, useState } from 'react'
import {
  branchByKey,
  branches,
  statusMeta,
  stats,
  type AgentRecord,
  type BranchKey,
} from '../data/org'
import { fa } from '../lib/format'
import { ROUTES } from '../lib/router'
import { Icon } from '../components/Icon'
import { RootMap } from '../components/RootMap'

export function MapPage({
  routeQuery,
  onAgent,
}: {
  routeQuery: URLSearchParams
  onAgent: (a: AgentRecord) => void
}) {
  const initial = routeQuery.get('b') as BranchKey | null
  const [focus, setFocus] = useState<BranchKey | null>(
    initial && branchByKey[initial] ? initial : null,
  )

  useEffect(() => {
    const b = routeQuery.get('b') as BranchKey | null
    setFocus(b && branchByKey[b] ? b : null)
  }, [routeQuery])

  const branch = focus ? branchByKey[focus] : null
  const counts = useMemo(() => {
    const list = branch ? branch.sections.flatMap((s) => s.agents) : branches.flatMap((b) => b.sections.flatMap((s) => s.agents))
    return {
      total: list.length,
      active: list.filter((a) => a.status === 'active').length,
      training: list.filter((a) => a.status === 'training').length,
      critical: list.filter((a) => a.status === 'critical').length,
    }
  }, [branch])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">ROOT MAP · ARCHITECTURE</span>
          <h1 className="page-title">نقشه ریشه‌ای سازمان</h1>
          <p className="page-lede">
            هر نقطه یک نقش تخصصی است. شاخه‌ها را ببینید، روی هر شاخه کلیک کنید تا دپارتمان‌های آن
            باز شود و از هر Agent یک پروفایل بگیرید.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setFocus(null)}
            disabled={!focus}
          >
            <Icon name="RotateCcw" size={14} /> نمای کل هلدینگ
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => document.querySelector('.map-svg')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            <Icon name="ScanSearch" size={14} /> مرکز نقشه
          </button>
        </div>
      </div>

      <div className="map-layout">
        <div style={{ minWidth: 0 }}>
          <div className="map-wrap">
            <div className="map-toolbar">
              <span className="chip chip-accent" style={{ ['--accent' as string]: branch?.accent ?? '#e7c77b' }}>
                <Icon name="Radar" size={12} />
                {branch ? branch.fa : 'کل هلدینگ ATLAS'}
              </span>
              <span className="chip">{fa(counts.total)} نقش</span>
              <span className="chip">
                <span className="status-dot" style={{ background: statusMeta.active.color }} />
                {fa(counts.active)} فعال
              </span>
              <span className="chip">
                <span className="status-dot" style={{ background: statusMeta.training.color }} />
                {fa(counts.training)} در آموزش
              </span>
              {counts.critical > 0 && (
                <span className="chip">
                  <span className="status-dot" style={{ background: statusMeta.critical.color }} />
                  {fa(counts.critical)} نیازمند توجه
                </span>
              )}
              {branch && (
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  style={{ marginInlineStart: 'auto' }}
                  onClick={() => setFocus(null)}
                >
                  <Icon name="ArrowUpRight" size={13} /> بازگشت به ریشه
                </button>
              )}
            </div>
            <RootMap focus={focus} onFocus={setFocus} onSelect={onAgent} />
            <div className="map-hint">
              <span>
                <span className="legend-dot" style={{ background: '#e7c77b' }} /> مرکز: هلدینگ
              </span>
              <span>
                <span className="legend-dot" style={{ background: '#4c8dff' }} /> حلقه اول: شاخه‌ها
              </span>
              <span>
                <span className="legend-dot" style={{ background: '#f472b6' }} /> نقطه‌ها: Agentها
              </span>
              {!focus && <span>کلیک روی شاخه = تمرکز</span>}
            </div>
          </div>

          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div className="stat">
              <span className="stat-value">{fa(branch ? branch.sections.length : stats.branches)}</span>
              <span className="stat-label">{branch ? 'دپارتمان این شاخه' : 'شاخه اصلی'}</span>
            </div>
            <div className="stat">
              <span className="stat-value">{fa(counts.total)}</span>
              <span className="stat-label">نقش در این نما</span>
            </div>
            <div className="stat">
              <span className="stat-value">{fa(counts.active)}</span>
              <span className="stat-label">نیروی فعال</span>
            </div>
            <div className="stat">
              <span className="stat-value">
                {fa(Math.round((counts.active / Math.max(counts.total, 1)) * 100))}٪
              </span>
              <span className="stat-label">پوشش عملیاتی</span>
            </div>
          </div>
        </div>

        <aside className="map-side">
          <div className="card side-card">
            <h4>
              <Icon name="GitFork" size={14} /> شاخه‌های ریشه
            </h4>
            <div className="branch-pick">
              <button
                type="button"
                className={!focus ? 'active' : ''}
                onClick={() => setFocus(null)}
              >
                <span className="swatch" style={{ background: 'linear-gradient(135deg,#e7c77b,#4c8dff)' }} />
                <span className="bp-name">کل هلدینگ</span>
                <span className="bp-count">{fa(stats.agents)}</span>
              </button>
              {branches.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={focus === b.key ? 'active' : ''}
                  onClick={() => setFocus(b.key)}
                >
                  <span className="swatch" style={{ background: b.accent }} />
                  <span className="bp-name">{b.fa}</span>
                  <span className="bp-count">{fa(b.agentCount)}</span>
                </button>
              ))}
            </div>
          </div>

          {branch ? (
            <div className="card side-card">
              <h4 style={{ color: branch.accent }}>
                <Icon name="Layers" size={14} /> دپارتمان‌های {branch.short}
              </h4>
              <div className="branch-pick">
                {branch.sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      const first = s.agents[0]
                      if (first) onAgent(first)
                    }}
                  >
                    <span className="bp-name">{s.fa}</span>
                    <span className="bp-count">{fa(s.agents.length)}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="card side-card">
              <h4>
                <Icon name="Info" size={14} /> چطور بخوانیم؟
              </h4>
              <div className="side-kv">
                <span>مرکز</span>
                <b>Holding</b>
              </div>
              <div className="side-kv">
                <span>حلقه اول</span>
                <b>{fa(stats.branches)} شاخه</b>
              </div>
              <div className="side-kv">
                <span>حلقه میانی</span>
                <b>{fa(stats.sections)} دپارتمان</b>
              </div>
              <div className="side-kv">
                <span>نقطه‌های بیرونی</span>
                <b>{fa(stats.agents)} Agent</b>
              </div>
              <p className="empty-note" style={{ marginTop: 8, lineHeight: 1.9 }}>
                اندازه هر شاخه متناسب با تعداد Agentهای آن است. با کلیک روی شاخه، نقشه همان شاخه
                از مرکز بازسازی می‌شود.
              </p>
            </div>
          )}

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => (window.location.hash = ROUTES.directory)}
          >
            <Icon name="Users" size={14} /> جستجو در فهرست کامل
          </button>
        </aside>
      </div>
    </div>
  )
}
