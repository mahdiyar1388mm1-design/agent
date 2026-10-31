import { a, s, type RawBranch } from './types'

export const intercompany: RawBranch = {
  key: 'intercompany',
  name: 'Intercompany',
  fa: 'ستاد همکاری سه شرکت',
  desc: 'لایه‌ای که سه شرکت را به یک سازمان تبدیل می‌کند: درخواست، صورت‌حساب، تسهیم درآمد و دانش مشترک.',
  kind: 'bridge',
  sections: [
    s(
      'Coordination',
      'هماهنگی و ارتباط',
      [
        a('Intercompany Coordinator', 'هماهنگ‌کننده سه شرکت', 'نقطه واحد هماهنگی میان سه CEO'),
        a('Corporate Communication Agent', 'ارتباط مدیران', 'کانال رسمی پیام‌های بین‌شرکتی'),
        a('Cross-Company Project Manager', 'مدیریت پروژه‌های مشترک', 'پروژه‌هایی که بدون سه شرکت کامل نمی‌شوند'),
        a('Strategic Collaboration Agent', 'شناسایی همکاری‌ها', 'کشف هم‌افزایی و همکاری راهبردی'),
        a('Conflict Resolution Agent', 'حل اختلافات عملیاتی', 'داوری و رفع تعارض منابع و اولویت‌ها'),
      ],
      'هماهنگی روزمره و حل تعارض میان سه شرکت.',
      'هماهنگی',
    ),
    s(
      'Shared Services',
      'خدمات و منابع مشترک',
      [
        a('Shared Intelligence Agent', 'اشتراک اطلاعات', 'جریان دانش و سیگنال بین شرکت‌ها'),
        a('Shared Resource Manager', 'مدیریت منابع مشترک', 'تخصیص GPU، داده و تیم مشترک'),
        a('Internal Request Manager', 'درخواست خدمات بین‌شرکتی', 'SLA و صف درخواست‌های داخلی'),
        a('Corporate Knowledge Manager', 'مدیریت دانش سازمانی', 'حافظه سازمانی و درس‌آموخته‌ها'),
      ],
      'منابع و دانش مشترک، بدون ساخت دوباره در هر شرکت.',
      'منابع',
    ),
    s(
      'Internal Economy',
      'اقتصاد داخلی و گزارش',
      [
        a('Internal Billing Agent', 'محاسبه هزینه خدمات داخلی', 'قیمت‌گذاری انتقالی خدمات'),
        a('Revenue Sharing Agent', 'محاسبه سهم درآمد', 'تسهیم درآمد پروژه‌های مشترک'),
        a('Central Reporting Agent', 'گزارش یکپارچه', 'تصویر واحد عملکرد سه شرکت'),
      ],
      'پول و گزارش درون سازمان، شفاف و قابل حسابرسی.',
      'اقتصاد داخلی',
    ),
  ],
}

