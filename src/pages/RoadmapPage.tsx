import { capabilities, finalHierarchy, roadmap, stats } from '../data/org'
import { fa } from '../lib/format'
import { ROUTES } from '../lib/router'
import { Icon } from '../components/Icon'
import { Reveal } from '../components/Reveal'

const principles = [
  {
    icon: 'Users',
    t: 'نقش اول، مدل بعد',
    d: 'هر عنوان یک نقش سازمانی است؛ لازم نیست هر نقش یک مدل جداگانه داشته باشد. یک Agent با چند ابزار می‌تواند چند عنوان را پوشش دهد.',
  },
  {
    icon: 'KeyRound',
    t: 'حداقل دسترسی',
    d: 'هر Agent فقط به ابزارها و داده‌های لازم همان نقش دسترسی دارد و سطح دسترسی قابل بازبینی است.',
  },
  {
    icon: 'ShieldCheck',
    t: 'انسان در حلقه',
    d: 'اقدامات مالی، حقوقی و تغییر ساختار، دروازه تأیید انسانی دارند — به‌صورت پیش‌فرض، نه استثنا.',
  },
  {
    icon: 'Layers',
    t: 'قابل حسابرسی',
    d: 'هر تصمیم و هر ابزار فراخوانی‌شده ثبت می‌شود؛ بدون log، خودگردانی قابل اثبات نیست.',
  },
  {
    icon: 'DollarSign',
    t: 'هزینه‌آگاه',
    d: 'هزینه هر Agent و هر وظیفه اندازه‌گیری می‌شود و بهینه‌ساز هزینه، اختیار پیشنهاد جایگزینی دارد.',
  },
  {
    icon: 'RotateCcw',
    t: 'قابل جایگزینی',
    d: 'هر Agent نسخه، ارزیابی و جانشین دارد؛ سازمان به یک Agent خاص گره نمی‌خورد.',
  },
]

const success = [
  { k: '۹۵٪', l: 'وظایف تکراری بدون دخالت انسان' },
  { k: '۱۰۰٪', l: 'اقدامات حساس دارای تأیید و ثبت' },
  { k: '۱×', l: 'حافظه و دفتر کل مشترک' },
  { k: '۶ ماه', l: 'تا اولین چرخه استخدام خودکار' },
]

