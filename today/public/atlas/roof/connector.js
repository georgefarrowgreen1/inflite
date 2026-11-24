export const connector = {
  app: "atlas", name: "Atlas", icon: "spark", href: "/atlas/",
  sections: [["conversations", "Conversations", "/atlas/#conversations"], ["tasks", "Tasks", "/atlas/#tasks"], ["environments", "Cloud environments", "/atlas/#environments"], ["briefs", "Briefs", "/atlas/#briefs"], ["settings", "Settings", "/atlas/#settings"]],
  files: ["/atlas/roof/connector.js", "/atlas/roof/module.js", "/atlas/roof/template.js", "/atlas/roof/native.js", "/atlas/assets/app.js", "/atlas/assets/style.css", "/atlas/roof/workspace.css"],
  lazy: ["/atlas/roof/activity.js", "/atlas/roof/handoffs.js"],
  shares: { screens: "Atlas conversations" },
};
