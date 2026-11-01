import { branchByKey, stats, type AgentRecord } from '../data/org'
import { fa } from '../lib/format'
import { Icon } from '../components/Icon'
import { Reveal } from '../components/Reveal'

const layerMeta = [
  {
    en: 'ORCHESTRATION & DATA',
    fa: 'ارکستراسیون، اجرا و داده',
    desc: 'از پیام بین Agentها تا حافظه معنایی؛ لایه‌ای که کار را جریان می‌دهد.',
    icon: 'Workflow',
    color: '#22d3ee',
  },
  {
    en: 'IDENTITY, SECURITY & GATES',
    fa: 'هویت، امنیت و دروازه‌های کنترل',
    desc: 'هر دسترسی، هزینه و اقدام حساس از یک دروازه عبور می‌کند.',
    icon: 'ShieldCheck',
    color: '#a78bfa',
  },
  {
    en: 'OBSERVABILITY',
    fa: 'پایش و ثبت',
    desc: 'بدون ثبت و پایش، هیچ ادعای خودگردانی قابل اثبات نیست.',
    icon: 'Activity',
    color: '#34d399',
  },
]

export function InfrastructurePage({ onAgent }: { onAgent: (a: AgentRecord) => void }) {
  const infra = branchByKey.infrastructure

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">CORE INFRASTRUCTURE</span>
          <h1 className="page-title">زیرساخت فنی مرکزی</h1>
          <p className="page-lede">
            پانزده سامانه مشترک که Agentها را از یک ایده به یک نیروی قابل‌اعتماد تبدیل می‌کند:
            ارکستراسیون، حافظه، هویت، دروازه تأیید، ارزیابی و پایش.
          </p>
        </div>
        <span className="chip chip-accent" style={{ ['--accent' as string]: infra.accent }}>
          <Icon name="Server" size={12} /> {fa(stats.systems)} سامانه
        </span>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-value">{fa(stats.systems)}</span>
          <span className="stat-label">سامانه مرکزی</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fa(stats.agents)}</span>
          <span className="stat-label">Agent متصل</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fa(stats.companies)}</span>
          <span className="stat-label">شرکت استفاده‌کننده</span>
        </div>
        <div className="stat">
          <span className="stat-value">۱</span>
          <span className="stat-label">دروازه هویت و تأیید</span>
        </div>
      </div>

      <Reveal>
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ padding: '16px 18px 0', fontSize: 12, color: 'var(--text-soft)' }}>
            <Icon name="GitBranch" size={14} style={{ verticalAlign: -2, color: 'var(--gold)' }} />{' '}
            مسیر یک اقدام حساس، از Agent تا اجرا
          </div>
          <div className="arch-flow">
            {[
              ['Agent', 'درخواست اقدام'],
              ['API Gateway', 'اعتبارسنجی ورودی'],
              ['IAM', 'مجوز و سطح دسترسی'],
              ['Human Approval', 'اقدام حساس'],
              ['Wallet Signer', 'اجرای مستقل'],
            ].map(([en, fa]) => (
              <div className="arch-node" key={en}>
                <span className="en" style={{ fontSize: 10.5, color: 'var(--text)' }}>
                  {en}
                </span>
                <span className="an-en">{fa}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      <div className="layer-list" style={{ marginTop: 18 }}>
        {infra.sections.map((section, i) => {
          const meta = layerMeta[i] ?? layerMeta[0]
          return (
            <Reveal key={section.id}>
              <div className="layer" style={{ ['--accent' as string]: meta.color }}>
                <div className="layer-head">
                  <span className="layer-num">LAYER {String(i + 1).padStart(2, '0')}</span>
                  <span className="branch-icon" style={{ ['--accent' as string]: meta.color }}>
                    <Icon name={meta.icon} size={16} />
                  </span>
                  <h3>{section.fa}</h3>
                  <span className="lh-en">{meta.en}</span>
                  <p>{meta.desc}</p>
                </div>
                <div className="sys-grid">
                  {section.agents.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className="sys-card"
                      onClick={() => onAgent(a)}
                      style={{ textAlign: 'right', fontFamily: 'inherit', color: 'inherit' }}
                    >
                      <span className="sc-icon">
                        <Icon name={iconForSystem(a.name)} size={14} />
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span className="sc-en">{a.name}</span>
                        <div className="sc-fa">{a.fa}</div>
                        <div className="sc-desc">{a.note}</div>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </Reveal>
          )
        })}
      </div>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">CONTROL PLANE</span>
              <h2 className="section-title">
                <span className="dot" /> پنج پنجره‌ای که همیشه باید باز باشند
              </h2>
            </div>
            <p className="section-note">
              خودگردانی بدون شفافیت، ریسک است. این پنج کنترل، از روز اول باید فعال باشند — نه بعد از
              اولین حادثه.
            </p>
          </div>
          <div className="principle-grid">
            {[
              { icon: 'KeyRound', t: 'هویت و راز', d: 'هر Agent هویت مستقل و حداقل دسترسی دارد؛ کلیدها در Secrets Manager.' },
              { icon: 'ShieldCheck', t: 'تأیید انسانی', d: 'اقدامات مالی، حقوقی و حذف داده، دروازه انسانی دارند.' },
              { icon: 'Activity', t: 'پایش زنده', d: 'سلامت، بار کاری و انحراف رفتار در داشبورد واحد.' },
              { icon: 'Layers', t: 'ثبت حسابرسی', d: 'هر تصمیم، ابزار، ورودی و خروجی قابل بازبینی است.' },
              { icon: 'DollarSign', t: 'هزینه مدل', d: 'هزینه هر Agent و هر وظیفه، در سطح شرکت و هلدینگ.' },
            ].map((p) => (
              <div className="principle" key={p.t}>
                <h4>
                  <Icon name={p.icon} size={14} style={{ color: 'var(--gold)' }} /> {p.t}
                </h4>
                <p>{p.d}</p>
              </div>
            ))}
          </div>
          <div className="callout" style={{ marginTop: 14 }}>
            <span className="co-icon">
              <Icon name="Info" size={16} />
            </span>
            <div>
              زیرساخت مشترک، صرفه‌جویی فقط نیست؛ «تک‌نسخه بودن حقیقت» است. اگر هر شرکت حافظه و
              دفتر کل خودش را بسازد، سه سازمان جدا خواهیم داشت، نه یک هلدینگ.
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  )
}

function iconForSystem(name: string): string {
  if (name.includes('Wallet')) return 'Wallet'
  if (name.includes('Database')) return 'Database'
  if (name.includes('Gateway')) return 'Globe'
  if (name.includes('Identity')) return 'Users'
  if (name.includes('Secret')) return 'KeyRound'
  if (name.includes('Approval')) return 'ShieldCheck'
  if (name.includes('Monitor')) return 'Activity'
  if (name.includes('Log')) return 'ListTree'
  if (name.includes('Memory')) return 'BrainCircuit'
  if (name.includes('Cost')) return 'DollarSign'
  if (name.includes('Evaluation')) return 'Gauge'
  if (name.includes('Queue')) return 'Layers'
  if (name.includes('Message')) return 'Network'
  if (name.includes('Workflow')) return 'Workflow'
  return 'Server'
}
