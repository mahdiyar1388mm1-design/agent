import { capabilities, companies, companiesMeta, roadmap, stats, walletSecurity, branches } from '../data/org'
import type { AgentRecord } from '../data/org'
import { fa, faNum } from '../lib/format'
import { ROUTES } from '../lib/router'
import { Icon } from '../components/Icon'
import { Reveal } from '../components/Reveal'
import { RootMap } from '../components/RootMap'
import { TreeAnatomy } from '../components/TreeAnatomy'

interface Props {
  navigate: (to: string) => void
  onAgent: (agent: AgentRecord) => void
}

export function Home({ navigate, onAgent }: Props) {
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">AI HOLDING OPERATING SYSTEM</span>
          <h1 className="hero-title">
            یک هلدینگ.
            <br />
            سه شرکت.
            <br />
            <span className="grad">یک ریشه.</span>
          </h1>
          <p className="hero-lede">
            ATLAS نقشه سازمانی یک هلدینگ هوش مصنوعی است: {fa(stats.agents)} نقش تخصصی که در{' '}
            {fa(stats.companies)} شرکت عملیاتی، {fa(stats.divisions)} دپارتمان ستادی، یک کارخانه
            Agent، یک خزانه مرکزی و {fa(stats.systems)} سامانه زیرساختی ریشه دوانده‌اند.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-primary" onClick={() => navigate(ROUTES.map)}>
              <Icon name="Radar" size={16} /> کاوش نقشه ریشه
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => navigate(ROUTES.directory)}>
              <Icon name="Users" size={16} /> فهرست {fa(stats.agents)} Agent
            </button>
          </div>
          <div className="hero-meta">
            <div>
              <span className="hm-v">{fa(stats.branches)}</span>
              <span className="hm-l">شاخه اصلی</span>
            </div>
            <div>
              <span className="hm-v">{fa(stats.sections)}</span>
              <span className="hm-l">دپارتمان</span>
            </div>
            <div>
              <span className="hm-v">{fa(stats.agents)}</span>
              <span className="hm-l">نقش تخصصی</span>
            </div>
            <div>
              <span className="hm-v">۶</span>
              <span className="hm-l">سطح سلسله‌مراتب</span>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="hero-map-frame">
            <span className="corner c1" />
            <span className="corner c2" />
            <span className="corner c3" />
            <span className="corner c4" />
            <RootMap compact onSelect={onAgent} onFocus={(key) => navigate(`${ROUTES.map}?b=${key}`)} />
          </div>
          <div className="hero-map-caption">
            <span>
              <span className="en">ROOT MAP</span> · کلیک روی شاخه = بزرگ‌نمایی
            </span>
            <span className="num" style={{ color: 'var(--gold)' }}>
              {fa(stats.agents)} dots
            </span>
          </div>
        </div>
      </section>

      <div className="stat-grid" style={{ marginTop: 28 }}>
        <div className="stat">
          <span className="stat-value">{faNum(stats.agents)}</span>
          <span className="stat-label">Agent در ساختار</span>
          <span className="stat-foot">در {fa(stats.sections)} دپارتمان</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fa(stats.companies)}</span>
          <span className="stat-label">شرکت عملیاتی</span>
          <span className="stat-foot">Trading · Development · Marketing</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fa(stats.divisions)}</span>
          <span className="stat-label">دپارتمان ستادی هلدینگ</span>
          <span className="stat-foot">مالی، کنترل، حقوقی، HR، R&D</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {fa(stats.systems)}
            <small>سامانه</small>
          </span>
          <span className="stat-label">زیرساخت مشترک</span>
          <span className="stat-foot">Orchestrator، IAM، Wallet…</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {fa(stats.active)}
            <small>فعال</small>
          </span>
          <span className="stat-label">نیروی در حال کار</span>
          <span className="stat-foot">میانگین خودگردانی L{stats.autonomyAvg}</span>
        </div>
      </div>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">ANATOMY · ۰۰</span>
              <h2 className="section-title">
                <span className="dot" /> آناتومی ریشه‌ای سازمان
              </h2>
            </div>
            <p className="section-note">
              همان چیزی که در یک درخت اتفاق می‌افتد: ریشه پول و زیرساخت، تنه حاکمیت، شاخه‌ها شرکت‌ها و
              برگ‌ها Agentها. هرس برگ، درخت را نمی‌کشد؛ قطع ریشه، می‌کشد.
            </p>
          </div>
          <TreeAnatomy
            navigate={navigate}
            onFocusBranch={(key) => navigate(`${ROUTES.map}?b=${key}`)}
          />
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">ROOTS · ۰۱</span>
              <h2 className="section-title">
                <span className="dot" /> نُه شاخه‌ای که کل سازمان از آن‌ها می‌روید
              </h2>
            </div>
            <p className="section-note">
              هر شاخه یک قابلیت مستقل است: از حاکمیت و ستاد هلدینگ تا سه شرکت عملیاتی، کارخانه
              Agent، ستاد همکاری، خزانه و زیرساخت.
            </p>
          </div>
          <div className="branch-grid">
            {branches.map((b, i) => (
              <Reveal key={b.key} delay={i * 40}>
                <button
                  type="button"
                  className="card card-hover accent-card branch-card"
                  style={{ ['--accent' as string]: b.accent }}
                  onClick={() => navigate(`${ROUTES.structure}?b=${b.key}`)}
                >
                  <div className="branch-card-top">
                    <span className="branch-icon">
                      <Icon name={b.icon} size={17} />
                    </span>
                    <span className="bc-tag">{b.tag}</span>
                    <span className="bc-count">{fa(b.agentCount)}</span>
                  </div>
                  <div>
                    <h3>{b.fa}</h3>
                    <div className="bc-en">{b.name}</div>
                  </div>
                  <p>{b.desc}</p>
                  <span className="bc-link">
                    {fa(b.sections.length)} دپارتمان · مشاهده شاخه
                    <Icon name="ArrowLeft" size={13} />
                  </span>
                </button>
              </Reveal>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">OPERATING COMPANIES · ۰۲</span>
              <h2 className="section-title">
                <span className="dot" /> سه شرکت، یک زیرساخت مشترک
              </h2>
            </div>
            <p className="section-note">
              هر شرکت مدیرعامل، دپارتمان‌ها و Agentهای کارگر خود را دارد؛ اما داده، حافظه، امنیت و
              خزانه در سطح هلدینگ مشترک است.
            </p>
          </div>
          <div className="company-grid">
            {companies.map((c, i) => {
              const meta = companiesMeta.find((m) => m.key === c.key)!
              const leaders = c.sections[0]?.agents.slice(0, 3) ?? []
              return (
                <Reveal key={c.key} delay={i * 60}>
                  <article
                    className="card card-hover accent-card company-card"
                    style={{ ['--accent' as string]: c.accent }}
                  >
                    <div className="co-legal">{c.name}</div>
                    <div>
                      <h3 className="co-name">{c.fa}</h3>
                      <p className="co-role">{meta.role}</p>
                    </div>
                    <div className="co-stats">
                      <div>
                        <div className="co-stat-v">{fa(c.agentCount)}</div>
                        <div className="co-stat-l">Agent</div>
                      </div>
                      <div>
                        <div className="co-stat-v">{fa(c.sections.length)}</div>
                        <div className="co-stat-l">دپارتمان</div>
                      </div>
                      <div>
                        <div className="co-stat-v">{fa(meta.metricValue)}</div>
                        <div className="co-stat-l">{meta.metricLabel}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                      رهبران: {leaders.map((l) => l.fa).join(' · ')}
                    </div>
                    <div className="co-foot">
                      <span className="en" style={{ fontSize: 10, color: '#7b8094' }}>
                        {c.name.split(' ')[0].toUpperCase()} DIVISION
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`${ROUTES.structure}?b=${c.key}`)}
                      >
                        ساختار کامل <Icon name="ArrowLeft" size={13} />
                      </button>
                    </div>
                  </article>
                </Reveal>
              )
            })}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">SELF-GOVERNANCE · ۰۳</span>
              <h2 className="section-title">
                <span className="dot" /> سه قابلیتی که از روز اول طراحی شده‌اند
              </h2>
            </div>
            <p className="section-note">
              سازمان باید بتواند نیرو استخدام کند، آن را مدیریت کند و با شرکت‌های دیگر همکاری کند —
              بدون اینکه انسان از حلقه تأیید خارج شود.
            </p>
          </div>
          <div className="cap-grid">
            {capabilities.map((cap, i) => (
              <Reveal key={cap.id} delay={i * 60}>
                <article
                  className="card accent-card cap-card"
                  style={{ ['--accent' as string]: cap.accent }}
                >
                  <div className="cap-top">
                    <span className="cap-icon">
                      <Icon name={cap.icon} size={19} />
                    </span>
                    <div>
                      <div className="cap-en">{cap.en}</div>
                      <h3>{cap.fa}</h3>
                    </div>
                  </div>
                  <p>{cap.desc}</p>
                  <div className="flow">
                    {cap.steps.map((step, idx) => (
                      <span key={step} style={{ display: 'contents' }}>
                        <span className="flow-step">
                          <span className="fs-n">{fa(idx + 1)}</span>
                          {step}
                        </span>
                        {idx < cap.steps.length - 1 && (
                          <span className="flow-arrow">
                            <Icon name="ChevronLeft" size={12} />
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="wallet-band">
            <div>
              <span className="eyebrow" style={{ color: '#bef264' }}>
                TREASURY · ۰۴
              </span>
              <h2>پول در مرکز، اما کلید هرگز دست Agent نیست.</h2>
              <p className="wb-lede">
                هر سه شرکت به یک خزانه مرکزی وصل‌اند؛ با دفتر کل قابل حسابرسی، سقف برداشت و امضای
                مستقل. Agent فقط درخواست می‌دهد — امضا در یک سرویس جداگانه و با تأیید چندمرحله‌ای
                انجام می‌شود.
              </p>
              <div className="sec-list">
                {walletSecurity.slice(0, 3).map((item) => (
                  <div className="sec-item" key={item.title}>
                    <span className="si-icon">
                      <Icon name={item.icon} size={16} />
                    </span>
                    <div>
                      <b>{item.title}</b>
                      <span>{item.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigate(ROUTES.operations)}
                >
                  معماری کامل خزانه <Icon name="ArrowLeft" size={13} />
                </button>
              </div>
            </div>
            <div className="wallet-visual">
              <div className="wallet-shell">
                <div className="ws-label">CENTRAL TREASURY · MASTER WALLET</div>
                <div className="ws-title">ATLAS · Multi-Chain Vault</div>
                <div className="ws-balance">
                  $ 0.00 <small>موجودی نمونه</small>
                </div>
                <div className="ws-foot">
                  <span className="chip">3-of-5 Approval</span>
                  <span className="chip">Daily Limit</span>
                  <span className="chip">Kill Switch</span>
                </div>
              </div>
              <div className="wallet-flow">
                <span>
                  <span className="wf-dot" /> درخواست Agent
                </span>
                <span className="wf-arr">←</span>
                <span>
                  <span className="wf-dot" /> کنترل مالی
                </span>
                <span className="wf-arr">←</span>
                <span>
                  <span className="wf-dot" /> تأیید انسانی
                </span>
                <span className="wf-arr">←</span>
                <span>
                  <span className="wf-dot" /> امضای مستقل
                </span>
              </div>
              <div className="note-box" style={{ fontSize: 10 }}>
                هیچ Agentی در هیچ سطحی به کلید خصوصی دسترسی ندارد. توقف اضطراری خارج از دسترس
                Agentهای معاملاتی است.
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">ROLLOUT · ۰۵</span>
              <h2 className="section-title">
                <span className="dot" /> راه‌اندازی مرحله‌به‌مرحله، نه یک‌شبه
              </h2>
            </div>
            <button type="button" className="btn btn-quiet" onClick={() => navigate(ROUTES.roadmap)}>
              نقشه راه کامل <Icon name="ArrowLeft" size={13} />
            </button>
          </div>
          <div className="timeline">
            {roadmap.slice(0, 4).map((step) => (
              <div className="tl-item" key={step.n}>
                <div className="tl-num">{step.n}</div>
                <div>
                  <div className="tl-title">{step.title}</div>
                  <div className="tl-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>
    </div>
  )
}

