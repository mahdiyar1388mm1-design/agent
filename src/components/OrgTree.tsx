import { useEffect, useMemo, useState } from 'react'
import { branchByKey, statusMeta, type AgentRecord, type TreeNode } from '../data/org'
import { fa } from '../lib/format'
import { Icon } from './Icon'

function collectExpandable(node: TreeNode, acc: string[] = []): string[] {
  if (node.children?.length) {
    acc.push(node.id)
    node.children.forEach((c) => collectExpandable(c, acc))
  }
  return acc
}

function NodeRow({
  node,
  depth,
  open,
  toggle,
  onAgent,
  highlightId,
}: {
  node: TreeNode
  depth: number
  open: Set<string>
  toggle: (id: string) => void
  onAgent: (agent: AgentRecord) => void
  highlightId?: string
}) {
  const hasChildren = !!node.children?.length
  const isOpen = open.has(node.id)
  const agent = node.agent
  const icon = agent
    ? agent.kind === 'system'
      ? 'Server'
      : 'CircleDot'
    : node.type === 'root'
      ? 'GitFork'
      : branchByKey[node.branchKey!]?.icon ?? 'Building2'

  const onClick = () => {
    if (agent) onAgent(agent)
    else if (hasChildren) toggle(node.id)
  }

  return (
    <div className="tree-node">
      <button
        type="button"
        id={`tree-${node.id}`}
        className={`tree-row${highlightId === node.id ? ' highlight' : ''}`}
        data-depth={depth}
        style={{ ['--depth' as string]: depth, ['--accent' as string]: node.accent }}
        onClick={onClick}
        aria-expanded={hasChildren ? isOpen : undefined}
      >
        <span className={`twist${isOpen ? ' open' : ''}${hasChildren ? '' : ' empty'}`}>
          <Icon name="ChevronDown" size={14} />
        </span>
        <span className="tree-badge" style={{ ['--accent' as string]: node.accent }}>
          <Icon name={icon} size={14} />
        </span>
        <span className="tree-text">
          <span className="tree-name">{node.type === 'agent' ? node.name : node.fa}</span>
          <span className="tree-en">{node.type === 'agent' ? node.fa : node.name}</span>
        </span>
        <span className="tree-meta">
          {agent && (
            <span className="status-chip">
              <span className="status-dot" style={{ background: statusMeta[agent.status].color }} />
              {statusMeta[agent.status].fa}
            </span>
          )}
          {hasChildren && <span className="tree-count">{fa(node.count)}</span>}
        </span>
      </button>
      {hasChildren && isOpen && (
        <div className="tree-children">
          {node.children!.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              open={open}
              toggle={toggle}
              onAgent={onAgent}
              highlightId={highlightId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function OrgTree({
  tree,
  onAgent,
  defaultExpanded,
  toolbar = true,
  highlightId,
}: {
  tree: TreeNode
  onAgent: (agent: AgentRecord) => void
  defaultExpanded?: string[]
  toolbar?: boolean
  highlightId?: string
}) {
  const initial = useMemo(() => {
    if (defaultExpanded) return new Set(defaultExpanded)
    const ids: string[] = [tree.id]
    tree.children?.forEach((c) => ids.push(c.id))
    return new Set(ids)
  }, [tree, defaultExpanded])

  const [open, setOpen] = useState<Set<string>>(initial)

  useEffect(() => {
    if (!highlightId) return
    const t = window.setTimeout(() => {
      document.getElementById(`tree-${highlightId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 180)
    return () => window.clearTimeout(t)
  }, [highlightId])

  const all = useMemo(() => new Set(collectExpandable(tree)), [tree])
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="tree">
      {toolbar && (
        <div className="tree-toolbar">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(all)}>
            <Icon name="Layers" size={14} /> باز کردن همه
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(new Set([tree.id]))}>
            <Icon name="ListTree" size={14} /> فقط شاخه‌ها
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(initial)}>
            <Icon name="RotateCcw" size={14} /> نمای پیش‌فرض
          </button>
          <span style={{ marginInlineStart: 'auto', fontSize: 10.5, color: 'var(--muted)', alignSelf: 'center' }}>
            {fa(tree.count)} نقش
          </span>
        </div>
      )}
      <div className="tree-scroll">
        <NodeRow
          node={tree}
          depth={0}
          open={open}
          toggle={toggle}
          onAgent={onAgent}
          highlightId={highlightId}
        />
      </div>
    </div>
  )
}
