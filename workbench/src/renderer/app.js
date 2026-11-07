"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const bridge = window.orbit;
  const MODELS = [
    "zai-org/GLM-5.3-Flash",
    "deepseek-ai/DeepSeek-V4-Flash-0731",
    "MiniMaxAI/MiniMax-M2.7",
  ];
  const AGENTS = [
    {
      id: "planner",
      name: "معمار",
      letter: "G",
      model: MODELS[0],
      short: "GLM 5.3 Flash",
      color: "violet",
      description:
        "درخواست را باز می‌کند، محیط را می‌سنجد و مسیر قابل‌اجرا پیشنهاد می‌دهد. شروع مأموریت تیم با این نقش است.",
      tags: ["برنامه‌ریزی", "تحلیل پروژه", "مشورت با Arena"],
    },
    {
      id: "builder",
      name: "سازنده",
      letter: "D",
      model: MODELS[1],
      short: "DeepSeek V4 Flash",
      color: "blue",
      description:
        "با فایل، PowerShell، مرورگر و GitHub کار را جلو می‌برد. نتیجهٔ ابزار، جدا از ادعای مدل ثبت می‌شود.",
      tags: ["توسعهٔ نرم‌افزار", "ابزارها", "رفع خطا"],
    },
    {
      id: "reviewer",
      name: "بازبین",
      letter: "M",
      model: MODELS[2],
      short: "MiniMax M2.7",
      color: "lime",
      description:
        "نتیجه را با درخواست اصلی و شواهد ابزارها مقایسه می‌کند. بازبینیِ مدل، جای اجرای تست واقعی نیست.",
      tags: ["بازبینی", "کنترل شواهد", "گزارش نهایی"],
    },
  ];
  const TEMPLATES = [
    {
      title: "یک وب‌سایت بساز",
      detail: "از ایده تا فایل‌های پروژه",
      icon: "code",
      color: "violet",
      prompt:
        "برای پروژهٔ انتخاب‌شده یک وب‌سایت حرفه‌ای بساز. ابتدا فایل‌ها را بررسی کن، با Arena دربارهٔ طراحی مشورت کن، برنامه‌ات را ثبت کن و بعد تغییرات واقعی را بنویس. تست‌های موجود را اجرا کن و دقیق بگو چه چیزی تأیید شده و چه چیزی باقی مانده است.",
    },
    {
      title: "پروژه‌ام را بهتر کن",
      detail: "بررسی، رفع خطا و آزمایش",
      icon: "terminal",
      color: "blue",
      prompt:
        "پروژهٔ انتخاب‌شده را بخوان، با کمک Arena مهم‌ترین مشکل قابل‌حل را پیدا کن و یک اصلاح کوچک و قابل‌آزمون انجام بده. قبل از تغییر، برنامه را ثبت کن و بعد فقط نتایج تست‌های واقعاً اجراشده را گزارش کن.",
    },
    {
      title: "با Arena تحقیق کن",
      detail: "پژوهش با منبع قابل بررسی",
      icon: "globe",
      color: "lime",
      prompt:
        "می‌خواهم دربارهٔ موضوعی تحقیق کنیم. ابتدا موضوع و خروجی موردنیاز را از من بپرس؛ سپس از Arena و مرورگر برای جمع‌آوری شواهد قابل‌بررسی کمک بگیر و گزارش Markdown را در پروژه بنویس. منبع نامطمئن یا نتیجهٔ حدسی را مشخص کن.",
    },
    {
      title: "از GitHub ادامه بده",
      detail: "مخزن مشخص، تغییر قابل پیگیری",
      icon: "github",
      color: "neutral",
      prompt:
        "می‌خواهم کار یک مخزن GitHub را ادامه بدهم. ابتدا آدرس مخزن و شاخهٔ دقیق را از من بپرس. نسخهٔ محلی را بررسی کن، بدون force/reset کار کن و قبل از انتشار پیش‌نمایش و تأیید بگیر. اتصال مخزن در Arena را با اتصال محلی اشتباه نگیر.",
    },
  ];
  const blank = {
    version: "0.2.0",
    platform: "",
    keys: { count: 0, encryption: false },
    pool: {},
    project: null,
    browser: {},
    extensions: [],
    github: null,
    engine: {
      status: "idle",
      busy: false,
      id: null,
      revision: 0,
      tokens: 0,
      messages: [],
      activities: [],
      history: [],
    },
  };
  const statusText = {
    idle: "آمادهٔ مأموریت بعدی",
    starting: "در انتظار مجوز همین مأموریت…",
    running: "تیم در حال پیش‌بردن مأموریت است",
    stopping: "ادامه لغو شد؛ در حال توقف ابزارها…",
    completed: "پاسخ آماده است؛ شواهد را بررسی کن",
    error: "مأموریت نیاز به بررسی دارد",
    stopped: "مأموریت متوقف شد",
  };
  const phases = {
    idle: "آماده",
    permission: "در انتظار مجوز",
    planning: "برنامه‌ریزی",
    thinking: "در حال پاسخ",
    executing: "کار با ابزارها",
    reviewing: "بازبینی شواهد",
    completed: "پاسخ آماده",
    error: "نیاز به بررسی",
    stopped: "متوقف‌شده",
  };
  const runLabels = {
    awaiting: "منتظر مجوز",
    running: "در حال اجرا",
    returned: "پاسخ ابزار",
    error: "خطای ابزار",
    blocked: "نیاز به اقدام",
    interrupted: "نتیجه نامشخص",
    denied: "آغاز نشد",
  };
  let state = blank;
  let view = "home";
  let mode = "work";
  let inspectorTab = "plan";
  let pending = 0;
  let revision = -1;
  let toastTimer;
  let lastFocus;
  let drawerFocus;
  let renderedMessages = "";
  let currentProject = null;
  let folder = ".";
  let entries = [];
  let selectedFile = null;
  let fileText = "";
  let listEpoch = 0;
  let readEpoch = 0;
  let listLoading = false;
  let commandIndex = 0;
  let visibleCommands = [];
  const expandedRuns = new Set();
  const e = () => state.engine || blank.engine;
  const mission = () =>
    e().mission || {
      plan: [],
      runs: [],
      artifacts: [],
      agents: AGENTS.map((agent) => ({ ...agent, status: "idle", calls: 0 })),
      phase: "idle",
    };
  const busy = () => Boolean(e().busy || state.setupBusy || state.github?.busy);
  const locked = () => busy() || pending > 0;
  const fa = (number) => Number(number || 0).toLocaleString("fa-IR");
  const base = (value) =>
    String(value || "")
      .split(/[\\/]/)
      .filter(Boolean)
      .at(-1) || "بدون پروژه";
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(svg.namespaceURI, "use");
    use.setAttribute("href", "#i-" + name);
    svg.append(use);
    return svg;
  }
  function button(cls, text, action, symbol) {
    const node = el("button", cls);
    if (symbol) node.append(icon(symbol));
    if (text) node.append(document.createTextNode(text));
    node.addEventListener("click", action);
    return node;
  }
  function empty(parent, text) {
    parent.append(el("div", "empty-state", text));
  }
  function toast(text) {
    $("toast").textContent = String(text);
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      $("toast").hidden = true;
    }, 6500);
  }
  async function perform(action, payload) {
    if (!bridge) {
      toast(
        "این فقط پیش‌نمایش محیط است؛ ابزار واقعی و ورود کلید در نسخهٔ Windows فعال می‌شود.",
      );
      return;
    }
    const blocking = ![
      "stop",
      "github-device",
      "project-list",
      "project-read",
      "project-open",
      "copy-text",
    ].includes(action);
    if (blocking) pending += 1;
    renderControls();
    try {
      const result = await bridge.perform(action, payload);
      if (result?.engine) update(result);
      return result;
    } catch (error) {
      toast(error.message || "عمل انجام نشد.");
    } finally {
      if (blocking) pending -= 1;
      renderControls();
    }
  }
  function update(value) {
    if (!value || (value.engine?.revision ?? 0) < revision) return;
    state = {
      ...blank,
      ...value,
      engine: { ...blank.engine, ...value.engine },
    };
    revision = value.engine?.revision ?? 0;
    if (currentProject !== state.project) {
      currentProject = state.project;
      folder = ".";
      entries = [];
      selectedFile = null;
      fileText = "";
      listEpoch += 1;
      readEpoch += 1;
      renderFileList();
      renderFileContent();
      if (view === "workspace" && state.project) void loadFolder(".");
    }
    render();
  }
  const views = {
    home: "اتاق فرمان",
    missions: "مأموریت‌ها",
    agents: "تیم عامل‌ها",
    workspace: "فایل‌های پروژه",
    tools: "ابزارها و افزونه‌ها",
    mission: "گفتگوی مأموریت",
  };
  function setView(next) {
    if (!Object.hasOwn(views, next)) return;
    const changed = view !== next;
    view = next;
    document.querySelectorAll("[data-page]").forEach((node) => {
      node.hidden = node.dataset.page !== view;
    });
    document.querySelectorAll(".nav-item[data-view]").forEach((node) => {
      const active =
        node.dataset.view === view ||
        (view === "mission" && node.dataset.view === "missions");
      node.classList.toggle("active", active);
      if (active) node.setAttribute("aria-current", "page");
      else node.removeAttribute("aria-current");
    });
    $("view-title").textContent = views[view];
    if (changed) $("stage").scrollTop = 0;
    if (view === "workspace" && changed && state.project)
      void loadFolder(folder);
    renderMissionRibbon();
  }
  function openPanel(panel) {
    if (panel === "activity") {
      showInspector($("activity-panel").hidden);
      return;
    }
    if (panel === "home") {
      closeDrawer();
      return;
    }
    if (
      !["settings", "browser", "github", "extensions", "help"].includes(panel)
    )
      return;
    drawerFocus = document.activeElement;
    closePalette(false);
    $("drawer").hidden = false;
    $("drawer-backdrop").hidden = false;
    document.querySelectorAll("[data-drawer]").forEach((node) => {
      node.hidden = node.dataset.drawer !== panel;
    });
    $("drawer-title").textContent = {
      settings: "تنظیمات امن",
      browser: "Arena و مرورگر",
      github: "اتصال GitHub",
      extensions: "Skills & Plugins",
      help: "راهنمای اتاق فرمان",
    }[panel];
    $("close-drawer").focus();
  }
  function closeDrawer() {
    $("drawer").hidden = true;
    $("drawer-backdrop").hidden = true;
    $("api-keys").value = "";
    drawerFocus?.focus?.();
  }
  function showInspector(show = true, tab) {
    $("activity-panel").hidden = !show;
    $("workspace-shell").classList.toggle("inspecting", show);
    $("activity-toggle").setAttribute("aria-expanded", String(show));
    if (tab) inspectorTab = tab;
    document.querySelectorAll("[data-inspector]").forEach((node) => {
      const active = node.dataset.inspector === inspectorTab;
      node.classList.toggle("active", active);
      node.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-inspector-page]").forEach((node) => {
      node.hidden = node.dataset.inspectorPage !== inspectorTab;
    });
    renderInspector();
  }
  function focusTask() {
    setView("mission");
    $("task").focus();
  }
  function useTemplate(template) {
    $("task").value = template.prompt;
    mode = "work";
    $("model").value = "team";
    renderControls();
    focusTask();
  }
  function selectAgent(model) {
    if (locked()) {
      toast("ابتدا مأموریت جاری را متوقف یا تمام کن.");
      return;
    }
    $("model").value = model;
    mode = "work";
    renderControls();
    focusTask();
  }
  async function newTask() {
    const result = await perform("new");
    if (result) {
      $("task").value = "";
      expandedRuns.clear();
      renderedMessages = "";
      setView("mission");
      $("task").focus();
      renderControls();
    }
  }
  async function openTask(task) {
    if (task.project !== undefined && task.project !== state.project) {
      toast(
        "این گفتگو متعلق به پروژهٔ دیگری است؛ ابتدا همان پوشه را انتخاب کن.",
      );
      return;
    }
    const result = await perform("open-task", { id: task.id });
    if (result) setView("mission");
  }
  function renderControls() {
    const blocked = locked();
    for (const id of [
      "choose-project",
      "attach-project",
      "new-task",
      "model",
      "save-keys",
      "reset-keys",
      "browser-login",
      "browser-close",
      "github-check",
      "github-login",
      "install-extension",
    ])
      $(id).disabled = Boolean(
        blocked ||
          (!bridge &&
            [
              "save-keys",
              "reset-keys",
              "browser-login",
              "browser-close",
              "github-check",
              "github-login",
              "install-extension",
            ].includes(id)),
      );
    document.querySelectorAll("[data-idle], [data-new]").forEach((node) => {
      node.disabled = blocked;
    });
    $("send").disabled = blocked || !$("task").value.trim();
    $("stop").hidden = !busy();
    $("stop").disabled = false;
    $("remember").disabled = !bridge || !state.keys?.encryption;
    if (!state.keys?.encryption) $("remember").checked = false;
    $("api-keys").disabled = !bridge;
    $("project-refresh").disabled = !bridge || !state.project;
    $("project-explorer").disabled = !bridge || !state.project;
    $("folder-up").disabled = !bridge || !state.project || folder === ".";
    $("copy-file").disabled = !selectedFile || !bridge;
    $("select-team").disabled = blocked;
    document.querySelectorAll("[data-mode]").forEach((node) => {
      node.classList.toggle("active", node.dataset.mode === mode);
      node.disabled = blocked;
    });
    $("permission-label").replaceChildren(
      icon("shield"),
      document.createTextNode(
        mode === "work" ? "مجوز برای همین مأموریت" : "گفتگو، بدون اجرای ابزار",
      ),
    );
    $("job-status-text").textContent = state.setupBusy
      ? "در حال آماده‌سازی اتصال…"
      : state.github?.busy && !e().busy
        ? "در حال عملیات GitHub…"
        : statusText[e().status] || e().status;
    $("job-status").classList.toggle("running", Boolean(e().busy));
    $("char-count").textContent =
      $("task").value.length > 1000
        ? fa($("task").value.length) + "/۱۲٬۰۰۰"
        : "Enter ↵";
  }
  function renderConnections() {
    $("project-name").textContent = state.project
      ? base(state.project)
      : "انتخاب پوشهٔ پروژه";
    $("project-name").title = state.project || "";
    $("project-subtitle").textContent = state.project
      ? "پوشهٔ محلی انتخاب‌شده"
      : "فایل‌ها روی سیستم خودت می‌مانند";
    $("breadcrumb").textContent = state.project
      ? base(state.project)
      : "فضای کار شخصی";
    $("version").textContent = "Orbit Agent · " + state.version;
    $("model-connection").textContent = state.keys?.count
      ? fa(state.keys.count) + " کلید مدل تنظیم شده"
      : "مدل‌ها تنظیم نشده‌اند";
    $("model-light").classList.toggle("configured", Boolean(state.keys?.count));
    $("runtime-badge").classList.toggle("preview", !bridge);
    $("runtime-badge").lastElementChild.textContent = bridge
      ? state.platform === "win32"
        ? "WINDOWS / LOCAL"
        : "NATIVE / LOCAL"
      : "UI PREVIEW";
    $("extension-count").textContent = fa(state.extensions?.length);
    $("chrome-dot").classList.toggle("ready", Boolean(state.browser?.running));
    $("github-dot").classList.toggle("ready", Boolean(state.github?.account));
    $("keys-status").textContent =
      `${fa(state.keys?.count)} کلید ثبت‌شده · ${state.keys?.remembered ? "نگهداری رمز‌شده" : "فقط حافظهٔ همین اجرا"}\nکلید فعال: ${state.pool?.active ? fa(state.pool.active) : "—"} · پایان سهمیه: ${fa(state.pool?.exhausted)}\nوجود کلید، تأیید مجوز یا سهمیهٔ زندهٔ حساب نیست.`;
    $("usage").textContent = e().tokens
      ? fa(e().tokens) + " توکن گزارش‌شدهٔ سرویس"
      : "کنترل نهایی، همیشه با توست.";
    $("browser-status").textContent =
      `${state.browser?.available ? "Chrome نصب‌شده پیدا شده است." : "Chrome باید روی Windows نصب باشد."}\n${state.browser?.running ? (state.browser.manual ? "پنجرهٔ ورود دستی باز است؛ وضعیت ورود حساب تضمین نشده." : "مرورگر عامل در پس‌زمینه باز است.") : "مرورگر عامل بسته است."}${state.warning ? "\n" + state.warning : ""}`;
    $("github-status").textContent = state.github
      ? `${state.github.account ? "حساب: " + state.github.account : "حساب بررسی/تأیید نشده"}\n${state.github.message || ""}`
      : "اتصال محلی هنوز بررسی نشده است.";
    $("device-box").hidden = !state.github?.deviceCode;
    $("device-code").value = state.github?.deviceCode || "";
    $("github-device").disabled = !state.github?.deviceCode;
    const preview = $("publish-preview");
    preview.replaceChildren();
    if (state.github?.preview) {
      const p = state.github.preview;
      preview.append(
        el(
          "pre",
          "help",
          `${p.repository} · ${p.branch}\n${p.isPrivate ? "خصوصی" : "عمومی"}\n${(p.files || []).join("\n")}`,
        ),
      );
    }
    $("workspace-path").textContent =
      state.project || "یک پوشهٔ محلی انتخاب کن تا فایل‌های متنی آن را ببینی.";
  }
  function renderHome() {
    const m = mission();
    const history = e().history || [];
    const totals = history.reduce(
      (result, task) => ({
        tools:
          result.tools + (task.id === e().id ? m.runs.length : task.tools || 0),
        artifacts:
          result.artifacts +
          (task.id === e().id ? m.artifacts.length : task.artifacts || 0),
      }),
      { tools: 0, artifacts: 0 },
    );
    const metrics = $("metrics");
    metrics.replaceChildren();
    for (const [symbol, number, label] of [
      ["board", history.length, "مأموریت در فهرست"],
      [
        "agents",
        m.agents.filter((agent) => agent.status === "running").length,
        "عامل در حال پاسخ",
      ],
      ["activity", totals.tools, "درخواست ثبت‌شدهٔ ابزار"],
      ["file", totals.artifacts, "فایل ثبت‌شده با ابزار"],
    ]) {
      const tile = el("div", "metric");
      const mark = el("span", "metric-icon");
      mark.append(icon(symbol));
      const copy = el("div");
      copy.append(el("strong", "", fa(number)), el("small", "", label));
      tile.append(mark, copy);
      metrics.append(tile);
    }
    const readiness = [
      {
        name: "مدل‌های Dahl",
        detail: state.keys?.count
          ? "کلید تنظیم شده؛ سهمیه زنده تأیید نشده"
          : "اول کلید تازه را ثبت کن",
        done: Boolean(bridge && state.keys?.count),
        action: () => openPanel("settings"),
      },
      {
        name: "پوشهٔ پروژه",
        detail: state.project
          ? base(state.project)
          : "برای کار با فایل و ترمینال",
        done: Boolean(state.project),
        action: () => void perform("project-choose"),
      },
      {
        name: "Arena و Chrome",
        detail: state.browser?.running
          ? "مرورگر باز است؛ ورود را خودت بررسی کن"
          : "ورود دستی در مرورگر عامل",
        done: Boolean(state.browser?.running),
        action: () => openPanel("browser"),
      },
      {
        name: "حساب GitHub",
        detail: state.github?.account || "برای مخزن خصوصی و انتشار",
        done: Boolean(state.github?.account),
        action: () => openPanel("github"),
      },
    ];
    $("readiness-count").textContent =
      fa(readiness.filter((item) => item.done).length) + "/۴";
    const parent = $("readiness-list");
    parent.replaceChildren();
    readiness.forEach((item, index) => {
      const row = button("readiness-item", "", item.action);
      const mark = el(
        "span",
        "readiness-status" + (item.done ? " done" : ""),
        item.done ? undefined : fa(index + 1),
      );
      if (item.done) mark.append(icon("check"));
      const copy = el("span", "readiness-copy");
      copy.append(el("strong", "", item.name), el("small", "", item.detail));
      row.append(mark, copy, icon("chevron"));
      parent.append(row);
    });
  }
  function renderHistory() {
    const history = e().history || [];
    $("task-count").textContent = fa(history.length);
    const parent = $("history");
    parent.replaceChildren();
    if (!history.length)
      parent.append(
        el("p", "empty-history", "یک کار تازه، آغاز یک مسیر تازه."),
      );
    history.slice(0, 8).forEach((task) => {
      const row = button(
        "history-item" + (task.id === e().id ? " current" : ""),
        "",
        () => void openTask(task),
      );
      row.title = task.title;
      row.setAttribute("data-idle", "");
      row.disabled = locked();
      row.append(el("i"), el("span", "", task.title));
      parent.append(row);
    });
    renderBoard();
  }
  function renderBoard() {
    const query = $("mission-search").value.trim().toLocaleLowerCase();
    const history = (e().history || []).filter((task) =>
      task.title.toLocaleLowerCase().includes(query),
    );
    const board = $("mission-board");
    board.replaceChildren();
    for (const [title, states] of [
      ["در حال کار", ["running", "starting", "stopping"]],
      ["پاسخ آماده", ["completed"]],
      ["نیاز به توجه", ["error", "stopped"]],
    ]) {
      const list = history.filter((task) =>
        states.includes(
          task.id === e().id && e().busy ? "running" : task.status,
        ),
      );
      const column = el("section", "board-column");
      const header = el("header");
      header.append(
        el("i"),
        document.createTextNode(title),
        el("span", "", fa(list.length)),
      );
      column.append(header);
      if (!list.length)
        column.append(
          el(
            "div",
            "board-empty",
            query
              ? "نتیجه‌ای برای این جستجو نیست."
              : "هنوز مأموریتی در این بخش نیست.",
          ),
        );
      for (const task of list) {
        const card = button("mission-card", "", () => void openTask(task));
        card.setAttribute("data-idle", "");
        card.disabled = locked();
        const status = task.id === e().id ? e().status : task.status;
        card.append(
          el(
            "span",
            "card-status " + status,
            status === "completed"
              ? "پاسخ مدل آماده"
              : status === "error"
                ? "نیاز به بررسی"
                : status === "stopped"
                  ? "متوقف‌شده"
                  : "در جریان",
          ),
          el("h3", "", task.title),
        );
        const footer = el("div", "card-footer");
        footer.append(
          icon("folder"),
          el("span", "", base(task.project)),
          el(
            "span",
            "",
            `${fa(task.id === e().id ? mission().runs.length : task.tools)} درخواست ابزار`,
          ),
        );
        const arrow = icon("arrow");
        arrow.classList.add("mission-open-icon");
        footer.append(arrow);
        card.append(footer);
        column.append(card);
      }
      board.append(column);
    }
  }
  function agentStatus(agent) {
    return agent.status === "running"
      ? "در حال پاسخ"
      : agent.status === "returned"
        ? "پاسخ داده"
        : agent.status === "error"
          ? "خطا در درخواست"
          : agent.status === "stopped"
            ? "متوقف"
            : state.keys?.count
              ? "منتظر مأموریت"
              : "نیاز به تنظیم کلید";
  }
  function renderAgents() {
    const parent = $("agents-grid");
    parent.replaceChildren();
    AGENTS.forEach((agent) => {
      const live =
        mission().agents.find((item) => item.id === agent.id) || agent;
      const card = el("article", "agent-card");
      const header = el("div", "agent-card-head");
      const status = el("span", "agent-status " + (live.status || "idle"));
      status.append(el("i"), document.createTextNode(agentStatus(live)));
      header.append(
        el("span", "agent-emblem " + agent.color, agent.letter),
        status,
        el("h2", "", agent.name),
        el("div", "agent-model", agent.short),
      );
      const body = el("div", "agent-card-body");
      body.append(el("p", "", agent.description));
      const tags = el("div", "agent-skill-tags");
      agent.tags.forEach((tag) => tags.append(el("span", "", tag)));
      const choose = button("secondary", "انتخاب این عامل", () =>
        selectAgent(agent.model),
      );
      choose.setAttribute("data-idle", "");
      choose.disabled = locked();
      choose.append(icon("arrow"));
      body.append(tags, choose);
      card.append(header, body);
      parent.append(card);
    });
  }
  function renderTools() {
    const cards = [
      {
        title: "Arena & Chrome",
        icon: "globe",
        color: "blue",
        status: state.browser?.running
          ? "مرورگر باز است"
          : state.browser?.available
            ? "Chrome پیدا شده"
            : "نیاز به Chrome",
        configured: Boolean(state.browser?.running),
        text: "واگذاری درخواست به Arena و خواندن وب عمومی HTTPS در یک پروفایل جداگانه. ورود حساب و انتخاب مخزن دستی است.",
        action: "راه‌اندازی مرورگر",
        click: () => openPanel("browser"),
      },
      {
        title: "GitHub",
        icon: "github",
        color: "neutral",
        status: state.github?.account || "حساب تأیید نشده",
        configured: Boolean(state.github?.account),
        text: "دریافت مخزن، بررسی تغییرات و همگام‌سازی تمیز؛ انتشار فقط با پیش‌نمایش و تأیید بومی تو.",
        action: "مدیریت اتصال",
        click: () => openPanel("github"),
      },
      {
        title: "PowerShell",
        icon: "terminal",
        color: "violet",
        status:
          bridge && state.platform === "win32" && state.project
            ? "با مجوز مأموریت"
            : "نیاز به Windows و پوشه",
        text: "ترمینال واقعی سیستم، نه یک شبیه‌ساز. فرمان‌ها، خروجی و وضعیت برگشت در پشت صحنه ثبت می‌شوند.",
        action: "دیدن رویدادهای اجرا",
        click: () => showInspector(true, "trace"),
      },
      {
        title: "فایل‌های پروژه",
        icon: "folder",
        color: "lime",
        status: state.project ? "پوشه انتخاب شده" : "پروژه انتخاب نشده",
        configured: Boolean(state.project),
        text: "خواندن و نوشتن متن در پوشهٔ انتخابی؛ پیش‌نمایش محلی فایل‌ها و خروجی‌های تأییدشده، بدون اجرای کد.",
        action: "رفتن به پروژه",
        click: () => setView("workspace"),
      },
      {
        title: "Dahl Models",
        icon: "spark",
        color: "violet",
        status: state.keys?.count ? "کلید تنظیم شده" : "نیاز به کلید تازه",
        configured: Boolean(state.keys?.count),
        text: "سه مدل انتخاب‌شدهٔ تو با مدیریت کلید در main. تعویض کلید فقط برای پایان سهمیهٔ صریح است، نه هر خطا.",
        action: "تنظیمات امن مدل‌ها",
        click: () => openPanel("settings"),
      },
      {
        title: "Skills & MCP",
        icon: "tools",
        color: "blue",
        status: fa(state.extensions?.length) + " مورد نصب‌شده",
        configured: Boolean(state.extensions?.length),
        text: "Skill متنی برای روش کار، و Plugin استاندارد MCP stdio برای ابزارهای تازه؛ نصب فقط از منبع مورداعتماد.",
        action: "مدیریت افزونه‌ها",
        click: () => openPanel("extensions"),
      },
    ];
    const parent = $("tools-grid");
    parent.replaceChildren();
    cards.forEach((item) => {
      const card = el("article", "tool-card");
      const mark = el("span", "large-tool-icon " + item.color);
      mark.append(icon(item.icon));
      const action = button("text-button", item.action, item.click);
      action.append(icon("external"));
      card.append(
        mark,
        el(
          "span",
          "tool-status" + (item.configured ? " configured" : ""),
          item.status,
        ),
        el("h3", "", item.title),
        el("p", "", item.text),
        action,
      );
      parent.append(card);
    });
    const installed = $("installed-summary");
    const list = $("extensions-list");
    installed.replaceChildren();
    list.replaceChildren();
    if (!state.extensions?.length) {
      empty(
        installed,
        "ابزار بعدی را خودت انتخاب کن. هنوز Skill یا Plugin نصب نشده است.",
      );
      empty(
        list,
        "یک فایل Markdown/JSON یا manifest افزونهٔ مورداعتماد انتخاب کن.",
      );
    }
    for (const extension of state.extensions || []) {
      const chip = button("installed-chip", "", () => openPanel("extensions"));
      chip.append(
        icon("tools"),
        el("span", "", extension.name),
        el("small", "", extension.kind.toUpperCase()),
      );
      installed.append(chip);
      const row = el("div", "extension-item");
      const copy = el("span", "", extension.name);
      copy.append(
        el(
          "small",
          "",
          extension.kind === "mcp"
            ? "MCP STDIO · TRUSTED CODE"
            : "SKILL · TEXT INSTRUCTIONS",
        ),
      );
      const remove = button(
        "",
        "حذف",
        () => void perform("extension-remove", { id: extension.id }),
      );
      remove.setAttribute("data-idle", "");
      remove.disabled = locked();
      row.append(copy, remove);
      list.append(row);
    }
  }
  function renderMessages() {
    const messages = e().messages || [];
    const signature = JSON.stringify(messages);
    if (signature === renderedMessages) return;
    renderedMessages = signature;
    const parent = $("messages");
    parent.replaceChildren();
    $("chat-empty").hidden = messages.length > 0;
    for (const message of messages) {
      const box = el("article", "message " + message.role);
      if (message.role === "assistant") {
        const agent = AGENTS.find((item) => item.model === message.model);
        const label = el("span", "message-label");
        label.append(
          el(
            "span",
            "node-icon " + (agent?.color || "violet"),
            agent?.letter || "O",
          ),
          el(
            "span",
            "",
            agent ? agent.name + " / " + agent.short : message.model || "Orbit",
          ),
        );
        const copy = button(
          "icon-button",
          "",
          () => void copyText(message.content),
          "copy",
        );
        copy.title = "کپی پاسخ";
        label.append(copy);
        box.append(label);
      }
      box.append(document.createTextNode(message.content));
      parent.append(box);
    }
    if (view === "mission") $("stage").scrollTop = $("stage").scrollHeight;
  }
  function renderMissionRibbon() {
    const task = e().history?.find((item) => item.id === e().id);
    $("crumb-task").textContent = task?.title || "مأموریت تازه";
    const ribbon = $("mission-ribbon");
    ribbon.replaceChildren();
    const m = mission();
    const duration = m.startedAt
      ? Math.max(
          0,
          Math.floor(((m.finishedAt || Date.now()) - m.startedAt) / 1000),
        )
      : 0;
    const parts = [
      ["activity", phases[m.phase] || phases.idle, "phase-tag"],
      [
        "clock",
        fa(Math.floor(duration / 60)) +
          ":" +
          String(duration % 60).padStart(2, "0"),
        "",
      ],
      ["terminal", fa(m.runs.length) + " درخواست ابزار", ""],
      ["file", fa(m.artifacts.length) + " فایل ثبت‌شده", ""],
    ];
    parts.forEach(([symbol, text, cls]) => {
      const node = el("span", cls);
      node.append(icon(symbol), document.createTextNode(text));
      ribbon.append(node);
    });
  }
  function pretty(text) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return String(text || "");
    }
  }
  function renderInspector() {
    const m = mission();
    const live = $("live-agents");
    live.replaceChildren();
    AGENTS.forEach((agent) => {
      const status = m.agents.find((item) => item.id === agent.id) || agent;
      const node = el("div", "live-agent " + (status.status || "idle"));
      node.append(el("span", "node-icon " + agent.color, agent.letter));
      const copy = el("div");
      copy.append(
        el("strong", "", agent.name),
        el(
          "small",
          "",
          status.status === "running"
            ? "THINKING"
            : fa(status.calls || 0) + " نوبت",
        ),
      );
      node.append(copy);
      live.append(node);
    });
    const plan = $("plan-list");
    plan.replaceChildren();
    if (!m.plan.length)
      empty(
        plan,
        "هنوز برنامه‌ای از عامل نرسیده است. برای کار چندمرحله‌ای، عامل می‌تواند برنامه را با ابزار mission_plan ثبت کند.",
      );
    m.plan.forEach((step, index) => {
      const row = el("div", "plan-step " + step.status);
      const marker = el(
        "span",
        "step-marker",
        step.status === "done" ? undefined : fa(index + 1),
      );
      if (step.status === "done") marker.append(icon("check"));
      const copy = el("div");
      copy.append(
        el("strong", "", step.title),
        el(
          "small",
          "",
          step.status === "done"
            ? "عامل پایان این گام را گزارش کرده"
            : step.status === "active"
              ? "گام جاریِ گزارش‌شده"
              : "در برنامهٔ عامل",
        ),
      );
      row.append(marker, copy);
      plan.append(row);
    });
    const runs = $("tool-runs");
    runs.replaceChildren();
    if (!m.runs.length)
      empty(
        runs,
        "ابزاری فراخوانی نشده. اینجا فقط رویدادهای واقعی اجرای برنامه دیده می‌شوند.",
      );
    for (const run of [...m.runs].reverse()) {
      const detail = el("details", "tool-run " + run.status);
      detail.open =
        expandedRuns.has(run.id) ||
        run.status === "running" ||
        run.status === "awaiting";
      detail.addEventListener("toggle", () => {
        if (detail.open) expandedRuns.add(run.id);
        else expandedRuns.delete(run.id);
      });
      const summary = el("summary");
      summary.append(
        el("span", "run-dot"),
        el("span", "", run.name),
        el("small", "", runLabels[run.status] || run.status),
      );
      detail.append(
        summary,
        el("h4", "", "REQUEST"),
        el("pre", "", pretty(run.input)),
      );
      if (run.output) {
        detail.append(
          el("h4", "", "OBSERVED RESULT"),
          el("pre", "", pretty(run.output)),
        );
        const copy = button(
          "trace-copy",
          "کپی پاسخ ابزار",
          () => void copyText(pretty(run.output)),
        );
        detail.append(copy);
      }
      runs.append(detail);
    }
    const activities = $("activity-list");
    activities.replaceChildren();
    if (!e().activities?.length)
      empty(activities, "فعالیت مدل یا سرویس هنوز ثبت نشده است.");
    [...(e().activities || [])]
      .reverse()
      .filter((item) => !["tool", "result"].includes(item.type))
      .forEach((item) => {
        const node = el("div", "activity-item");
        node.append(
          el(
            "small",
            "",
            item.type.toUpperCase() +
              " · " +
              new Date(item.at).toLocaleTimeString("fa-IR", {
                hour: "2-digit",
                minute: "2-digit",
              }),
          ),
          document.createTextNode(item.message),
        );
        activities.append(node);
      });
    $("artifact-count").textContent = fa(m.artifacts.length);
    const artifacts = $("artifacts-list");
    artifacts.replaceChildren();
    if (!m.artifacts.length)
      empty(artifacts, "هنوز نوشتن فایلی توسط ابزار تأیید نشده است.");
    for (const artifact of [...m.artifacts].reverse()) {
      const row = button("artifact-card", "", () => {
        if (artifact.project !== state.project)
          return toast("ابتدا پوشهٔ همان پروژه را انتخاب کن.");
        setView("workspace");
        void readFile(artifact.path);
      });
      const copy = el("span");
      copy.append(
        el("strong", "", artifact.path),
        el("small", "", fa(artifact.bytes) + " بایت · نمایش فایل فعلی"),
      );
      row.append(icon("file"), copy);
      artifacts.append(row);
    }
  }
  function render() {
    renderControls();
    renderConnections();
    renderHome();
    renderHistory();
    renderAgents();
    renderTools();
    renderMessages();
    renderMissionRibbon();
    renderInspector();
  }
  async function copyText(text) {
    const value = String(text || "");
    const result = await perform("copy-text", { text: value.slice(0, 32000) });
    if (result?.copied)
      toast(
        value.length > 32000
          ? "۳۲٬۰۰۰ نویسهٔ اول کپی شد."
          : "متن در کلیپ‌بورد کپی شد.",
      );
  }
  async function loadFolder(path) {
    if (!state.project || !bridge) {
      entries = [];
      renderFileList();
      return;
    }
    const epoch = ++listEpoch;
    const root = state.project;
    listLoading = true;
    renderFileList();
    const result = await perform("project-list", { path });
    if (epoch !== listEpoch || root !== state.project) return;
    listLoading = false;
    if (result?.project === root) {
      folder = result.path;
      entries = result.entries;
    }
    renderFileList();
    renderControls();
  }
  async function readFile(path) {
    if (!state.project) return toast("ابتدا پوشهٔ پروژه را انتخاب کن.");
    const epoch = ++readEpoch;
    const root = state.project;
    const result = await perform("project-read", { path });
    if (
      epoch !== readEpoch ||
      root !== state.project ||
      result?.project !== root
    )
      return;
    selectedFile = result.path;
    fileText = result.text;
    renderFileList();
    renderFileContent();
    renderControls();
  }
  function renderFileList() {
    $("folder-path").textContent = folder === "." ? "/" : "/" + folder;
    const list = $("file-list");
    list.replaceChildren();
    if (!bridge || !state.project)
      return empty(
        list,
        bridge
          ? "ابتدا پوشهٔ پروژه را انتخاب کن."
          : "فایل‌های واقعی فقط در نسخهٔ Windows قابل بررسی‌اند.",
      );
    if (listLoading) return empty(list, "در حال خواندن پوشه…");
    if (!entries.length) return empty(list, "ورودی قابل نمایش پیدا نشد.");
    const sorted = [...entries].sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name)
        : a.kind === "folder"
          ? -1
          : 1,
    );
    sorted.forEach((item) => {
      const relative = folder === "." ? item.name : folder + "/" + item.name;
      const row = button(
        "file-item " +
          item.kind +
          (selectedFile === relative ? " selected" : ""),
        "",
        () => {
          if (item.kind === "folder") void loadFolder(relative);
          else void readFile(relative);
        },
      );
      row.append(
        icon(item.kind === "folder" ? "folder" : "file"),
        el("span", "", item.name),
      );
      row.title = item.name;
      list.append(row);
    });
  }
  function renderFileContent() {
    $("file-name").textContent = selectedFile || "بدون فایل انتخاب‌شده";
    $("file-content").textContent = fileText;
    $("file-content").hidden = !selectedFile;
    $("file-placeholder").hidden = Boolean(selectedFile);
  }
  const COMMANDS = [
    ...Object.entries(views)
      .filter(([id]) => id !== "mission")
      .map(([id, title]) => ({
        title,
        category: "رفتن به بخش",
        icon: {
          home: "grid",
          missions: "board",
          agents: "agents",
          workspace: "folder",
          tools: "tools",
        }[id],
        run: () => setView(id),
      })),
    {
      title: "مأموریت جدید",
      category: "Ctrl N",
      icon: "plus",
      run: () => void newTask(),
    },
    {
      title: "انتخاب پوشهٔ پروژه",
      category: "روی سیستم خودت",
      icon: "folder",
      run: () => void perform("project-choose"),
    },
    {
      title: "تنظیمات کلیدهای Dahl",
      category: "تنظیمات امن",
      icon: "key",
      run: () => openPanel("settings"),
    },
    {
      title: "ورود به Arena و Chrome",
      category: "اتصال مرورگر",
      icon: "globe",
      run: () => openPanel("browser"),
    },
    {
      title: "اتصال حساب GitHub",
      category: "مدیریت حساب",
      icon: "github",
      run: () => openPanel("github"),
    },
    {
      title: "نصب Skill یا افزونهٔ MCP",
      category: "افزونه‌های محلی",
      icon: "tools",
      run: () => openPanel("extensions"),
    },
    {
      title: "دیدن رویدادهای واقعی ابزارها",
      category: "پشت صحنه",
      icon: "activity",
      run: () => showInspector(true, "trace"),
    },
    {
      title: "راهنما و میان‌برها",
      category: "کمک",
      icon: "help",
      run: () => openPanel("help"),
    },
  ];
  function openPalette() {
    lastFocus = document.activeElement;
    $("drawer").hidden = true;
    $("drawer-backdrop").hidden = true;
    $("api-keys").value = "";
    $("palette-backdrop").hidden = false;
    $("command-palette").hidden = false;
    $("command-search").value = "";
    commandIndex = 0;
    renderCommands();
    $("command-search").focus();
  }
  function closePalette(restore = true) {
    $("command-palette").hidden = true;
    $("palette-backdrop").hidden = true;
    if (restore) lastFocus?.focus?.();
  }
  function renderCommands() {
    const query = $("command-search").value.trim().toLocaleLowerCase();
    visibleCommands = COMMANDS.filter((item) =>
      (item.title + " " + item.category).toLocaleLowerCase().includes(query),
    );
    commandIndex = Math.min(
      commandIndex,
      Math.max(0, visibleCommands.length - 1),
    );
    const parent = $("command-results");
    parent.replaceChildren();
    if (!visibleCommands.length) empty(parent, "فرمانی پیدا نشد.");
    visibleCommands.forEach((command, index) => {
      const row = button(
        "palette-result" + (index === commandIndex ? " selected" : ""),
        "",
        () => {
          closePalette(false);
          command.run();
        },
      );
      row.append(
        icon(command.icon),
        el("span", "", command.title),
        el("small", "", command.category),
      );
      parent.append(row);
    });
  }
  function trapFocus(event, panel) {
    if (event.key !== "Tab") return;
    const nodes = [
      ...panel.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ),
    ].filter((node) => !node.closest("[hidden]"));
    const first = nodes[0];
    const last = nodes.at(-1);
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  document
    .querySelectorAll("[data-view]")
    .forEach((node) =>
      node.addEventListener("click", () => setView(node.dataset.view)),
    );
  document
    .querySelectorAll("[data-panel]")
    .forEach((node) =>
      node.addEventListener("click", () => openPanel(node.dataset.panel)),
    );
  document
    .querySelectorAll("[data-action]")
    .forEach((node) =>
      node.addEventListener("click", () => void perform(node.dataset.action)),
    );
  document
    .querySelectorAll("[data-new]")
    .forEach((node) => node.addEventListener("click", () => void newTask()));
  document
    .querySelectorAll("[data-inspector]")
    .forEach((node) =>
      node.addEventListener("click", () =>
        showInspector(true, node.dataset.inspector),
      ),
    );
  document.querySelectorAll("[data-mode]").forEach((node) =>
    node.addEventListener("click", () => {
      if (locked()) return;
      mode = node.dataset.mode;
      renderControls();
    }),
  );
  $("hero-start").addEventListener("click", focusTask);
  $("select-team").addEventListener("click", () => selectAgent("team"));
  $("new-task").addEventListener("click", () => void newTask());
  $("stop").addEventListener("click", () => void perform("stop"));
  for (const id of ["choose-project", "attach-project"])
    $(id).addEventListener("click", () => void perform("project-choose"));
  $("activity-toggle").addEventListener("click", () =>
    showInspector($("activity-panel").hidden),
  );
  $("mission-details").addEventListener("click", () => showInspector(true));
  $("close-activity").addEventListener("click", () => showInspector(false));
  for (const id of ["close-drawer", "drawer-backdrop"])
    $(id).addEventListener("click", closeDrawer);
  $("save-keys").addEventListener("click", async () => {
    const keys = $("api-keys").value;
    $("api-keys").value = "";
    const result = await perform("keys-save", {
      keys,
      remember: $("remember").checked,
    });
    if (result) toast("کلیدها ثبت شدند؛ مقدارشان به رابط بازگردانده نمی‌شود.");
  });
  for (const id of [
    "reset-keys",
    "browser-login",
    "browser-close",
    "github-check",
    "github-login",
    "github-device",
    "install-extension",
  ])
    $(id).addEventListener(
      "click",
      () =>
        void perform(
          {
            "reset-keys": "keys-reset",
            "install-extension": "extension-install",
          }[id] || id,
        ),
    );
  $("project-refresh").addEventListener("click", () => {
    void loadFolder(folder);
    if (selectedFile) void readFile(selectedFile);
  });
  $("project-explorer").addEventListener(
    "click",
    () => void perform("project-open"),
  );
  $("folder-up").addEventListener("click", () => {
    const parts = folder.split("/");
    parts.pop();
    void loadFolder(parts.join("/") || ".");
  });
  $("copy-file").addEventListener("click", () => void copyText(fileText));
  $("mission-search").addEventListener("input", renderBoard);
  $("task").addEventListener("input", renderControls);
  $("task-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (locked() || !$("task").value.trim()) return;
    if (bridge && !state.keys?.count) {
      openPanel("settings");
      toast("برای درخواست واقعی، اول کلید تازهٔ Dahl را ثبت کن.");
      return;
    }
    const result = await perform("run", {
      task: $("task").value,
      model: $("model").value,
      mode,
    });
    if (result) {
      $("task").value = "";
      setView("mission");
      if (mode === "work") showInspector(true, "plan");
      renderControls();
    }
  });
  $("task").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      $("task-form").requestSubmit();
    }
  });
  $("command-open").addEventListener("click", openPalette);
  $("palette-backdrop").addEventListener("click", () => closePalette());
  $("command-search").addEventListener("input", () => {
    commandIndex = 0;
    renderCommands();
  });
  $("command-search").addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      commandIndex = visibleCommands.length
        ? (commandIndex +
            (event.key === "ArrowDown" ? 1 : -1) +
            visibleCommands.length) %
          visibleCommands.length
        : 0;
      renderCommands();
    }
    if (event.key === "Enter" && visibleCommands[commandIndex]) {
      event.preventDefault();
      const command = visibleCommands[commandIndex];
      closePalette(false);
      command.run();
    }
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if ($("command-palette").hidden) openPalette();
      else closePalette();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
      event.preventDefault();
      if (locked()) toast("ابتدا کار جاری را متوقف یا تمام کن.");
      else void newTask();
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "s"
    ) {
      event.preventDefault();
      void perform("stop");
    }
    if (event.key === "Escape") {
      if (!$("command-palette").hidden) closePalette();
      else if (!$("drawer").hidden) closeDrawer();
      else showInspector(false);
    }
    if (!$("command-palette").hidden) trapFocus(event, $("command-palette"));
    else if (!$("drawer").hidden) trapFocus(event, $("drawer"));
  });
  const templates = $("templates");
  TEMPLATES.forEach((template) => {
    const card = button("template-card", "", () => useTemplate(template));
    const mark = el("span", "template-icon " + template.color);
    mark.append(icon(template.icon));
    const copy = el("span");
    copy.append(
      el("strong", "", template.title),
      el("small", "", template.detail),
    );
    card.append(mark, copy, icon("arrow"));
    templates.append(card);
  });
  if (bridge) {
    bridge.onState(update);
    bridge
      .getState()
      .then(update)
      .catch((error) => toast(error.message));
  } else {
    $("demo-banner").hidden = false;
    $("api-keys").disabled = true;
    $("api-keys").placeholder = "کلید را در پیش‌نمایش وارد نکن؛ فقط داخل EXE";
  }
  setInterval(() => {
    if (view === "mission" && e().busy) renderMissionRibbon();
  }, 1000);
  render();
  renderFileList();
  renderFileContent();
  setView("home");
})();
