"use strict";
// User-initiated local inspection only. These reads are NOT sent to a model.
class ProjectView {
  constructor({ workspace, clean = (text) => text }) {
    this.workspace = workspace;
    this.clean = clean;
  }
  handle(action, payload) {
    const workspace = this.workspace();
    if (!workspace.root) throw new Error("ابتدا پوشهٔ پروژه را انتخاب کنید.");
    if (
      !payload ||
      typeof payload.path !== "string" ||
      payload.path.length > 2000 ||
      Object.keys(payload).some((key) => key !== "path")
    )
      throw new Error("مسیر نسبی پروژه لازم است.");
    if (action === "project-list")
      return {
        project: workspace.root,
        path: payload.path,
        entries: workspace.list(payload.path),
      };
    if (action === "project-read")
      return {
        project: workspace.root,
        path: payload.path,
        text: this.clean(workspace.read(payload.path)),
      };
    throw new Error("عمل بررسی پروژه مجاز نیست.");
  }
}
module.exports = { ProjectView };
