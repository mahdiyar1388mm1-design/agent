import { useEffect, useRef, useState } from 'react'
import { statusMeta, type AgentRecord } from '../data/org'
import { fa } from '../lib/format'
import { Icon } from './Icon'

export function AgentDrawer({
  agent,
  onClose,
  onLocate,
}: {
  agent: AgentRecord | null
  onClose: () => void
  onLocate: (agent: AgentRecord) => void
}) {
  const [current, setCurrent] = useState<AgentRecord | null>(agent)
  const [copied, setCopied] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (agent) {
      setCurrent(agent)
      setCopied(false)
    }
  }, [agent])

  const open = !!agent

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const copy = async () => {
    if (!current) return
    try {
      await navigator.clipboard.writeText(current.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <div className={`drawer-scrim${open ? ' open' : ''}`} onClick={onClose} />
      <aside
        className={`drawer${open ? ' open' : ''}`}
        style={{ ['--accent' as string]: current?.accent ?? '#e7c77b' }}
        role="dialog"
        aria-modal="true"
        aria-label={current ? `پروفایل ${current.name}` : 'پروفایل Agent'}
        aria-hidden={!open}
      >
        {current && (
          <>
            <div className="drawer-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="drawer-label">
                  {current.kind === 'system' ? 'SYSTEM PROFILE · سامانه' : 'AGENT PROFILE · نیروی هوش مصنوعی'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontSize: 10.5, color: current.accent }}>
                    {current.code}
                  </span>
                  <span className="status-chip">
                    <span
                      className="status-dot"
                      style={{ background: statusMeta[current.status].color }}
                    />
                    {statusMeta[current.status].fa}
                  </span>
                </div>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="icon-btn"
                onClick={onClose}
                aria-label="بستن"
              >
                <Icon name="X" size={16} />
              </button>
            </div>

            <div className="drawer-body">
              <div>
                <h2 className="drawer-name">{current.name}</h2>
                <div className="drawer-fa">{current.fa}</div>
                <div className="drawer-path" style={{ marginTop: 10 }}>
                  <span>ATLAS</span>
                  <Icon name="ChevronLeft" size={11} />
                  <b>{current.branchFa}</b>
                  <Icon name="ChevronLeft" size={11} />
                  <b>{current.sectionFa}</b>
                </div>
              </div>

              {current.note && (
                <div className="callout" style={{ fontSize: 11.5 }}>
                  <span className="co-icon">
                    <Icon name="Info" size={15} />
                  </span>
                  <span>{current.note}</span>
                </div>
              )}

              <div>
                <div className="drawer-label">METRICS · وضعیت نمونه</div>
                <div className="metric-grid">
                  <div className="metric">
                    <div className="m-label">
                      <Icon name="Gauge" size={12} /> کارایی (KPI)
                    </div>
                    <div className="m-value">
                      {fa(current.kpi)}
                      <small>٪</small>
                    </div>
                  </div>
                  <div className="metric">
                    <div className="m-label">
                      <Icon name="Activity" size={12} /> بار کاری
                    </div>
                    <div className="m-value">
                      {fa(current.load)}
                      <small>٪</small>
                    </div>
                  </div>
                  <div className="metric">
                    <div className="m-label">
                      <Icon name="Sparkles" size={12} /> سطح خودگردانی
                    </div>
                    <div className="m-value">
                      L{current.autonomy}
                      <small>{current.model}</small>
                    </div>
                  </div>
                  <div className="metric">
                    <div className="m-label">
                      <Icon name="DollarSign" size={12} /> هزینه ساعتی
                    </div>
                    <div className="m-value">
                      ${current.cost.toFixed(1)}
                      <small>تقریبی</small>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="drawer-label">TOOLS · ابزارهای متصل</div>
                <div className="tool-chips">
                  {current.tools.map((tool) => (
                    <span className="tool-chip" key={tool}>
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              <div className="metric" style={{ padding: '12px 14px' }}>
                <div className="m-label">
                  <Icon name="Network" size={12} /> موقعیت سازمانی
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-soft)', marginTop: 4, lineHeight: 1.9 }}>
                  گزارش‌دهی به دپارتمان «{current.sectionFa}» در {current.branchFa}؛ سطح دسترسی L
                  {current.autonomy} با دروازه تأیید انسانی برای اقدامات حساس.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onLocate(current)}>
                  <Icon name="ListTree" size={14} /> دیدن در ساختار
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>
                  <Icon name={copied ? 'Check' : 'Copy'} size={14} />
                  {copied ? 'کپی شد' : 'کپی شناسه'}
                </button>
              </div>

              <p className="note-box">
                این پروفایل بخشی از نقشه معماری است؛ شاخص‌ها، ابزارها و وضعیت برای نمایش ساختار
                شبیه‌سازی شده‌اند و به سیستم عملیاتی متصل نیستند.
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  )
}
