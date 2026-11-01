import { governance, holding, workforce } from './board'
import { trading, development, marketing } from './companies'
import { intercompany, treasury, infrastructure } from './systems'
import type { BranchKey, RawBranch } from './types'

export type { BranchKey } from './types'


export interface BranchMeta {
  key: BranchKey
  name: string
  fa: string
  desc: string
  kind: RawBranch['kind']
  accent: string
  icon: string
  tag: string
  short: string
}

export const branchMeta: Record<BranchKey, BranchMeta> = {
  governance: {
    key: 'governance',
    name: 'Board & Executive',
    fa: 'هیئت‌مدیره و مدیریت ارشد',
    desc: 'لایه حاکمیت؛ جایی که استراتژی، سرمایه و ریسک کل هلدینگ تعیین می‌شود.',
    kind: 'board',
    accent: '#e7c77b',
    icon: 'Crown',
    tag: 'حاکمیت',
    short: 'هیئت‌مدیره',
  },
  holding: {
    key: 'holding',
    name: 'Holding Divisions',
    fa: 'دپارتمان‌های ستادی هلدینگ',
    desc: 'پنج دپارتمان ستادی که به‌جای هر شرکت، برای کل هلدینگ خدمت می‌دهند.',
    kind: 'staff',
    accent: '#a78bfa',
    icon: 'Building2',
    tag: 'ستاد',
    short: 'ستاد هلدینگ',
  },
  trading: {
    key: 'trading',
    name: 'Trading Corporation',
    fa: 'شرکت معاملات الگوریتمی',
    desc: 'معاملات کمّی، تحلیل بازار و مدیریت سرمایه؛ از داده تا اجرای سفارش.',
    kind: 'company',
    accent: '#f5a524',
    icon: 'CandlestickChart',
    tag: 'شرکت',
    short: 'معاملات',
  },
  development: {
    key: 'development',
    name: 'Development Corporation',
    fa: 'شرکت مهندسی و محصولات دیجیتال',
    desc: 'مهندسی نرم‌افزار، هوش مصنوعی و محصولات دیجیتال؛ کارخانه ساخت خود Agentها.',
    kind: 'company',
    accent: '#4c8dff',
    icon: 'Code2',
    tag: 'شرکت',
    short: 'توسعه',
  },
  marketing: {
    key: 'marketing',
    name: 'Marketing Corporation',
    fa: 'شرکت بازاریابی و رشد',
    desc: 'بازاریابی، تبلیغات، فروش و توسعه بازار برای کل پرتفوی هلدینگ.',
    kind: 'company',
    accent: '#f472b6',
    icon: 'Megaphone',
    tag: 'شرکت',
    short: 'بازاریابی',
  },
  workforce: {
    key: 'workforce',
    name: 'AI Workforce',
    fa: 'کارخانه ساخت و مدیریت Agentها',
    desc: 'قلب خودگردانی سازمان: ساخت، استخدام، آموزش، ارزیابی و بازنشستگی Agentها.',
    kind: 'machine',
    accent: '#22d3ee',
    icon: 'Bot',
    tag: 'کارخانه Agent',
    short: 'کارخانه Agent',
  },
  intercompany: {
    key: 'intercompany',
    name: 'Intercompany',
    fa: 'ستاد همکاری سه شرکت',
    desc: 'لایه‌ای که سه شرکت را به یک سازمان تبدیل می‌کند: درخواست، صورت‌حساب، تسهیم درآمد و دانش مشترک.',
    kind: 'bridge',
    accent: '#34d399',
    icon: 'Network',
    tag: 'اتصال',
    short: 'همکاری',
  },
  treasury: {
    key: 'treasury',
    name: 'Treasury & Wallet',
    fa: 'خزانه مرکزی و کیف پول',
    desc: 'یک سیستم مالی مستقل و قابل حسابرسی که هر سه شرکت را به کیف پول مرکزی متصل می‌کند.',
    kind: 'money',
    accent: '#bef264',
    icon: 'Wallet',
    tag: 'مالی',
    short: 'خزانه',
  },
  infrastructure: {
    key: 'infrastructure',
    name: 'Core Infrastructure',
    fa: 'زیرساخت فنی مرکزی',
    desc: 'پانزده سامانه مشترک که اجرای واقعی سازمان را ممکن می‌کند: ارکستراسیون، حافظه، هویت، پایش و تأیید انسانی.',
    kind: 'infra',
    accent: '#94a3b8',
    icon: 'Server',
    tag: 'زیرساخت',
    short: 'زیرساخت',
  },
}

