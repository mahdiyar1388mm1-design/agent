import { useMemo, useState } from 'react'
import {
  allAgents,
  branches,
  statusMeta,
  type AgentRecord,
  type AgentStatus,
  type BranchKey,
} from '../data/org'
import { fa } from '../lib/format'
import { Icon } from '../components/Icon'

const statuses: AgentStatus[] = ['active', 'idle', 'training', 'paused', 'critical']

export function DirectoryPage({ onAgent }: { onAgent: (a: AgentRecord) => void }) {
  const [q, setQ] = useState('')
  const [branch, setBranch] = useState<BranchKey | 'all'>('all')
  const [status, setStatus] = useState<AgentStatus | 'all'>('all')

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = allAgents.filter((a) => {
      if (branch !== 'all' && a.branchKey !== branch) return false
      if (status !== 'all' && a.status !== status) return false
      if (!query) return true
      return (
        a.name.toLowerCase().includes(query) ||
        a.fa.includes(q.trim()) ||
        a.code.toLowerCase().includes(query) ||
        a.sectionFa.includes(q.trim()) ||
        a.sectionName.toLowerCase().includes(query) ||
        a.tools.some((t) => t.includes(query))
      )
    })
    return list
  }, [q, branch, status])

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; branchKey: BranchKey; accent: string; agents: AgentRecord[] }>()
    for (const a of filtered) {
      const key = a.sectionId
      if (!map.has(key)) {
        map.set(key, {
          label: a.sectionFa,
          branchKey: a.branchKey,
          accent: a.accent,
          agents: [],
        })
      }
      map.get(key)!.agents.push(a)
    }
    return [...map.entries()]
  }, [filtered])

  const exportCsv = () => {
    const header = ['code', 'name', 'name_fa', 'branch', 'department', 'status', 'autonomy', 'kpi', 'load', 'model']
    const lines = filtered.map((a) =>
      [
        a.code,
        a.name,
        a.fa,
        a.branchName,
        a.sectionName,
        a.status,
        `L${a.autonomy}`,
        a.kpi,
        a.load,
        a.model,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    const blob = new Blob(['\uFEFF' + [header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'atlas-agents.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">AGENT DIRECTORY · {fa(allAgents.length)} ROLES</span>
          <h1 className="page-title">فهرست Agentها</h1>
          <p className="page-lede">
            همه نقش‌های سازمان در یک صفحه؛ بر اساس شاخه، وضعیت یا نام جستجو کنید. هر ردیف یک
            پروفایل کامل با ابزارها، سطح خودگردانی و موقعیت سازمانی دارد.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>
          <Icon name="Download" size={14} /> دریافت CSV
        </button>
      </div>

      <div className="dir-controls">
        <div className="dir-search">
          <Icon name="Search" size={17} style={{ color: 'var(--muted)' }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو بر اساس نام، کد، دپارتمان یا ابزار…"
            aria-label="جستجوی Agent"
          />
          {q && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setQ('')} aria-label="پاک کردن">
              <Icon name="X" size={14} />
            </button>
          )}
          <span className="chip" style={{ fontSize: 10 }}>
            {fa(filtered.length)} نتیجه
          </span>
        </div>

        <div className="filter-row">
          <span style={{ fontSize: 10.5, color: 'var(--muted)', marginInlineEnd: 2 }}>شاخه:</span>
          <button
            type="button"
            className={`filter-chip${branch === 'all' ? ' active' : ''}`}
            onClick={() => setBranch('all')}
          >
            همه
          </button>
          {branches.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`filter-chip${branch === b.key ? ' active' : ''}`}
              style={{ ['--accent' as string]: b.accent }}
              onClick={() => setBranch(b.key)}
            >
              <span className="swatch" style={{ background: b.accent }} />
              {b.short}
              <span style={{ opacity: 0.6 }}>{fa(b.agentCount)}</span>
            </button>
          ))}
        </div>

        <div className="filter-row">
          <span style={{ fontSize: 10.5, color: 'var(--muted)', marginInlineEnd: 2 }}>وضعیت:</span>
          <button
            type="button"
            className={`filter-chip${status === 'all' ? ' active' : ''}`}
            onClick={() => setStatus('all')}
          >
            همه
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-chip${status === s ? ' active' : ''}`}
              style={{ ['--accent' as string]: statusMeta[s].color }}
              onClick={() => setStatus(s)}
            >
              <span className="status-dot" style={{ background: statusMeta[s].color }} />
              {statusMeta[s].fa}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: '6px 0' }}>
        {grouped.length === 0 && <div className="dir-empty">هیچ Agentی با این فیلترها پیدا نشد.</div>}
        {grouped.map(([id, group]) => (
          <div key={id}>
            <div className="dir-group-head">
              <span className="swatch" style={{ background: group.accent }} />
              <strong style={{ fontWeight: 600, color: 'var(--text)' }}>{group.label}</strong>
              <span className="en">{branches.find((b) => b.key === group.branchKey)?.name}</span>
              <span className="tree-count" style={{ marginInlineStart: 'auto' }}>
                {fa(group.agents.length)}
              </span>
            </div>
            {group.agents.map((a) => (
              <button key={a.id} type="button" className="agent-row" onClick={() => onAgent(a)}>
                <span className="ar-code">
                  <span className="swatch" style={{ background: a.accent }} />
                  {a.code}
                </span>
                <span className="ar-name">
                  <span className="en">{a.name}</span>
                  <span className="fa">{a.fa}</span>
                </span>
                <span className="ar-sec">{a.sectionFa}</span>
                <span className="ar-kpi" style={{ color: statusMeta[a.status].color }}>
                  <span className="status-dot" style={{ background: statusMeta[a.status].color }} />
                  <span style={{ fontSize: 10, color: 'var(--text-soft)', minWidth: 44 }}>
                    {statusMeta[a.status].fa}
                  </span>
                  <span className="kpi-bar">
                    <span style={{ width: `${a.kpi}%` }} />
                  </span>
                  <span className="en">{fa(a.kpi)}</span>
                </span>
                <span className="ar-chev">
                  <Icon name="ChevronLeft" size={14} />
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="dir-meta" style={{ marginTop: 10 }}>
        <span>
          نمایش {fa(filtered.length)} از {fa(allAgents.length)} نقش · {fa(grouped.length)} دپارتمان
        </span>
        <span>وضعیت‌ها و شاخص‌ها نمونه‌اند و از سیستم عملیاتی نمی‌آیند.</span>
      </div>
    </div>
  )
}
