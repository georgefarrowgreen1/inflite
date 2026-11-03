// Loading the apps that are modules (spec §3.12, D2, D14, D15, D21). Loaded lazily by the frame. B0's stub; FW writes it.
// loadModule(app, F) → Promise<{ m, instance }>: re-asks /api/hub through F (D14) and refuses unless F.session.hub &&
//   F.session.roof; import(REGISTRY[app].entry) with a 12 s deadline; m.CONTRACT === 1; links each REGISTRY[app].css and
//   awaits it (5 s cap); IFL.built(app, m.BUILD, m.NEWS) once; instance = await m.mount(root, F.forModule(app));
//   watchVersion; keepOffline. On failure the screen shows ui.error with data-act retry / own (then reload).
// loadConnector(app) → Promise<Connector>: import(REGISTRY[app].connector) → its `connector` export.
// preload(app): loadConnector(app), then a <link rel=modulepreload> per connector.files entry ending .js.
// watchVersion(app, build, F): asks /<app>/version when the page becomes visible (≤ every 10 min); a new build sets F.stale.
// keepOffline(app, build, files): posts { ifl: "keep", app, build, files } (absolute same-origin paths) to the root
//   worker, once per build per page.
export const STUB = true;
export async function loadModule(app, F) { throw new Error("modules.js is B0's stub"); }
export async function loadConnector(app) { throw new Error("modules.js is B0's stub"); }
export function preload(app) {}
export function watchVersion(app, build, F) {}
export function keepOffline(app, build, files) {}