const rawBranches: RawBranch[] = [
  governance,
  holding,
  workforce,
  trading,
  development,
  marketing,
  intercompany,
  treasury,
  infrastructure,
]

const prefixes: Record<BranchKey, string> = {
  governance: 'GOV',
  holding: 'HLD',
  trading: 'TRD',
  development: 'DEV',
  marketing: 'MKT',
  workforce: 'AIW',
  intercompany: 'ICO',
  treasury: 'TRS',
  infrastructure: 'INF',
}

export type AgentStatus = 'active' | 'idle' | 'training' | 'paused' | 'critical'

export const statusMeta: Record<AgentStatus, { fa: string; color: string }> = {
  active: { fa: 'فعال', color: '#34d399' },
  idle: { fa: 'آماده‌به‌کار', color: '#94a3b8' },
  training: { fa: 'در آموزش', color: '#22d3ee' },
  paused: { fa: 'متوقف', color: '#f5a524' },
  critical: { fa: 'نیازمند توجه', color: '#fb7185' },
}

const toolPool = [
  'market-data',
  'order-router',
  'vector-memory',
  'web-search',
  'code-sandbox',
  'sql-warehouse',
  'wallet-vault',
  'ledger',
  'notion-docs',
  'github',
  'slack',
  'exchange-api',
  'analytics',
  'browser',
  'pdf-reader',
  'risk-engine',
]

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seed * arr.length) % arr.length]
}

function statusFor(seed: number): AgentStatus {
  if (seed < 0.58) return 'active'
  if (seed < 0.76) return 'idle'
  if (seed < 0.88) return 'training'
  if (seed < 0.96) return 'paused'
  return 'critical'
}

