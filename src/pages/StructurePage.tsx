import { useMemo } from 'react'
import {
  agentById,
  branchByKey,
  branchTree,
  branches,
  rootTree,
  sectionById,
  stats,
  type AgentRecord,
  type BranchKey,
} from '../data/org'
import { fa } from '../lib/format'
import { ROUTES } from '../lib/router'
import { Icon } from '../components/Icon'
import { OrgTree } from '../components/OrgTree'

export function StructurePage({
  routeQuery,
  navigate,
  onAgent,
}: {
  routeQuery: URLSearchParams
  navigate: (to: string) => void
  onAgent: (a: AgentRecord) => void
}) {
  const bParam = routeQuery.get('b') as BranchKey | null
  const sectionParam = routeQuery.get('s')
  const agentParam = routeQuery.get('a')
  const branch = bParam && branchByKey[bParam] ? branchByKey[bParam] : null
  const agent = agentParam ? agentById.get(agentParam) : undefined
  const section = sectionParam ? sectionById.get(sectionParam) : undefined

  const tree = useMemo(() => (branch ? branchTree(branch.key) : rootTree), [branch])

  const { defaultExpanded, scopeKey } = useMemo(() => {
    const ids: string[] = []
    if (branch) {
      ids.push(branch.key)
      const targetSection = section?.id ?? agent?.sectionId
      if (targetSection) ids.push(targetSection)
      else branch.sections.forEach((s) => ids.push(s.id))
    } else {
      ids.push(rootTree.id)
      branches.forEach((b) => ids.push(b.key))
      const target = section?.id ?? agent?.sectionId
      if (target) ids.push(target)
    }
    return {
      defaultExpanded: ids,
      scopeKey: `${branch?.key ?? 'all'}-${sectionParam ?? ''}-${agentParam ?? ''}`,
    }
  }, [branch, section, agent, sectionParam, agentParam])

  const focusSection = section ?? (agent ? sectionById.get(agent.sectionId) : undefined)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">ORG STRUCTURE · TREE</span>
          <h1 className="page-title">ساختار سازمانی</h1>
          <p className="page-lede">
            از هیئت‌مدیره تا Agentهای کارگر. هر ردیف را باز کنید؛ برای مشاهده پروفایل روی نام Agent
            کلیک کنید.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(ROUTES.map)}>
            <Icon name="Radar" size={14} /> نقشه ریشه
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => navigate(ROUTES.directory)}
          >
            <Icon name="Users" size={14} /> فهرست کامل
          </button>
        </div>
      </div>

      {branch ? (
        <div
          className="co-hero"
          style={{ ['--accent' as string]: branch.accent, marginBottom: 18, padding: '24px 26px' }}
        >
          <div className="co-hero-top">
            <span className="co-mark">
              <Icon name={branch.icon} size={24} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="co-en">{branch.name}</div>
              <h1 style={{ fontSize: 25 }}>{branch.fa}</h1>
              <p className="co-desc">{branch.desc}</p>
            </div>
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="chip chip-accent" style={{ ['--accent' as string]: branch.accent }}>
                <Icon name="GitFork" size={12} /> {branch.tag}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => navigate(ROUTES.structure)}
              >
                <Icon name="X" size={13} /> نمای کل
              </button>
            </div>
          </div>
          <div className="co-kpis">
            <div>
              <div className="k-v">{fa(branch.agentCount)}</div>
              <div className="k-l">Agent</div>
            </div>
            <div>
              <div className="k-v">{fa(branch.sections.length)}</div>
              <div className="k-l">دپارتمان</div>
            </div>
            <div>
              <div className="k-v">
                {fa(branch.sections.flatMap((s) => s.agents).filter((a) => a.status === 'active').length)}
              </div>
              <div className="k-l">نیروی فعال</div>
            </div>
            <div>
              <div className="k-v">{fa(branch.sections[0]?.agents.length ?? 0)}</div>
              <div className="k-l">نقش رهبری</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="stat-grid" style={{ marginBottom: 18 }}>
          <div className="stat">
            <span className="stat-value">{fa(stats.agents)}</span>
            <span className="stat-label">نقش در کل سازمان</span>
          </div>
          <div className="stat">
            <span className="stat-value">{fa(stats.branches)}</span>
            <span className="stat-label">شاخه اصلی</span>
          </div>
          <div className="stat">
            <span className="stat-value">{fa(stats.sections)}</span>
            <span className="stat-label">دپارتمان</span>
          </div>
          <div className="stat">
            <span className="stat-value">۶</span>
            <span className="stat-label">سطح سلسله‌مراتب</span>
          </div>
        </div>
      )}

      <div className="structure-layout">
        <div className="card" style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 16px',
              borderBottom: '1px solid var(--line)',
              flexWrap: 'wrap',
            }}
          >
            <Icon name="ListTree" size={16} style={{ color: branch?.accent ?? 'var(--gold)' }} />
            <strong style={{ fontSize: 13 }}>
              {branch ? branch.fa : 'ATLAS Holding'}
            </strong>
            <span className="tree-count">{fa(branch ? branch.agentCount : stats.agents)}</span>
            {focusSection && (
              <span className="chip" style={{ fontSize: 10 }}>
                دپارتمان: {focusSection.fa}
              </span>
            )}
            {agent && (
              <span className="chip chip-accent" style={{ fontSize: 10, ['--accent' as string]: agent.accent }}>
                {agent.name}
              </span>
            )}
            <span style={{ marginInlineStart: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>
              کلیک روی Agent = پروفایل
            </span>
          </div>
          <OrgTree
            key={scopeKey}
            tree={tree}
            onAgent={onAgent}
            defaultExpanded={defaultExpanded}
            highlightId={agent?.id}
          />
        </div>

        <aside className="structure-side">
          <div className="card side-card">
            <h4>
              <Icon name="Building2" size={14} /> شاخه‌ها
            </h4>
            <div className="branch-pick">
              <button
                type="button"
                className={!branch ? 'active' : ''}
                onClick={() => navigate(ROUTES.structure)}
              >
                <span className="swatch" style={{ background: 'linear-gradient(135deg,#e7c77b,#4c8dff)' }} />
                <span className="bp-name">کل هلدینگ</span>
                <span className="bp-count">{fa(stats.agents)}</span>
              </button>
              {branches.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={branch?.key === b.key ? 'active' : ''}
                  onClick={() => navigate(`${ROUTES.structure}?b=${b.key}`)}
                >
                  <span className="swatch" style={{ background: b.accent }} />
                  <span className="bp-name">{b.fa}</span>
                  <span className="bp-count">{fa(b.agentCount)}</span>
                </button>
              ))}
            </div>
          </div>

          {branch && (
            <div className="card side-card">
              <h4>
                <Icon name="Layers" size={14} /> دپارتمان‌ها
              </h4>
              <div className="branch-pick">
                {branch.sections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={focusSection?.id === s.id ? 'active' : ''}
                    onClick={() => navigate(`${ROUTES.structure}?b=${branch.key}&s=${s.id}`)}
                  >
                    <span className="bp-name">{s.fa}</span>
                    <span className="bp-count">{fa(s.agents.length)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card side-card">
            <h4>
              <Icon name="Info" size={14} /> اصل طراحی
            </h4>
            <p className="empty-note" style={{ lineHeight: 2 }}>
              هر عنوان ابتدا یک «نقش سازمانی» است، نه لزوماً یک مدل جداگانه. یک Agent تخصصی می‌تواند
              چند عنوان را با ابزارهای متفاوت پوشش دهد؛ ساختار، مالکیت و پاسخ‌گویی را روشن می‌کند.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10, width: '100%' }}
              onClick={() => navigate(ROUTES.roadmap)}
            >
              <Icon name="Route" size={14} /> نقشه راه اجرا
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