export function RoadmapPage({ navigate }: { navigate: (to: string) => void }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">IMPLEMENTATION · SEQUENCE</span>
          <h1 className="page-title">نقشه راه اجرا</h1>
          <p className="page-lede">
            ساخت همه‌چیز در یک روز، سازمان را می‌شکند. ترتیب پیشنهادی از کنترل و زیرساخت شروع می‌شود،
            سپس شرکت‌ها یکی‌یکی روی همان ریشه سوار می‌شوند.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(ROUTES.map)}>
          <Icon name="Radar" size={14} /> دیدن نقشه ریشه
        </button>
      </div>

      <div className="stat-grid" style={{ marginBottom: 26 }}>
        <div className="stat">
          <span className="stat-value">{fa(stats.agents)}</span>
          <span className="stat-label">نقش در معماری نهایی</span>
        </div>
        <div className="stat">
          <span className="stat-value">{fa(stats.sections)}</span>
          <span className="stat-label">دپارتمان</span>
        </div>
        <div className="stat">
          <span className="stat-value">۶</span>
          <span className="stat-label">مرحله راه‌اندازی</span>
        </div>
        <div className="stat">
          <span className="stat-value">۳</span>
          <span className="stat-label">قابلیت خودگردان بنیادی</span>
        </div>
      </div>

      <div className="structure-layout">
        <div className="card" style={{ padding: '20px 24px 10px', minWidth: 0 }}>
          <div className="section-title" style={{ fontSize: 17, marginBottom: 4 }}>
            <span className="dot" /> ترتیب فعال‌سازی
          </div>
          <div className="timeline">
            {roadmap.map((step) => (
              <div className="tl-item" key={step.n}>
                <div className="tl-num">{step.n}</div>
                <div>
                  <div className="tl-title">
                    {step.title}
                    {step.n === '۰۱' && <span className="chip chip-accent">پیش‌نیاز همه</span>}
                    {step.n === '۰۶' && <span className="chip">هدف نهایی</span>}
                  </div>
                  <div className="tl-desc">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="structure-side">
          <div className="card side-card">
            <h4>
              <Icon name="Target" size={14} /> معیار موفقیت
            </h4>
            {success.map((s) => (
              <div className="side-kv" key={s.l} style={{ alignItems: 'center', padding: '7px 0' }}>
                <span>{s.l}</span>
                <b style={{ fontSize: 13, color: 'var(--gold)' }}>{s.k}</b>
              </div>
            ))}
            <p className="empty-note" style={{ marginTop: 8, lineHeight: 1.9 }}>
              اعداد هدف‌اند، نه وعده. هر مرحله باید قبل از مرحله بعد قابل اندازه‌گیری باشد.
            </p>
          </div>

          <div className="card side-card">
            <h4>
              <Icon name="Workflow" size={14} /> قابلیت‌های بنیادی
            </h4>
            <div className="branch-pick">
              {capabilities.map((c) => (
                <button key={c.id} type="button" onClick={() => navigate(ROUTES.operations)}>
                  <span className="swatch" style={{ background: c.accent }} />
                  <span className="bp-name">{c.fa}</span>
                  <span className="bp-count en" style={{ fontSize: 8 }}>
                    {c.en.split(' ')[1]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">GOVERNANCE</span>
              <h2 className="section-title">
                <span className="dot" /> سلسله‌مراتب نهایی
              </h2>
            </div>
            <p className="section-note">
              شش سطح روشن؛ هر سطح فقط به سطح بالاتر گزارش می‌دهد و اختیار تصمیمش مشخص است.
            </p>
          </div>
          <div className="hier-list">
            {finalHierarchy.map((h, i) => (
              <div className="hier-row" key={h.level}>
                <span className="h-n">L{fa(i + 1)}</span>
                <span>
                  <span className="h-en">{h.level}</span>
                  <span className="h-fa"> — {h.fa}</span>
                </span>
                <span className="h-note">{h.note}</span>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">RISK &amp; COST</span>
              <h2 className="section-title">
                <span className="dot" /> چهار ریسکی که باید از روز اول مهار شود
              </h2>
            </div>
            <p className="section-note">
              بزرگ‌ترین خطر این معماری، پیچیدگی و هزینه نیست؛ ساختن صدها Agent که هیچ‌کدام صاحب
              مشخص و معیار کیفیت ندارند.
            </p>
          </div>
          <div className="principle-grid">
            {[
              {
                icon: 'DollarSign',
                t: 'هزینه مدل‌ها',
                d: 'هر نقش لازم نیست به گران‌ترین مدل وصل شود؛ رده‌بندی L1..L4 و Cost Tracking از هدررفت جلوگیری می‌کند.',
              },
              {
                icon: 'Users',
                t: 'تورم نقش‌ها',
                d: '۴۷۶ عنوان، ۴۷۶ مدل نیست. یک Agent تخصصی با چند ابزار می‌تواند چند عنوان را پوشش دهد.',
              },
              {
                icon: 'ShieldCheck',
                t: 'خودگردانی بی‌مهار',
                d: 'هر اقدام مالی، حقوقی یا ساختاری باید دروازه تأیید، سقف و ثبت داشته باشد.',
              },
              {
                icon: 'RotateCcw',
                t: 'وابستگی به یک Agent',
                d: 'هر نقش نسخه‌بندی، ارزیابی و جانشین دارد؛ وگرنه سازمان به یک باگ گره می‌خورد.',
              },
            ].map((p) => (
              <div className="principle" key={p.t}>
                <h4>
                  <Icon name={p.icon} size={14} style={{ color: 'var(--rose, #fb7185)' }} /> {p.t}
                </h4>
                <p>{p.d}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="section-head">
            <div>
              <span className="eyebrow">PRINCIPLES</span>
              <h2 className="section-title">
                <span className="dot" /> اصولی که از روز اول باید رعایت شوند
              </h2>
            </div>
            <p className="section-note">
              این اصول، تفاوت یک دموی جذاب با یک سازمان قابل اتکا هستند.
            </p>
          </div>
          <div className="principle-grid">
            {principles.map((p) => (
              <div className="principle" key={p.t}>
                <h4>
                  <Icon name={p.icon} size={14} style={{ color: 'var(--gold)' }} /> {p.t}
                </h4>
                <p>{p.d}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section">
          <div className="wallet-band" style={{ borderColor: 'rgba(231,199,123,0.2)' }}>
            <div>
              <span className="eyebrow">NEXT STEP · ۰۷</span>
              <h2>از نقشه به اجرا: یک شرکت، یک قابلیت، یک چرخه.</h2>
              <p className="wb-lede">
                پیشنهاد عملی: با کارخانه Agent و زیرساخت مرکزی در Development شروع کنید؛ اولین
                قابلیت خودگردان را «استخدام Agent برای یک وظیفه مشخص» انتخاب کنید؛ و قبل از اتصال
                خزانه، دروازه تأیید انسانی و دفتر کل را آماده کنید.
              </p>
              <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 18 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(ROUTES.structure)}
                >
                  <Icon name="ListTree" size={15} /> مرور ساختار کامل
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => navigate(ROUTES.directory)}
                >
                  <Icon name="Users" size={15} /> فهرست نقش‌ها
                </button>
              </div>
            </div>
            <div className="sec-list" style={{ marginTop: 0 }}>
              {[
                ['۱', 'کارخانه Agent', 'ساخت، استخدام، آموزش و ارزیابی'],
                ['۲', 'دروازه‌های کنترل', 'هویت، مجوز، تأیید انسانی و ثبت'],
                ['۳', 'اولین شرکت', 'Development به‌عنوان سازنده بقیه سازمان'],
                ['۴', 'خزانه مرکزی', 'فقط بعد از تثبیت کنترل‌ها'],
              ].map(([n, t, d]) => (
                <div className="sec-item" key={t} style={{ borderColor: 'var(--line)' }}>
                  <span className="si-icon" style={{ color: 'var(--gold)' }}>
                    <span className="mono" style={{ fontSize: 10 }}>
                      {n}
                    </span>
                  </span>
                  <div>
                    <b>{t}</b>
                    <span>{d}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </Reveal>
    </div>
  )
}