function sectionCode(name: string): string {
  const words = name
    .replace(/&/g, ' ')
    .replace(/[^a-zA-Z ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  const letters = words.map((w) => w[0].toUpperCase()).join('')
  return (letters || 'SEC').slice(0, 3)
}

export interface AgentRecord {
  id: string
  code: string
  name: string
  fa: string
  note?: string
  kind: 'agent' | 'system'
  branchKey: BranchKey
  branchName: string
  branchFa: string
  accent: string
  sectionId: string
  sectionName: string
  sectionFa: string
  status: AgentStatus
  load: number
  kpi: number
  cost: number
  autonomy: 1 | 2 | 3 | 4
  model: string
  tools: string[]
}

export interface SectionRecord {
  id: string
  code: string
  name: string
  fa: string
  short: string
  desc: string
  branchKey: BranchKey
  accent: string
  agents: AgentRecord[]
}

export interface BranchRecord extends BranchMeta {
  sections: SectionRecord[]
  agentCount: number
}

const models: Record<number, string> = {
  1: 'A1 · Fast',
  2: 'A2 · Reasoning',
  3: 'A3 · Autonomous',
  4: 'A4 · Swarm',
}

export const branches: BranchRecord[] = rawBranches.map((raw) => {
  const meta = branchMeta[raw.key]
  const prefix = prefixes[raw.key]
  const seen = new Set<string>()
  const sections = raw.sections.map((sec, si) => {
    let code = sectionCode(sec.name)
    if (seen.has(code)) code = `${code}${si + 1}`
    seen.add(code)
    const sectionId = `${raw.key}-${si + 1}`
    const agents: AgentRecord[] = sec.agents.map((agent, ai) => {
      const id = `${sectionId}-${ai + 1}`
      const seed = hash(id + agent.name)
      const seed2 = hash(agent.name + id + 'x')
      const seed3 = hash(id + 'cost')
      const autonomy = (Math.floor(seed2 * 4) + 1) as 1 | 2 | 3 | 4
      const tools: string[] = []
      const toolCount = 2 + Math.floor(seed3 * 3)
      for (let i = 0; i < toolCount; i++) {
        const tool = pick(toolPool, hash(id + i))
        if (!tools.includes(tool)) tools.push(tool)
      }
      return {
        id,
        code: `${prefix}-${code}-${String(ai + 1).padStart(2, '0')}`,
        name: agent.name,
        fa: agent.fa,
        note: agent.note,
        kind: raw.key === 'infrastructure' ? 'system' : 'agent',
        branchKey: raw.key,
        branchName: meta.name,
        branchFa: meta.fa,
        accent: meta.accent,
        sectionId,
        sectionName: sec.name,
        sectionFa: sec.fa,
        status: statusFor(seed),
        load: Math.round(28 + seed2 * 68),
        kpi: Math.round(74 + seed3 * 25),
        cost: Math.round((0.6 + seed * 5.4) * 10) / 10,
        autonomy,
        model: models[autonomy],
        tools,
      }
    })
    return {
      id: sectionId,
      code,
      name: sec.name,
      fa: sec.fa,
      short: sec.short ?? sec.fa,
      desc: sec.desc ?? '',
      branchKey: raw.key,
      accent: meta.accent,
      agents,
    }
  })
  return {
    ...meta,
    sections,
    agentCount: sections.reduce((n, s) => n + s.agents.length, 0),
  }
})

export const branchByKey = Object.fromEntries(branches.map((b) => [b.key, b])) as Record<
  BranchKey,
  BranchRecord
>

export const companies = branches.filter((b) => b.kind === 'company')

export const allAgents: AgentRecord[] = branches.flatMap((b) => b.sections.flatMap((s) => s.agents))

export const agentById = new Map(allAgents.map((a) => [a.id, a]))

export const sectionById = new Map(
  branches.flatMap((b) => b.sections.map((s) => [s.id, s] as const)),
)

export const sectionOfAgent = new Map(allAgents.map((a) => [a.id, a.sectionId]))

export const stats = {
  agents: allAgents.length,
  sections: branches.reduce((n, b) => n + b.sections.length, 0),
  branches: branches.length,
  companies: companies.length,
  divisions: branches.filter((b) => b.kind === 'staff').reduce((n, b) => n + b.sections.length, 0),
  systems: branchByKey.infrastructure.agentCount,
  active: allAgents.filter((a) => a.status === 'active').length,
  autonomyAvg:
    Math.round((allAgents.reduce((n, a) => n + a.autonomy, 0) / allAgents.length) * 10) / 10,
}

export interface TreeNode {
  id: string
  name: string
  fa: string
  type: 'root' | 'branch' | 'section' | 'agent'
  count: number
  accent: string
  branchKey?: BranchKey
  sectionId?: string
  agent?: AgentRecord
  children?: TreeNode[]
}

export const rootTree: TreeNode = {
  id: 'atlas',
  name: 'ATLAS Holding',
  fa: 'هلدینگ هوش مصنوعی اطلس',
  type: 'root',
  count: allAgents.length,
  accent: '#f2e9d8',
  children: branches.map((b) => ({
    id: b.key,
    name: b.name,
    fa: b.fa,
    type: 'branch' as const,
    count: b.agentCount,
    accent: b.accent,
    branchKey: b.key,
    children: b.sections.map((s) => ({
      id: s.id,
      name: s.name,
      fa: s.fa,
      type: 'section' as const,
      count: s.agents.length,
      accent: b.accent,
      branchKey: b.key,
      sectionId: s.id,
      children: s.agents.map((a) => ({
        id: a.id,
        name: a.name,
        fa: a.fa,
        type: 'agent' as const,
        count: 1,
        accent: b.accent,
        branchKey: b.key,
        sectionId: s.id,
        agent: a,
      })),
    })),
  })),
}

export function branchTree(key: BranchKey): TreeNode {
  const b = branchByKey[key]
  return {
    id: b.key,
    name: b.name,
    fa: b.fa,
    type: 'branch',
    count: b.agentCount,
    accent: b.accent,
    branchKey: b.key,
    children: rootTree.children!.find((c) => c.id === key)!.children,
  }
}

export const companiesMeta = [
  {
    key: 'trading' as BranchKey,
    legal: 'Trading Corporation',
    fa: 'شرکت معاملات الگوریتمی',
    role: 'تحلیل بازار، معامله و مدیریت سرمایه',
    accent: '#f5a524',
    icon: 'CandlestickChart',
    metricLabel: 'کتاب استراتژی فعال',
    metricValue: 34,
  },
  {
    key: 'development' as BranchKey,
    legal: 'Development Corporation',
    fa: 'شرکت مهندسی و محصولات دیجیتال',
    role: 'ساخت Agent، محصول و زیرساخت نرم‌افزاری',
    accent: '#4c8dff',
    icon: 'Code2',
    metricLabel: 'مدل و Agent در تولید',
    metricValue: 128,
  },
  {
    key: 'marketing' as BranchKey,
    legal: 'Marketing Corporation',
    fa: 'شرکت بازاریابی و رشد',
    role: 'رشد، برند، فروش و توسعه بازار',
    accent: '#f472b6',
    icon: 'Megaphone',
    metricLabel: 'کمپین فعال',
    metricValue: 57,
  },
]

export const capabilities = [
  {
    id: 'hiring',
    en: 'Autonomous Hiring',
    fa: 'استخدام خودکار',
    desc: 'هر مدیر می‌تواند درخواست ساخت نیروی جدید بدهد؛ کارخانه Agent نقش را طراحی، ابزار را متصل و نسخه اول را استخدام می‌کند.',
    steps: ['درخواست مدیر', 'طراحی نقش و ابزار', 'آزمون و ارزیابی', 'استخدام در ساختار'],
    icon: 'UserPlus',
    accent: '#22d3ee',
  },
  {
    id: 'management',
    en: 'Autonomous Management',
    fa: 'مدیریت خودکار',
    desc: 'مدیران وظیفه می‌دهند، عملکرد را می‌سنجند، کیفیت را کنترل و Agent ضعیف را جایگزین می‌کنند؛ همه با شواهد قابل حسابرسی.',
    steps: ['تخصیص وظیفه', 'پایش عملکرد', 'کنترل کیفیت', 'ارتقا یا جایگزینی'],
    icon: 'Gauge',
    accent: '#a78bfa',
  },
  {
    id: 'collaboration',
    en: 'Autonomous Collaboration',
    fa: 'همکاری خودکار',
    desc: 'سه شرکت می‌توانند پروژه و خدمات را به یکدیگر واگذار کنند؛ درخواست، صورت‌حساب داخلی و تسهیم درآمد خودکار ثبت می‌شود.',
    steps: ['درخواست بین‌شرکتی', 'توافق و SLA', 'اجرای مشترک', 'صورت‌حساب و گزارش'],
    icon: 'Network',
    accent: '#34d399',
  },
]

export const roadmap = [
  {
    n: '۰۱',
    title: 'مدیریت مرکزی و زیرساخت Agentها',
    desc: 'ارکستراسیون، حافظه، هویت، پایش و دروازه تأیید انسانی؛ پیش‌نیاز هر چیز دیگر.',
  },
  {
    n: '۰۲',
    title: 'فعال‌سازی شرکت Development',
    desc: 'کارخانه Agent اول در درون Development ساخته می‌شود و بقیه سازمان را مجهز می‌کند.',
  },
  {
    n: '۰۳',
    title: 'فعال‌سازی شرکت Marketing',
    desc: 'نخستین مصرف‌کننده بزرگ Agentها؛ رشد و فروش به‌عنوان میدان آزمون.',
  },
  {
    n: '۰۴',
    title: 'مدیریت مالی و کیف پول',
    desc: 'خزانه مرکزی با امضای جدا، سقف برداشت و توقف اضطراری.',
  },
  {
    n: '۰۵',
    title: 'فعال‌سازی شرکت Trading',
    desc: 'آخرین شرکت، چون بیشترین ریسک مالی و نیازمند کنترل‌های مستقل است.',
  },
  {
    n: '۰۶',
    title: 'استخدام خودکار و خودگردانی',
    desc: 'سازمان خودش نیرو استخدام، ارزیابی و جایگزین می‌کند؛ انسان در حلقه تأیید می‌ماند.',
  },
]

export const walletSecurity = [
  {
    title: 'کلید خصوصی جدا از Agentها',
    desc: 'هیچ Agentی کلید ندارد. امضا در یک سرویس مستقل و سخت‌افزاری انجام می‌شود و فقط با تأیید سیاست‌ها.',
    icon: 'KeyRound',
  },
  {
    title: 'تأیید چندمرحله‌ای',
    desc: 'برداشت‌های بالاتر از آستانه، نیازمند تأیید مالی، ریسک و در نهایت تأیید انسانی هستند.',
    icon: 'ShieldCheck',
  },
  {
    title: 'سقف برداشت',
    desc: 'سقف روزانه و به تفکیک شرکت، با کاهش خودکار در صورت رفتار غیرعادی.',
    icon: 'Gauge',
  },
  {
    title: 'توقف اضطراری',
    desc: 'یک کلید توقف، همه برداشت‌ها را متوقف می‌کند؛ مستقل از Agentهای معاملاتی.',
    icon: 'OctagonX',
  },
]

export const finalHierarchy = [
  { level: 'Holding CEO', fa: 'مدیرعامل هلدینگ', note: 'تصمیم نهایی، سرمایه و ریسک' },
  { level: 'Company CEOs', fa: 'مدیرانعامل سه شرکت', note: 'Trading · Development · Marketing' },
  { level: 'Executive Managers', fa: 'مدیران ارشد', note: 'CFO، CTO، CIO و هم‌تایان' },
  { level: 'Department Managers', fa: 'مدیران دپارتمان', note: 'مالک یک قابلیت مشخص' },
  { level: 'Team Leaders', fa: 'رهبران تیم', note: 'هماهنگی گروهی از Agentها' },
  { level: 'Worker Agents', fa: 'Agentهای کارگر', note: 'اجرای تخصصی و قابل جایگزینی' },
]
