import { useEffect, useMemo, useRef, useState } from 'react'
import {
  allAgents,
  branchByKey,
  branches,
  sectionById,
  type AgentRecord,
  type BranchKey,
} from '../data/org'
import { Icon } from './Icon'

type Item =
  | { kind: 'agent'; id: string; title: string; sub: string; accent: string; agent: AgentRecord }
  | { kind: 'section'; id: string; title: string; sub: string; accent: string; branchKey: BranchKey; sectionId: string }
  | { kind: 'branch'; id: string; title: string; sub: string; accent: string; branchKey: BranchKey }

const kindLabel = { agent: 'AGENT', section: 'DEPT', branch: 'BRANCH' }

export function SearchPalette({
  open,
  onClose,
  onAgent,
  onNavigate,
}: {
  open: boolean
  onClose: () => void
  onAgent: (agent: AgentRecord) => void
  onNavigate: (path: string) => void
}) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const index = useMemo<Item[]>(() => {
    const items: Item[] = []
    for (const b of branches) {
      items.push({
        kind: 'branch',
        id: b.key,
        title: b.name,
        sub: b.fa,
        accent: b.accent,
        branchKey: b.key,
      })
      for (const s of b.sections) {
        items.push({
          kind: 'section',
          id: s.id,
          title: s.name,
          sub: s.fa,
          accent: b.accent,
          branchKey: b.key,
          sectionId: s.id,
        })
      }
    }
    for (const a of allAgents) {
      items.push({
        kind: 'agent',
        id: a.id,
        title: a.name,
        sub: a.fa,
        accent: a.accent,
        agent: a,
      })
    }
    return items
  }, [])

  const results = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) {
      const featured: Item[] = [
        ...branches.filter((b) => b.kind === 'company' || b.key === 'workforce').map<Item>((b) => ({
          kind: 'branch',
          id: b.key,
          title: b.name,
          sub: b.fa,
          accent: b.accent,
          branchKey: b.key,
        })),
        ...allAgents.slice(0, 6).map<Item>((a) => ({
          kind: 'agent',
          id: a.id,
          title: a.name,
          sub: a.fa,
          accent: a.accent,
          agent: a,
        })),
      ]
      return featured.slice(0, 10)
    }
    const scored = index
      .map((item) => {
        const title = item.title.toLowerCase()
        const sub = item.sub.toLowerCase()
        let score = 0
        if (title === query) score += 100
        if (title.startsWith(query)) score += 50
        else if (title.includes(query)) score += 28
        if (sub.includes(query)) score += 18
        if (item.kind === 'agent' && 'agent' in item && item.agent.code.toLowerCase().includes(query))
          score += 60
        if (item.kind === 'branch') score += 4
        return { item, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 14)
      .map((x) => x.item)
    return scored
  }, [q, index])

  useEffect(() => {
    if (!open) return
    setQ('')
    setActive(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 40)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    setActive(0)
  }, [q])

  const pick = (item: Item) => {
    if (item.kind === 'agent') {
      onAgent(item.agent)
      onClose()
      return
    }
    const path =
      item.kind === 'section'
        ? `/structure?b=${item.branchKey}&s=${item.sectionId}`
        : `/structure?b=${item.branchKey}`
    onNavigate(path)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      pick(results[active])
    }
  }

  return (
    <div
      className={`palette-scrim${open ? ' open' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="جستجو">
        <div className="palette-input">
          <Icon name="Search" size={18} style={{ color: 'var(--muted)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="نام Agent، دپارتمان یا شرکت را جستجو کنید…"
            aria-label="عبارت جستجو"
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="palette-results">
          {results.length === 0 && <div className="palette-empty">نتیجه‌ای پیدا نشد.</div>}
          {results.map((item, i) => (
            <div
              key={`${item.kind}-${item.id}`}
              className={`palette-item${i === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(item)}
            >
              <span className="swatch" style={{ background: item.accent }} />
              <span className="pi-text">
                <span className="pi-en">{item.title}</span>
                <span className="pi-fa">{item.sub}</span>
              </span>
              <span className="pi-kind">{kindLabel[item.kind]}</span>
              <Icon name="CornerDownLeft" size={12} style={{ color: '#5d6276' }} />
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span>↑ ↓ حرکت</span>
          <span>↵ انتخاب</span>
          <span>ESC بستن</span>
          <span style={{ marginInlineStart: 'auto' }}>
            {results.length > 0 ? 'نتیجه در دسترس' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
