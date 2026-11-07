"use strict";
const { randomUUID } = require("node:crypto");
const { MODELS } = require("./dahl.cjs");
const AGENTS = Object.freeze([
  {
    id: "planner",
    name: "معمار",
    model: MODELS[0],
    role: "برنامه‌ریزی و تحلیل",
    letter: "G",
  },
  {
    id: "builder",
    name: "سازنده",
    model: MODELS[1],
    role: "اجرای ابزارها و توسعه",
    letter: "D",
  },
  {
    id: "reviewer",
    name: "بازبین",
    model: MODELS[2],
    role: "بازبینی نتیجه و شواهد",
    letter: "M",
  },
]);
const PLAN_TOOL = {
  type: "function",
  function: {
    name: "mission_plan",
    description:
      "Report or update the mission plan before multi-step work. Step status is YOUR report, never proof of execution or successful tests. Keep at most one step active. Real tool results are tracked separately.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string", maxLength: 140 },
              status: { type: "string", enum: ["pending", "active", "done"] },
            },
            required: ["title", "status"],
          },
        },
      },
      required: ["steps"],
    },
  },
};
function createMission() {
  return {
    startedAt: null,
    finishedAt: null,
    phase: "idle",
    currentTool: null,
    plan: [],
    runs: [],
    artifacts: [],
    agents: AGENTS.map((agent) => ({ ...agent, status: "idle", calls: 0 })),
  };
}
function updatePlan(mission, args, clean = (text) => text) {
  if (
    !args ||
    Object.keys(args).some((key) => key !== "steps") ||
    !Array.isArray(args.steps) ||
    !args.steps.length ||
    args.steps.length > 8
  )
    throw new Error("برنامه باید ۱ تا ۸ گام داشته باشد.");
  const steps = args.steps.map((step, index) => {
    if (
      !step ||
      Object.keys(step).some((key) => !["title", "status"].includes(key)) ||
      typeof step.title !== "string" ||
      !step.title.trim() ||
      step.title.length > 140 ||
      !["pending", "active", "done"].includes(step.status)
    )
      throw new Error("عنوان و وضعیت گام برنامه نامعتبر است.");
    return {
      id: "step-" + index,
      title: clean(step.title.trim()),
      status: step.status,
    };
  });
  if (steps.filter((step) => step.status === "active").length > 1)
    throw new Error("این اجرا ترتیبی است؛ فقط یک گام فعال تعیین کنید.");
  mission.plan = steps;
  return {
    plan: steps,
    evidence:
      "Model-reported plan, not verification. Inspect actual tool results.",
  };
}
function startRun(mission, name, args, clean) {
  const run = {
    id: randomUUID(),
    name,
    input: clean(JSON.stringify(args)).slice(0, 12000),
    status: "running",
    startedAt: Date.now(),
    finishedAt: null,
    output: "",
  };
  mission.runs.push(run);
  mission.runs = mission.runs.slice(-80);
  mission.currentTool = name;
  mission.phase = name === "mission_plan" ? "planning" : "executing";
  return run;
}
function finishRun(mission, run, result, content, project) {
  run.finishedAt = Date.now();
  run.output = content;
  run.status =
    result?.withheld || result?.actionRequired
      ? "blocked"
      : result?.success === false ||
          result?.error ||
          (typeof result?.exitCode === "number" && result.exitCode !== 0)
        ? "error"
        : "returned";
  mission.currentTool = null;
  if (
    run.name === "files_write" &&
    run.status === "returned" &&
    typeof result?.written === "string"
  ) {
    const artifact = {
      path: result.written,
      bytes: result.bytes,
      at: run.finishedAt,
      project,
    };
    mission.artifacts = [
      ...mission.artifacts.filter((item) => item.path !== artifact.path),
      artifact,
    ].slice(-40);
  }
}
module.exports = {
  AGENTS,
  PLAN_TOOL,
  createMission,
  updatePlan,
  startRun,
  finishRun,
};
