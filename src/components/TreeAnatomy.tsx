import { branchByKey, companies, stats } from '../data/org'
import { fa } from '../lib/format'
import { Icon } from './Icon'

/** Deterministic leaf positions inside an elliptical canopy. */
function canopyDots(cx: number, cy: number, rx: number, ry: number, count: number, seed: number) {
  const dots: Array<{ x: number; y: number; r: number; a: number }> = []
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const angle = i * 2.399963 + seed // golden angle spiral
    const radius = Math.sqrt(t)
    dots.push({
      x: cx + Math.cos(angle) * rx * radius * 0.94,
      y: cy + Math.sin(angle) * ry * radius * 0.9,
      r: 2 + ((i * 7 + seed) % 3) * 0.55,
      a: 0.35 + ((i * 13) % 50) / 100,
    })
  }
  return dots
}

const canopy = [
  {
    key: 'trading',
    cx: 196,
    cy: 156,
    rx: 152,
    ry: 82,
    label: 'TRADING',
    accent: branchByKey.trading.accent,
    count: branchByKey.trading.agentCount,
    seed: 1.2,
    lx: 30,
    ly: 16,
  },
  {
    key: 'development',
    cx: 500,
    cy: 112,
    rx: 160,
    ry: 86,
    label: 'DEVELOPMENT',
    accent: branchByKey.development.accent,
    count: branchByKey.development.agentCount,
    seed: 2.7,
    lx: 636,
    ly: 64,
  },
  {
    key: 'marketing',
    cx: 804,
    cy: 156,
    rx: 152,
    ry: 82,
    label: 'MARKETING',
    accent: branchByKey.marketing.accent,
    count: branchByKey.marketing.agentCount,
    seed: 4.1,
    lx: 790,
    ly: 16,
  },
] as const