export const treasury: RawBranch = {
  key: 'treasury',
  name: 'Treasury & Wallet',
  fa: 'خزانه مرکزی و کیف پول',
  desc: 'یک سیستم مالی مستقل و قابل حسابرسی که هر سه شرکت را به کیف پول مرکزی متصل می‌کند.',
  kind: 'money',
  sections: [
    s(
      'Wallet Operations',
      'عملیات کیف پول',
      [
        a('Master Wallet Controller', 'کنترلر کیف پول اصلی', 'بدون دسترسی مستقیم به کلید خصوصی'),
        a('Wallet Monitoring Agent', 'پایش کیف پول', 'رصد موجودی و تراکنش‌های غیرعادی'),
        a('Multi-Wallet Manager', 'مدیریت چند کیف پول', 'کیف پول‌های عملیاتی و سرد'),
        a('Deposit Monitoring Agent', 'پایش واریز', 'تشخیص واریز و انتساب آن به شرکت'),
        a('Withdrawal Request Agent', 'درخواست برداشت', 'ثبت درخواست با سقف و تأییدیه'),
        a('Transaction Verification Agent', 'تأیید تراکنش', 'بررسی پیش و پس از امضا'),
        a('Blockchain Monitoring Agent', 'پایش بلاکچین', 'رصد شبکه، تأییدیه‌ها و ری‌اورگ'),
      ],
      'هفت Agent عملیاتی؛ همگی بدون حق دسترسی به کلید.',
      'کیف پول',
    ),
    s(
      'Treasury Controls',
      'کنترل و امنیت مالی',
      [
        a('Gas Fee Optimization Agent', 'بهینه‌سازی کارمزد', 'انتخاب زمان و مسیر ارزان‌تر'),
        a('Payment Processing Agent', 'پردازش پرداخت', 'پرداخت‌های عملیاتی و حقوق'),
        a('Internal Transfer Agent', 'انتقال داخلی', 'جابه‌جایی بین شرکت‌ها با سند'),
        a('Financial Reconciliation Agent', 'تطبیق مالی', 'تطبیق بانک، کیف پول و دفتر'),
        a('Spending Limit Controller', 'کنترل سقف هزینه', 'اعمال سقف روزانه و به تفکیک شرکت'),
        a('Financial Fraud Detection Agent', 'کشف تقلب مالی', 'الگوی غیرعادی و توقف خودکار'),
        a('Wallet Security Auditor', 'حسابرسی امنیت کیف پول', 'بررسی ممیزی و دسترسی‌ها'),
      ],
      'کنترل‌های مالی، سقف‌ها و دفاع در برابر تقلب.',
      'کنترل',
    ),
    s(
      'Treasury & Reporting',
      'خزانه و گزارش‌گری',
      [
        a('Treasury Management Agent', 'مدیریت خزانه', 'نقدینگی و برنامه سرمایه'),
        a('Profit Distribution Agent', 'توزیع سود', 'تقسیم سود بین شرکت‌ها و سهامداران'),
        a('Budget Allocation Agent', 'تخصیص بودجه', 'بودجه بر اساس اولویت استراتژیک'),
        a('Transaction Reporting Agent', 'گزارش تراکنش‌ها', 'گزارش قابل حسابرسی برای هیئت‌مدیره'),
      ],
      'تصمیم سرمایه و گزارش شفاف برای حاکمیت.',
      'خزانه',
    ),
  ],
}

export const infrastructure: RawBranch = {
  key: 'infrastructure',
  name: 'Core Infrastructure',
  fa: 'زیرساخت فنی مرکزی',
  desc: 'پانزده سامانه مشترک که اجرای واقعی سازمان را ممکن می‌کند: ارکستراسیون، حافظه، هویت، پایش و تأیید انسانی.',
  kind: 'infra',
  sections: [
    s(
      'Orchestration & Data',
      'ارکستراسیون و داده',
      [
        a('Agent Orchestrator', 'ارکستراسیون Agentها', 'هماهنگی و اجرای Agentها'),
        a('Message Broker', 'کارگزار پیام', 'ارتباط بین Agentها'),
        a('Workflow Engine', 'موتور گردش کار', 'اجرای فرآیندهای چندمرحله‌ای'),
        a('Task Queue', 'صف وظایف', 'توزیع بار و اولویت‌دهی وظایف'),
        a('Central Database', 'دیتابیس مرکزی', 'اطلاعات مشترک سازمان'),
        a('Vector Database', 'دیتابیس برداری', 'حافظه معنایی'),
        a('Agent Memory Service', 'سرویس حافظه Agent', 'حافظه اختصاصی هر Agent'),
      ],
      'ستون فقرات اجرا و حافظه.',
      'اجرا',
    ),
    s(
      'Identity, Security & Gates',
      'هویت، امنیت و دروازه‌ها',
      [
        a('API Gateway', 'دروازه API', 'ارتباط با سرویس‌ها'),
        a('Identity & Access Management', 'هویت و مجوزها', 'هویت و مجوزها'),
        a('Secrets Manager', 'مدیر رازها', 'نگهداری امن کلیدها'),
        a('Human Approval System', 'تأیید انسانی', 'تأیید اقدامات حساس'),
        a('Cost Tracking', 'ردیابی هزینه', 'محاسبه هزینه مدل‌ها'),
        a('Evaluation Engine', 'موتور ارزیابی', 'ارزیابی کیفیت خروجی'),
      ],
      'هر اقدام حساس از یک دروازه امنیتی عبور می‌کند.',
      'امنیت',
    ),
    s(
      'Observability',
      'پایش و ثبت',
      [
        a('Monitoring System', 'سامانه پایش', 'نظارت بر فعالیت‌ها'),
        a('Logging System', 'سامانه ثبت رویداد', 'ثبت رویدادها برای حسابرسی'),
      ],
      'دیدن، ثبت کردن و اثبات‌پذیر کردن هر اتفاق.',
      'پایش',
    ),
  ],
}
