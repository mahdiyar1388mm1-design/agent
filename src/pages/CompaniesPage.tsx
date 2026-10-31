import { companies, companiesMeta, stats, statusMeta, type AgentRecord } from '../data/org'
import { fa } from '../lib/format'
import { ROUTES } from '../lib/router'
import { Icon } from '../components/Icon'
import { Reveal } from '../components/Reveal'

export function CompaniesPage({
  navigate,
  onAgent,
}: {
  navigate: (to: string) => void
  onAgent: (a: AgentRecord) => void
}) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">THREE COMPANIES · ONE HOLDING</span>
          <h1 className="page-title">سه شرکت عملیاتی</h1>
          <p className="page-lede">
            Trading، Development و Marketing هر یک مدیرعامل، دپارتمان‌ها و نیروی Agent خود را دارند؛
            اما در حاکمیت، خزانه، داده و زیرساخت به یک ریشه مشترک وصل می‌شوند.
          </p>
        </div>
        <span className="chip chip-accent">
          <Icon name="Crown" size={12} /> گزارش به Holding CEO
        </span>
      </div>

      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <div className="stat">
          <span className="stat-value">{fa(stats.companies)}</span>
          <span className="stat-label">شرکت</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fa(companies.reduce((n, c) => n + c.agentCount, 0))}</span>
          <span className="stat-label">Agent در سه شرکت</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fa(companies.reduce((n, c) => n + c.sections.length, 0))}</span>
          <span className="stat-label">دپارتمان عملیاتی</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fa(stats.autonomyAvg)}</span>
          <span className="stat-label">میانگین سطح خودگردانی</span>
        </div>
      </div>

      {companies.map((c, idx) => {
        const meta = companiesMeta.find((m) => m.key === c.key)!
        const leadership = c.sections[0]
        const divisions = c.sections.slice(1)
        const active = c.sections.flatMap((s) => s.agents).filter((a) => a.status === 'active').length
        return (
          <Reveal key={c.key}>
            <section style={{ marginTop: idx === 0 ? 0 : 30 }}>
              <div className="co-hero" style={{ ['--accent' as string]: c.accent }}>
                <div className="co-hero-top">
                  <span className="co-mark">
                    <Icon name={c.icon} size={26} />
                  </span>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div className="co-en">{meta.legal}</div>
                    <h1>{c.fa}</h1>
                    <p className="co-desc">{meta.role}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    <span className="chip chip-accent" style={{ ['--accent' as string]: c.accent }}>
                      {c.tag} <span className="num">{fa(idx + 1)}</span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => navigate(`${ROUTES.structure}?b=${c.key}`)}
                    >
                      <Icon name="ListTree" size={14} /> ساختار کامل
                    </button>
                  </div>
                </div>
                <div className="co-kpis">
                  <div>
                    <div className="k-v">{fa(c.agentCount)}</div>
                    <div className="k-l">Agent</div>
                  </div>
                  <div>
                    <div className="k-v">{fa(c.sections.length)}</div>
                    <div className="k-l">دپارتمان</div>
                  </div>
                  <div>
                    <div className="k-v">{fa(active)}</div>
                    <div className="k-l">نیروی فعال</div>
                  </div>
                  <div>
                    <div className="k-v">{fa(meta.metricValue)}</div>
                    <div className="k-l">{meta.metricLabel}</div>
                  </div>
                  <div>
                    <div className="k-v">{fa(leadership?.agents.length ?? 0)}</div>
                    <div className="k-l">نقش رهبری</div>
                  </div>
                </div>
              </div>

              <div className="co-section-title">
                <Icon name="Crown" size={15} style={{ color: c.accent }} />
                مدیریت ارشد {meta.legal.split(' ')[0]}
                <span className="en" style={{ fontSize: 9.5, color: 'var(--muted)' }}>
                  EXECUTIVE TEAM
                </span>
              </div>
              <div className="leadership-strip">
                {leadership?.agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="lead-chip"
                    style={{ ['--accent' as string]: c.accent }}
                    onClick={() => onAgent(a)}
                  >
                    <span className="lc-en">{a.name}</span>
                    <span className="lc-fa">{a.fa}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <span
                        className="status-dot"
                        style={{ background: statusMeta[a.status].color }}
                      />
                      <span style={{ fontSize: 9, color: 'var(--muted)' }}>
                        {a.code} · {statusMeta[a.status].fa}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="co-section-title">
                <Icon name="Layers" size={15} style={{ color: c.accent }} />
                دپارتمان‌ها و ظرفیت هر حوزه
                <span className="en" style={{ fontSize: 9.5, color: 'var(--muted)' }}>
                  DIVISIONS
                </span>
              </div>
              <div className="division-grid">
                {divisions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="division-card"
                    style={{ ['--accent' as string]: c.accent, textAlign: 'right', color: 'inherit', fontFamily: 'inherit' }}
                    onClick={() => navigate(`${ROUTES.structure}?b=${c.key}&s=${s.id}`)}
                  >
                    <div className="dc-top">
                      <span className="swatch" style={{ background: c.accent }} />
                      <h4>{s.fa}</h4>
                      <span className="dc-en" style={{ marginInlineStart: 'auto' }}>
                        {s.name}
                      </span>
                    </div>
                    <p>{s.desc}</p>
                    <div className="tool-chips" style={{ gap: 4 }}>
                      {s.agents.slice(0, 2).map((a) => (
                        <span
                          key={a.id}
                          className="tool-chip"
                          style={{ fontFamily: 'var(--font-fa)', direction: 'rtl' }}
                        >
                          {a.fa}
                        </span>
                      ))}
                      {s.agents.length > 2 && (
                        <span className="tool-chip" style={{ fontFamily: 'var(--font-fa)', direction: 'rtl' }}>
                          +{fa(s.agents.length - 2)}
                        </span>
                      )}
                    </div>
                    <div className="dc-foot">
                      <span>
                        {fa(s.agents.length)} Agent · {fa(s.agents.filter((a) => a.status === 'active').length)} فعال
                      </span>
                      <Icon name="ArrowLeft" size={12} />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </Reveal>
        )
      })}

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">SHARED SPINE</span>
              <h2 className="section-title">
                <span className="dot" /> آنچه بین سه شرکت مشترک است
              </h2>
            </div>
            <p className="section-note">
              شرکت‌ها محصول و بازار خود را دارند، اما زیرساخت، نیروی Agent و پول را تکرار نمی‌کنند.
            </p>
          </div>
          <div className="branch-grid">
            {[
              {
                key: 'workforce',
                icon: 'Bot',
                accent: '#22d3ee',
                title: 'کارخانه Agent',
                en: 'AI Workforce',
                desc: 'استخدام، آموزش، ارزیابی و بازنشستگی Agent برای هر سه شرکت.',
              },
              {
                key: 'treasury',
                icon: 'Wallet',
                accent: '#bef264',
                title: 'خزانه مرکزی',
                en: 'Treasury & Wallet',
                desc: 'کیف پول واحد، سقف برداشت، امضای مستقل و دفتر کل مشترک.',
              },
              {
                key: 'infrastructure',
                icon: 'Server',
                accent: '#94a3b8',
                title: 'زیرساخت مرکزی',
                en: 'Core Infrastructure',
                desc: 'ارکستراسیون، حافظه، هویت، پایش و دروازه تأیید انسانی.',
              },
              {
                key: 'intercompany',
                icon: 'Network',
                accent: '#34d399',
                title: 'ستاد همکاری',
                en: 'Intercompany',
                desc: 'درخواست خدمات، صورت‌حساب داخلی، تسهیم درآمد و دانش مشترک.',
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className="card card-hover accent-card branch-card"
                style={{ ['--accent' as string]: item.accent }}
                onClick={() => navigate(`${ROUTES.structure}?b=${item.key}`)}
              >
                <div className="branch-card-top">
                  <span className="branch-icon">
                    <Icon name={item.icon} size={17} />
                  </span>
                  <span className="bc-tag">{item.en}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
                <span className="bc-link">
                  مشاهده <Icon name="ArrowLeft" size={13} />
                </span>
              </button>
            ))}
          </div>
        </section>
      </Reveal>
    </div>
  )
}