export function TreeAnatomy({
  navigate,
  onFocusBranch,
}: {
  navigate: (to: string) => void
  onFocusBranch: (key: string) => void
}) {
  return (
    <div className="anatomy">
      <div className="anatomy-legend">
        <span>
          <span className="legend-dot" style={{ background: '#bef264' }} /> ریشه — زیرساخت و پول
        </span>
        <span>
          <span className="legend-dot" style={{ background: '#e7c77b' }} /> تنه — حاکمیت
        </span>
        <span>
          <span className="legend-dot" style={{ background: '#4c8dff' }} /> شاخه — شرکت‌ها
        </span>
        <span>
          <span className="legend-dot" style={{ background: '#f472b6' }} /> برگ — Agentها
        </span>
      </div>

      <svg
        viewBox="0 0 1000 760"
        className="anatomy-svg"
        role="img"
        aria-label="آناتومی ریشه‌ای هلدینگ: ریشه شامل زیرساخت، تنه حاکمیت، سه شاخه شرکتی و برگ‌ها به‌جای Agent"
      >
        <defs>
          <linearGradient id="trunkGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#e7c77b" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#e7c77b" stopOpacity="0.22" />
          </linearGradient>
          <linearGradient id="rootGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bef264" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#bef264" stopOpacity="0.05" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {canopy.map((c) => (
          <ellipse
            key={`glow-${c.key}`}
            cx={c.cx}
            cy={c.cy}
            rx={c.rx + 14}
            ry={c.ry + 14}
            fill={c.accent}
            fillOpacity="0.04"
          />
        ))}

        {/* roots */}
        <g>
          <path
            d="M500 512 C500 574 472 620 400 690"
            stroke="url(#rootGrad)"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M500 512 C500 584 548 626 628 704"
            stroke="url(#rootGrad)"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M494 524 C458 584 396 606 300 640"
            stroke="url(#rootGrad)"
            strokeWidth="4.5"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M506 524 C544 590 612 610 700 638"
            stroke="url(#rootGrad)"
            strokeWidth="4.5"
            fill="none"
            strokeLinecap="round"
          />
          {[
            [428, 604, 380, 652],
            [420, 620, 404, 676],
            [576, 606, 612, 660],
            [586, 622, 628, 676],
            [452, 566, 418, 606],
            [548, 568, 582, 612],
            [338, 616, 296, 668],
            [664, 616, 706, 662],
          ].map(([x1, y1, x2, y2], i) => (
            <line
              key={`fib-${i}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#bef264"
              strokeOpacity="0.2"
              strokeWidth="1.4"
            />
          ))}
        </g>

        {/* trunk */}
        <path
          d="M500 518 C493 472 487 414 489 356 C490 322 495 292 500 264 C505 292 510 322 511 356 C513 414 507 472 500 518 Z"
          fill="url(#trunkGrad)"
          stroke="#e7c77b"
          strokeOpacity="0.4"
          strokeWidth="1"
        />
        <line x1="500" y1="506" x2="500" y2="276" stroke="#fff3d0" strokeOpacity="0.14" strokeDasharray="2 8" />

        {/* branches */}
        <g fill="none" strokeLinecap="round">
          <path d="M494 340 C450 306 344 254 244 208" stroke={canopy[0].accent} strokeOpacity="0.22" strokeWidth="18" />
          <path d="M494 340 C450 306 344 254 244 208" stroke={canopy[0].accent} strokeOpacity="0.85" strokeWidth="5.5" />
          <path d="M500 320 C500 254 500 204 500 168" stroke={canopy[1].accent} strokeOpacity="0.22" strokeWidth="18" />
          <path d="M500 320 C500 254 500 204 500 168" stroke={canopy[1].accent} strokeOpacity="0.85" strokeWidth="5.5" />
          <path d="M506 340 C550 306 656 254 756 208" stroke={canopy[2].accent} strokeOpacity="0.22" strokeWidth="18" />
          <path d="M506 340 C550 306 656 254 756 208" stroke={canopy[2].accent} strokeOpacity="0.85" strokeWidth="5.5" />
        </g>

        {/* twigs inside canopy */}
        {canopy.map((c) => {
          const originX = c.key === 'development' ? 500 : c.key === 'trading' ? 244 : 756
          const originY = c.key === 'development' ? 168 : 208
          return [-2, -1, 0, 1, 2].map((i) => {
            const dx = i * 34
            const dy = Math.abs(i) * 16
            return (
              <path
                key={`twig-${c.key}-${i}`}
                d={`M${originX} ${originY} C${originX + dx * 0.5} ${originY - 22} ${originX + dx} ${
                  originY - 34 - dy
                } ${originX + dx * 1.1} ${originY - 52 - dy}`}
                stroke={c.accent}
                strokeOpacity="0.26"
                strokeWidth="1.2"
                fill="none"
              />
            )
          })
        })}

        {/* leaves */}
        {canopy.map((c) => (
          <g key={`dots-${c.key}`}>
            {canopyDots(c.cx, c.cy, c.rx, c.ry, Math.round(c.count / 3.2), c.seed).map((d, i) => (
              <circle key={`d-${c.key}-${i}`} cx={d.x} cy={d.y} r={d.r} fill={c.accent} fillOpacity={d.a * 0.92} />
            ))}
            <ellipse
              cx={c.cx}
              cy={c.cy}
              rx={c.rx}
              ry={c.ry}
              fill="none"
              stroke={c.accent}
              strokeOpacity="0.14"
              strokeDasharray="3 7"
            />
          </g>
        ))}

        {/* canopy labels */}
        {canopy.map((c) => (
          <foreignObject
            key={`label-${c.key}`}
            x={c.lx}
            y={c.cy + c.ry + c.ly}
            width="158"
            height="62"
            style={{ overflow: 'visible' }}
          >
            <button
              type="button"
              className="an-label"
              style={{ ['--accent' as string]: c.accent }}
              onClick={() => onFocusBranch(c.key)}
            >
              <span className="an-en">{c.label}</span>
              <span className="an-fa">
                {fa(c.count)} Agent · {fa(companies.find((x) => x.key === c.key)?.sections.length ?? 0)} دپارتمان
              </span>
            </button>
          </foreignObject>
        ))}

        {/* governance label */}
        <foreignObject x="40" y="380" width="238" height="98">
          <button
            type="button"
            className="an-label an-label-wide"
            style={{ ['--accent' as string]: '#e7c77b' }}
            onClick={() => onFocusBranch('governance')}
          >
            <span className="an-en">GOVERNANCE TRUNK</span>
            <span className="an-fa">هیئت‌مدیره و ستاد هلدینگ</span>
            <span className="an-meta">
              {fa(stats.divisions)} دپارتمان ستادی · {fa(branchByKey.governance.agentCount)} نقش
            </span>
          </button>
        </foreignObject>
        <line x1="278" y1="424" x2="470" y2="424" stroke="#e7c77b" strokeOpacity="0.28" strokeDasharray="3 5" />
        <circle cx="470" cy="424" r="3" fill="#e7c77b" filter="url(#glow)" />

        {/* root label */}
        <foreignObject x="700" y="600" width="264" height="104">
          <button
            type="button"
            className="an-label an-label-wide"
            style={{ ['--accent' as string]: '#bef264' }}
            onClick={() => onFocusBranch('infrastructure')}
          >
            <span className="an-en">ROOT SYSTEM</span>
            <span className="an-fa">زیرساخت، خزانه و حافظه مشترک</span>
            <span className="an-meta">
              {fa(stats.systems)} سامانه · {fa(stats.companies)} شرکت متصل · یک دفتر کل
            </span>
          </button>
        </foreignObject>
        <line x1="690" y1="650" x2="620" y2="650" stroke="#bef264" strokeOpacity="0.3" strokeDasharray="3 5" />
        <circle cx="620" cy="650" r="3" fill="#bef264" filter="url(#glow)" />

      </svg>

      <div className="anatomy-foot">
        <div className="anatomy-card">
          <span className="ac-ico" style={{ color: '#bef264' }}>
            <Icon name="Wallet" size={16} />
          </span>
          <div>
            <b>ریشه</b>
            <span>زیرساخت، خزانه و حافظه؛ بدون آن هیچ شاخه‌ای پول و داده نمی‌گیرد.</span>
          </div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigate('/infrastructure')}>
            جزئیات <Icon name="ArrowLeft" size={12} />
          </button>
        </div>
        <div className="anatomy-card">
          <span className="ac-ico" style={{ color: '#e7c77b' }}>
            <Icon name="Crown" size={16} />
          </span>
          <div>
            <b>تنه</b>
            <span>حاکمیت، تصمیم و تخصیص سرمایه؛ تک‌نسخه و برای هر سه شرکت.</span>
          </div>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => navigate('/structure?b=governance')}
          >
            جزئیات <Icon name="ArrowLeft" size={12} />
          </button>
        </div>
        <div className="anatomy-card">
          <span className="ac-ico" style={{ color: '#22d3ee' }}>
            <Icon name="Bot" size={16} />
          </span>
          <div>
            <b>رویش</b>
            <span>کارخانه Agent برگ می‌سازد؛ هر نقش جدید روی همان درخت رشد می‌کند.</span>
          </div>
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => navigate('/structure?b=workforce')}
          >
            جزئیات <Icon name="ArrowLeft" size={12} />
          </button>
        </div>
        <div className="anatomy-card">
          <span className="ac-ico" style={{ color: '#f472b6' }}>
            <Icon name="Bot" size={16} />
          </span>
          <div>
            <b>برگ</b>
            <span>هر Agent یک برگ است؛ قابل رشد، هرس و جایگزینی بدون آسیب به درخت.</span>
          </div>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => navigate('/directory')}>
            فهرست <Icon name="ArrowLeft" size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
