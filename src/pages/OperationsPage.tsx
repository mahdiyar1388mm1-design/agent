import {
  branchByKey,
  capabilities,
  statusMeta,
  walletSecurity,
  type AgentRecord,
} from '../data/org'
import { fa } from '../lib/format'
import { ROUTES } from '../lib/router'
import { Icon } from '../components/Icon'
import { Reveal } from '../components/Reveal'

export function OperationsPage({
  navigate,
  onAgent,
}: {
  navigate: (to: string) => void
  onAgent: (a: AgentRecord) => void
}) {
  const intercompany = branchByKey.intercompany
  const treasury = branchByKey.treasury

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">INTERCOMPANY · TREASURY</span>
          <h1 className="page-title">همکاری سه شرکت و خزانه مرکزی</h1>
          <p className="page-lede">
            سازمان وقتی «یک سازمان» است که سه شرکت بتوانند به هم خدمت بدهند، هزینه‌ها را تسویه کنند و
            پول از یک مسیر امن و قابل حسابرسی عبور کند.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="chip chip-accent">
            <Icon name="Network" size={12} /> {fa(intercompany.agentCount)} Agent مشترک
          </span>
          <span className="chip">
            <Icon name="Wallet" size={12} /> {fa(treasury.agentCount)} Agent مالی
          </span>
        </div>
      </div>

      <Reveal>
        <section>
          <div className="section-head">
            <div>
              <span className="eyebrow">AUTONOMY · ۰۱</span>
              <h2 className="section-title">
                <span className="dot" /> سه قابلیت خودگردان
              </h2>
            </div>
            <p className="section-note">
              انسان در حلقه تأیید باقی می‌ماند؛ اما درخواست، اجرا، سنجش و تسویه توسط Agentها انجام
              می‌شود.
            </p>
          </div>
          <div className="cap-grid">
            {capabilities.map((cap) => (
              <article
                key={cap.id}
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
                <div className="sec-list" style={{ marginTop: 0 }}>
                  {cap.steps.map((step, i) => (
                    <div
                      key={step}
                      style={{ display: 'flex', gap: 9, alignItems: 'center', fontSize: 11, color: 'var(--text-soft)' }}
                    >
                      <span
                        className="mono"
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 9,
                          border: '1px solid var(--line)',
                          color: cap.accent,
                        }}
                      >
                        {fa(i + 1)}
                      </span>
                      {step}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">INTERCOMPANY · ۰۲</span>
              <h2 className="section-title">
                <span className="dot" /> ستاد همکاری سه شرکت
              </h2>
            </div>
            <p className="section-note">
              درخواست خدمات، صورت‌حساب داخلی، تسهیم درآمد و گزارش یکپارچه؛ همه در یک لایه مستقل از
              هر سه شرکت.
            </p>
          </div>
          <div className="ic-grid">
            {intercompany.sections.flatMap((s) =>
              s.agents.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  className="ic-card"
                  style={{ textAlign: 'right', color: 'inherit', fontFamily: 'inherit' }}
                  onClick={() => onAgent(a)}
                >
                  <span className="ic-num">{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="ic-en">{a.name}</span>
                    <div className="ic-fa">{a.fa}</div>
                    {a.note && <div className="ic-note">{a.note}</div>}
                  </span>
                </button>
              )),
            )}
          </div>
          <div className="diff-banner">
            <div className="db-cell">
              <div className="db-v">SLA</div>
              <div className="db-l">درخواست خدمات با زمان پاسخ مشخص</div>
            </div>
            <div className="db-cell">
              <div className="db-v">TP</div>
              <div className="db-l">قیمت‌گذاری انتقالی خدمات داخلی</div>
            </div>
            <div className="db-cell">
              <div className="db-v">SKO</div>
              <div className="db-l">دانش و داده مشترک، بدون تکرار ساخت</div>
            </div>
            <div className="db-cell">
              <div className="db-v">1×</div>
              <div className="db-l">گزارش یکپارچه برای هیئت‌مدیره</div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="wallet-band">
            <div>
              <span className="eyebrow" style={{ color: '#bef264' }}>
                TREASURY · ۰۳
              </span>
              <h2>کیف پول مرکزی، با امضای جدا از Agent</h2>
              <p className="wb-lede">
                Master Wallet Controller فقط درخواست می‌سازد؛ کلید خصوصی در Secrets Manager و سرویس
                امضای مستقل نگهداری می‌شود. هر برداشت از سقف، سیاست و تأیید چندمرحله‌ای عبور می‌کند.
              </p>
              <div className="sec-list">
                {walletSecurity.map((item) => (
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
                  <span className="chip">Audit Trail</span>
                </div>
                <div style={{ marginTop: 16, fontSize: 10, color: 'var(--muted)' }}>
                  <div className="side-kv">
                    <span>دسترسی Agent به کلید</span>
                    <b style={{ color: '#fb7185' }}>ندارد</b>
                  </div>
                  <div className="side-kv">
                    <span>حداقل تأیید برداشت بزرگ</span>
                    <b>۳ نقش + انسان</b>
                  </div>
                  <div className="side-kv">
                    <span>توقف اضطراری</span>
                    <b>خارج از دسترس Agent</b>
                  </div>
                </div>
              </div>
              <div className="note-box">
                <strong style={{ color: 'var(--text-soft)' }}>مسیر یک برداشت:</strong>
                <div className="flow" style={{ marginTop: 8 }}>
                  {[
                    'درخواست Agent',
                    'کنترل سقف',
                    'تأیید مالی/ریسک',
                    'تأیید انسانی',
                    'امضای مستقل',
                  ].map((s, i) => (
                    <span key={s} style={{ display: 'contents' }}>
                      <span className="flow-step" style={{ fontSize: 10 }}>
                        {s}
                      </span>
                      {i < 4 && (
                        <span className="flow-arrow">
                          <Icon name="ChevronLeft" size={11} />
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="co-section-title">
            <Icon name="Wallet" size={15} style={{ color: treasury.accent }} />
            {fa(treasury.agentCount)} Agent خزانه و کیف پول
            <button
              type="button"
              className="btn btn-quiet btn-sm"
              style={{ marginInlineStart: 'auto' }}
              onClick={() => navigate(`${ROUTES.structure}?b=treasury`)}
            >
              ساختار کامل <Icon name="ArrowLeft" size={12} />
            </button>
          </div>
          <div className="company-grid">
            {treasury.sections.map((s) => (
              <div key={s.id} className="card card-pad" style={{ ['--accent' as string]: treasury.accent }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="swatch" style={{ background: treasury.accent }} />
                  <strong style={{ fontSize: 13 }}>{s.fa}</strong>
                  <span className="tree-count" style={{ marginInlineStart: 'auto' }}>
                    {fa(s.agents.length)}
                  </span>
                </div>
                <div className="dc-en" style={{ marginBottom: 8 }}>
                  {s.name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {s.agents.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="agent-mini"
                      onClick={() => onAgent(a)}
                    >
                      <span
                        className="status-dot"
                        style={{ background: statusMeta[a.status].color }}
                      />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-soft)' }}>
                        {a.fa}
                      </span>
                      <span className="en" style={{ fontSize: 8.5, color: '#676c80' }}>
                        {a.code}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="callout">
            <span className="co-icon">
              <Icon name="AlertTriangle" size={18} />
            </span>
            <div>
              <strong>قاعده امنیتی غیرقابل‌عبور:</strong> کیف پول اصلی کلید خصوصی را به هیچ Agent،
              حتی Master Wallet Controller نمی‌دهد. امضا در یک سیستم مستقل انجام می‌شود؛ با محدودیت
              برداشت، تأیید چندمرحله‌ای و امکان توقف اضطراری خارج از دسترس Agentهای معاملاتی. تست
              نفوذ و حسابرسی دوره‌ای Wallet Security Auditor بخشی از راه‌اندازی است.
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  )
}
