import { hierarchy, tree as treeLayout, type HierarchyPointNode } from 'd3-hierarchy'
import { useMemo, useRef, useState } from 'react'
import {
  branchByKey,
  branchTree,
  rootTree,
  sectionById,
  stats,
  type BranchKey,
  type TreeNode,
} from '../data/org'
import type { AgentRecord } from '../data/org'
import { fa } from '../lib/format'

const TAU = Math.PI * 2
const sectionPalette = [
  '#e7c77b',
  '#f5a524',
  '#4c8dff',
  '#f472b6',
  '#22d3ee',
  '#34d399',
  '#bef264',
  '#a78bfa',
  '#fb7185',
  '#94a3b8',
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

function point(angle: number, r: number): [number, number] {
  return [Math.cos(angle - Math.PI / 2) * r, Math.sin(angle - Math.PI / 2) * r]
}

function annulus(a0: number, a1: number, r0: number, r1: number, pad = 0): string {
  const start = a0 + pad
  const end = a1 - pad
  if (end <= start) return ''
  const large = end - start > Math.PI ? 1 : 0
  const p0 = point(start, r1)
  const p1 = point(end, r1)
  const p2 = point(end, r0)
  const p3 = point(start, r0)
  return [
    `M${p0[0].toFixed(2)},${p0[1].toFixed(2)}`,
    `A${r1},${r1} 0 ${large} 1 ${p1[0].toFixed(2)},${p1[1].toFixed(2)}`,
    `L${p2[0].toFixed(2)},${p2[1].toFixed(2)}`,
    `A${r0},${r0} 0 ${large} 0 ${p3[0].toFixed(2)},${p3[1].toFixed(2)}`,
    'Z',
  ].join(' ')
}

type PointNode = HierarchyPointNode<TreeNode>

interface Tip {
  x: number
  y: number
  node: TreeNode
}

export function RootMap({
  focus = null,
  onFocus,
  onSelect,
  compact = false,
}: {
  focus?: BranchKey | null
  onFocus?: (key: BranchKey | null) => void
  onSelect?: (agent: AgentRecord) => void
  compact?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const data = useMemo(() => (focus ? branchTree(focus) : rootTree), [focus])

  const layout = useMemo(() => {
    const root = hierarchy(data, (d) => d.children)
    const tree = treeLayout<TreeNode>().size([TAU, 1])
    tree(root)

    const spans = new Map<PointNode, [number, number]>()
    const collect = (n: PointNode): [number, number] => {
      if (!n.children || n.children.length === 0) {
        spans.set(n, [n.x, n.x])
        return [n.x, n.x]
      }
      let min = Infinity
      let max = -Infinity
      for (const c of n.children) {
        const [a, b] = collect(c as PointNode)
        if (a < min) min = a
        if (b > max) max = b
      }
      spans.set(n, [min, max])
      return [min, max]
    }
    collect(root as PointNode)

    const colorOf = new Map<PointNode, string>()
    const assign = (n: PointNode, color: string) => {
      colorOf.set(n, color)
      n.children?.forEach((c) => assign(c as PointNode, color))
    }
    if (root.children) {
      root.children.forEach((c, i) => {
        const node = c as PointNode
        const color = focus
          ? sectionPalette[i % sectionPalette.length]
          : branchByKey[node.data.branchKey!]?.accent ?? '#e7c77b'
        assign(node, color)
      })
    }
    colorOf.set(root as PointNode, focus ? branchByKey[focus].accent : '#e7c77b')

    const leaves: Array<{ node: PointNode; x: number; y: number; r: number; color: string }> = []
    const base = compact ? 300 : 344
    const spread = compact ? 44 : 52
    for (const n of root.leaves() as PointNode[]) {
      const jitter = hash(n.data.id)
      const r = base + jitter * spread
      const [x, y] = point(n.x, r)
      leaves.push({ node: n, x, y, r, color: colorOf.get(n) ?? '#e7c77b' })
    }

    return { root: root as PointNode, spans, colorOf, leaves }
  }, [data, focus, compact])

  const count = focus ? branchByKey[focus].agentCount : stats.agents
  const centerColor = focus ? branchByKey[focus].accent : '#e7c77b'

  const handleEnter = (node: TreeNode) => (e: React.MouseEvent) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, node })
  }

  const onBranchClick = (node: TreeNode) => {
    if (node.type !== 'branch') return
    if (compact) {
      if (node.branchKey) onFocus?.(node.branchKey)
      return
    }
    if (!focus && node.branchKey) onFocus?.(node.branchKey)
  }

  const depth1 = (layout.root.children ?? []) as PointNode[]

  return (
    <div className={compact ? 'map-canvas compact' : 'map-canvas'} ref={wrapRef} onMouseLeave={() => setTip(null)}>
      <svg
        viewBox="-500 -500 1000 1000"
        className="map-svg"
        role="img"
        aria-label={`نقشه ریشه‌ای سازمان: ${fa(count)} نقش در ${fa(depth1.length)} شاخه`}
      >
        <defs>
          <radialGradient id="map-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#121620" />
            <stop offset="100%" stopColor="#080a11" />
          </radialGradient>
        </defs>

        {[150, 250, 340, 470].map((r) => (
          <circle key={r} className="ring" r={r} />
        ))}
        <circle r="94" fill="url(#map-core)" stroke={centerColor} strokeOpacity="0.25" strokeWidth="1" />

        {depth1.map((n) => {
          const [a0, a1] = layout.spans.get(n)!
          const mid = (a0 + a1) / 2
          const color = layout.colorOf.get(n)!
          const p0 = point(a0 + 0.004, 152)
          const p1 = point(a0 + 0.004, 100)
          return (
            <line
              key={`spoke-${n.data.id}`}
              className="spoke"
              x1={p0[0]}
              y1={p0[1]}
              x2={p1[0]}
              y2={p1[1]}
            />
          )
        })}

        {depth1.map((n) => {
          const [a0, a1] = layout.spans.get(n)!
          const color = layout.colorOf.get(n)!
          return (
            <path
              key={`wedge-${n.data.id}`}
              className="branch-wedge"
              d={annulus(a0, a1, 100, 148, 0.008)}
              fill={color}
              fillOpacity={focus ? 0.24 : 0.18}
              stroke={color}
              strokeOpacity={0.5}
              strokeWidth={0.8}
              onClick={() => onBranchClick(n.data)}
              onMouseMove={handleEnter(n.data)}
            />
          )
        })}

        {depth1.map((n) => {
          const [a0, a1] = layout.spans.get(n)!
          const mid = (a0 + a1) / 2
          const color = layout.colorOf.get(n)!
          return (
            <g key={`labels-${n.data.id}`}>
              {!focus && n.children?.map((c) => {
                const cn = c as PointNode
                const [b0, b1] = layout.spans.get(cn)!
                const cmid = (b0 + b1) / 2
                const [lx, ly] = point(cmid, 262)
                return (
                  <path
                    key={`sec-${cn.data.id}`}
                    className="section-arc"
                    d={annulus(b0, b1, 244, 255, 0.004)}
                    fill={color}
                    fillOpacity={0.45}
                    stroke={color}
                    strokeOpacity={0.55}
                    strokeWidth={0.6}
                    onMouseMove={handleEnter(cn.data)}
                  />
                )
              })}
              <text
                className="branch-label"
                fill={color}
                fillOpacity={0.95}
                transform={`translate(${point(mid, 172)[0]},${point(mid, 172)[1]}) rotate(${
                  (mid * 180) / Math.PI - 90
                })`}
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ fontSize: compact ? 14 : 12.5 }}
              >
                {focus
                  ? sectionById.get(n.data.id)?.short ?? n.data.fa
                  : branchByKey[n.data.branchKey!]?.short ?? n.data.fa}
              </text>
            </g>
          )
        })}

        {layout.leaves.map((l) => (
          <circle
            key={`leaf-${l.node.data.id}`}
            className="leaf"
            cx={l.x}
            cy={l.y}
            r={compact ? 3 : focus ? 3.8 : 2.8}
            fill={l.color}
            fillOpacity={0.62}
            onMouseMove={handleEnter(l.node.data)}
            onClick={() => l.node.data.agent && onSelect?.(l.node.data.agent)}
          >
            <title>{l.node.data.name}</title>
          </circle>
        ))}

        <g
          style={{ cursor: focus ? 'pointer' : 'default' }}
          onClick={() => focus && onFocus?.(null)}
        >
          <circle r="92" fill="transparent" />
          <text className="center-title" y="-16" textAnchor="middle">
            ATLAS
          </text>
          <text className="center-count" y="16" textAnchor="middle" fill={centerColor}>
            {fa(count)}
          </text>
          <text className="center-sub" y="38" textAnchor="middle">
            {focus ? branchByKey[focus].short : 'نقش تخصصی'}
          </text>
          {focus && (
            <text className="center-sub" y="56" textAnchor="middle" style={{ fill: '#6f7488' }}>
              ← back
            </text>
          )}
        </g>
      </svg>

      {tip && (
        <div className="map-tooltip" style={{ left: tip.x, top: tip.y }}>
          <span className="tt-name">{tip.node.name}</span>
          <span className="tt-fa">{tip.node.fa}</span>
          <div className="tt-meta">
            {tip.node.type === 'agent' && tip.node.agent ? (
              <>
                {tip.node.agent.code} · {tip.node.agent.sectionFa} · {fa(tip.node.agent.kpi)}٪ KPI
              </>
            ) : tip.node.type === 'branch' ? (
              <>
                {fa(tip.node.count)} نقش · {fa(tip.node.children?.length ?? 0)} دپارتمان
              </>
            ) : (
              <>{fa(tip.node.count)} نقش تخصصی</>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
