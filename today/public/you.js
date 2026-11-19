// InFlite's You (spec §10, §11.3, §11.5): a view of the one page at inflite.ai (/#you). Your account; the rules Today
// acts by, each at Do, Suggest or Quiet, with its record (GET/PUT /api/rules); notifications, by app (GET/PATCH
// /api/notify); this phone (its one subscription: Today's morning, and, from a tap of its own, every app's: POST
// /api/device { sub, fan: true }); other devices still getting notifications, each with Stop There (GET/DELETE
// /api/devices); quiet hours; Chat's own settings; each app's version; and Sign Out. And, under InFlite's one roof
// (One roof §4.3): Connected Apps (#youApps: each app and what it really shares with InFlite, its connector's sheet a
// tap away) and the Weather Notifications sheet (#sh-wxnotify: rain and warnings for each place, the morning briefing,
// email; over the same /api/notify, PATCH { weather: … }), opened from Weather's row here, /#you=notify-weather, Weather's
// connector and Weather Settings.
// An account side from before (a route answering 404 or 501): Rules, Notifications by App, Quiet Hours and Other Devices
// left out, and This Phone as Today's morning alone. Where the hub can't serve the apps yet (degraded): no Get Every
// App's Notifications Here and no Other Devices, which only the hub has.
//   drawYou(root, ctx) → a promise, once it's drawn: ctx is the page's (app.js youCtx): view, hub, call(path, o),
//   missing(e), toast(text), morning (the morning's view as the page has it now), sub() → this phone's subscription,
//   device() → its name for the account, kept() → the endpoint this browser last handed the account (today:push),
//   photo(user) → the account's picture (its initial under it), turnOn(), turnOff(), fanOut(), everyKept() → whether the
//   account has every app's come to each device with notifications, syncPush({ force }) → this device handed to the
//   account as it wants it (app.js), offHere() → whether This Phone was turned off on this device, toMorning(),
//   openAccount(open), signOut(), chatSettings(), canPush(), pushWhy(), openSheet(id), closeSheet(), BUILD,
//   frame (F), connectors() → the framework's connectors.js, connector(app) → its sheet for that app, icon(app) → its icon's address,
//   go(path) → a screen of the framework's, href(app, section) → an app's address from here (IFL.hub.href)
//   current() → account/frame still owned, active() → this visit to You is still shown (including its route argument)
//   forgetYou() → nothing: what You last asked forgotten (signed out, or another account)
//   goTo(root, ctx, id, drawn) → /#you=<id>: its section scrolled to (notify, apps, quiet, rules, phone, account,
//   signout), or its sheet (notify-weather, notify-mail), once drawn (drawYou's promise)
//   openWxNotify(root, ctx) → the Weather Notifications sheet
import { previewWallpaper, wallpaperPreference, setWallpaper, bubbleColours, wallpaperColour, setWallpaperColour } from "/roof/wallpaper.js";
import { esc, G } from "/cards.js";

const LEVELS = [["do", "Do"], ["suggest", "Suggest"], ["quiet", "Quiet"]];
const APPS = [["today", "Today"], ["chat", "Chat"], ["weather", "Weather"], ["fitness", "Fitness"], ["markets", "Markets"], ["mail", "Mail"]];
// (each app's version as its server says it now: asked as About opens, at most once a minute)
const NATIVE_VERSIONS = [["calendar","Calendar"],["notes","Notes"],["people","People"]];
const LIVE = {}, LIVE_PATH = { calendar:"/calendar/", notes:"/notes/", people:"/people/", chat: "/chats/", weather: "/weather/", fitness: "/fitness/", markets: "/markets/", mail: "/mail/" };
let liveAt = 0;
function liveVersions(root, ctx) {
  if (Date.now() - liveAt < 60e3) return;
  liveAt = Date.now();
  const signal = AbortSignal.any([ctx.frame.signal, AbortSignal.timeout(12000)]);
  Promise.all(Object.entries(LIVE_PATH).map(([k, p]) => fetch(`${p}version`, { cache: "no-store", credentials: "same-origin", signal })
    .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.build) LIVE[k] = String(j.build); }, () => {}))).then(() => { if (root.isConnected && current(ctx)) paint(root, ctx); });
}
// (each row's leading icon: a symbol on a colour, as Settings has, or the app's own icon)
const sv = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const GL = {
  bell: G.bell, sun: G.sun, info: G.info,
  shield: sv('<path d="M12 3 4.5 6v5.5c0 4.8 3 7.8 7.5 10 4.5-2.2 7.5-5.2 7.5-10V6z"/><path d="m9 12 2 2 4-4"/>'),
  devices: sv('<rect x="3" y="4" width="14" height="11" rx="2"/><path d="M7 19h5m-2-4v4"/><rect x="15" y="10" width="6" height="11" rx="1.5"/>'),
  moon: sv('<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>'),
  spark: sv('<path d="M12 3.5 13.9 8.6 19 10.5 13.9 12.4 12 17.5 10.1 12.4 5 10.5 10.1 8.6z"/><path d="m18.4 16.4.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>', 1.8),
  apps: sv('<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>', 1.9),
  every: sv('<path d="M4 7.5h16M4 12h16M4 16.5h10"/>'),
};
const NAMES = { chat: "Chat", weather: "Weather", fitness: "Fitness", markets: "Markets", today: "Today", mail: "Mail" };
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hh = (h) => `${String(h).padStart(2, "0")}:00`;
const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"; } catch { return "Europe/London"; } };
const and = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
// A hidden or replaced visit may finish a request, but cannot replace the current
// visit's handlers, focus or sheets when its result eventually arrives.
const current = (ctx) => ctx.current?.() !== false && ctx.active?.() !== false;

// what You shows, as last asked (each null until asked; false where this account side hasn't it; sub: this phone's
// subscription, as the browser has it)
const Y = { rules: null, notify: null, devices: null, sub: null, shares: null, sharesRoof: null };
let drawing = null;
const accountSection = section => /^(?:settings-)?account(?:-(profile|security|data|confirm|units|appearance|notify-inflight))?$/.exec(section || "");
export function releaseAccount() { document.getElementById("you")?.querySelector("inflite-settings-account")?.remove(); }
export function forgetYou() { releaseAccount(); Y.rules = Y.notify = Y.devices = Y.sub = Y.shares = null; Y.synced = Y.notHere = Y.everyLost = false; drawing = null; }
// (Connected Apps: each app, and the words of InFlite's connector contract its descriptor fills, and only those)
const CONNECTED = [["weather", "Weather"], ["chats", "Chats"], ["fitness", "Fitness"], ["markets", "Markets"], ["mail", "Mail"]];
const WORDS = [["cards", "Cards"], ["search", "Search"], ["notifications", "Notifications"], ["actions", "Actions"], ["screens", "Screens"]];
// (kept for the roof as it was when they were worked out: Weather's words aren't the same with it off)
const roofOf = (ctx) => `${!!(ctx.hub && ctx.roof)}${!!ctx.chats}`;
async function sharesOf(ctx) {
  const roof = roofOf(ctx);
  if ((Y.shares && Y.sharesRoof === roof) || typeof ctx.connectors !== "function") return;
  const m = await ctx.connectors().catch(() => null);
  if (!m || !current(ctx)) return;
  const out = {};
  for (const [app] of CONNECTED) {
    const c = await Promise.resolve(m.connectorOf(app, ctx.frame)).catch(() => null);
    if (!current(ctx)) return;
    const s = c?.shares && typeof c.shares === "object" ? c.shares : null;
    out[app] = s ? WORDS.filter(([k]) => typeof s[k] === "string" && s[k]).map(([, w]) => w).join(" · ") : "";
  }
  Y.shares = out; Y.sharesRoof = roof;
}

// This Phone's switch: the account's word (the view's push.on: notifications wanted, said on any device), unless it was
// turned off on this device. Where this device can't have them (not allowed here yet, or the account hasn't it and it
// couldn't be handed over quietly: notHere), the row says so, and a tap turns it on here, never off.
// An account side from before, without that word: on where the account has this phone for Today's morning (td_push),
// as the account says: GET /api/devices' here (asked with this phone's name), else the morning's thisDevice; only where
// neither says, this browser's own word (the endpoint it last handed the account)
function phoneOn(ctx) {
  const p = ctx.view?.push;
  if (typeof p?.on === "boolean") return p.on && !ctx.offHere?.();
  const sub = Y.sub;
  if (!sub || (typeof Notification !== "undefined" && Notification.permission !== "granted")) return false;
  if (Array.isArray(Y.devices?.here) && Y.devices.asked) return Y.devices.here.includes("td_push");
  const t = ctx.morning?.thisDevice;
  if (typeof t === "boolean") return t;
  return !!sub.endpoint && ctx.kept?.() === sub.endpoint;
}
const said = (ctx) => typeof ctx.view?.push?.on === "boolean";
const notHere = (ctx) => said(ctx) && phoneOn(ctx) && !ctx.pushWhy?.() && (typeof Notification === "undefined" || Notification.permission !== "granted" || !!Y.notHere);

export async function drawYou(root, ctx) {
  if (!root || !ctx?.view || !current(ctx)) return;
  // (drawn at once with what's known, then again as each answer comes)
  paint(root, ctx);
  if (accountSection(ctx.section)) return;
  const ask = (path) => ctx.call(path).catch((e) => (ctx.missing(e) ? false : null));
  const sub = await ctx.sub().catch(() => null);
  if (!current(ctx)) return;
  Y.sub = sub;
  const dev = sub && ctx.device?.() ? `?device=${encodeURIComponent(ctx.device())}` : "";
  const run = (drawing = Promise.all([ask("/api/rules"), ask("/api/notify"), ctx.hub ? ask(`/api/devices${dev}`) : Promise.resolve(false), sharesOf(ctx).catch(() => {})]));
  const [rules, notify, devices] = await run;
  if (drawing !== run || !current(ctx)) return;
  Y.rules = rules; Y.notify = notify; Y.devices = devices && typeof devices === "object" ? { ...devices, asked: !!dev } : devices;
  paint(root, ctx);
  // (this phone, as the account wants it, where the account hasn't it (the browser lost its subscription; a sign-in that
  // ended took the apps' rows): handed over again, quietly, once a visit; failing that, its row says so, and Get Every
  // App's Here is back to tap)
  const here = Y.devices?.asked ? Y.devices.here || [] : null, every = Y.devices?.fan === true && ctx.everyKept?.();
  if (said(ctx) && phoneOn(ctx) && !Y.synced && (!here || !here.includes("td_push") || (every && !here.includes("pg_push")))) {
    Y.synced = true;
    const r = await ctx.syncPush?.({ force: true }).catch(() => null);
    if (drawing !== run || !current(ctx)) return;
    const now = r ? [...new Set([...(here || []), ...(Array.isArray(r.tables) ? r.tables : ["td_push"])])] : here || [];
    if (r) {
      const sub = await ctx.sub().catch(() => Y.sub);
      if (!current(ctx)) return;
      Y.sub = sub;
      if (Y.devices && typeof Y.devices === "object") Object.assign(Y.devices, { here: now, asked: true });
    }
    Y.notHere = !now.includes("td_push");
    Y.everyLost = every && !now.includes("pg_push");
    paint(root, ctx);
  }
}

function paint(root, ctx) {
  if (!current(ctx)) return;
  const u = ctx.view.user || {}, admin = ctx.view.apps?.mail === true;
  const account = accountSection(ctx.section);
  if (account && root.dataset.settingsOwner === String(u.id) && root.dataset.settingsSection === ctx.section && root.querySelector("inflite-settings-account")) return;
  // (a section: its heading, one group, a line of small print under it; icons: its rows lead with an icon, the lines
  // between them start where the words do)
  const sec = (id, title, body, foot = "", icons = false) => body ? `<section class="you-sec" id="${id}">${title ? `<h2 class="you-h">${esc(title)}</h2>` : ""}<div class="group glass${icons ? " icons" : ""}">${body}</div>${foot ? `<p class="you-foot">${foot}</p>` : ""}</section>` : "";
  const tx = (b, small) => `<span class="tx"><b>${esc(b)}</b>${small ? `<small>${esc(small)}</small>` : ""}</span>`;
  const ic = (k, tone) => `<span class="ic ${tone}" aria-hidden="true">${GL[k]}</span>`;
  const appIc = (app) => { const src = typeof ctx.icon === "function" ? ctx.icon(app) : ""; return `<span class="ic app" aria-hidden="true">${src ? `<img src="${esc(src)}" alt="" width="32" height="32">` : ""}</span>`; };
  const row = (k, b, small, end = "", lead = "") => `<div class="row" data-k="${k}">${lead}${tx(b, small)}${end}</div>`;
  const go = (attrs, b, small, val = "", lead = "") => `<button class="row go" type="button" ${attrs}>${lead}${tx(b, small)}${val ? `<span class="val">${esc(val)}</span>` : ""}<span class="chev">${G.chev}</span></button>`;
  const sw = (attrs, b, small, on, aria, extra = "", lead = "") => `<label class="row"${extra}>${lead}${tx(b, small)}<input type="checkbox" class="switch" role="switch" ${attrs} ${on ? "checked" : ""} aria-label="${esc(aria)}"></label>`;
  const pick = (attrs, b, small, opts, on, aria, extra = "") => `<label class="row pick"${extra}><span class="tx"><b>${esc(b)}</b>${small ? `<small data-line>${esc(small)}</small>` : ""}</span><span class="val"><span>${esc((opts.find(([v]) => v === on) || opts[0])[1])}</span>${G.down}</span><select ${attrs} aria-label="${esc(aria)}">${opts.map(([v, l]) => `<option value="${v}" ${v === on ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const sections = {};
  // You: your picture and name, a tap from your account
  const photo = typeof ctx.photo === "function" ? ctx.photo(u) : esc([...String(u.first || u.name || "?")][0] || "?");
  sections.youAccount = sec("youAccount", "", `<a class="row go you-me" href="/#settings=account" id="youAcct"><span class="you-ph" aria-hidden="true">${photo}</span><span class="tx"><b>${esc(u.name || u.handle || "Your account")}</b><small>View account</small></span><span class="chev">${G.chev}</span></a>`);
  // Notifications: this phone, Today's morning, quiet hours
  const n = Y.notify;
  {
    const why = ctx.pushWhy?.(), rows = [];
    let foot = "";
    const on = phoneOn(ctx);
    rows.push(sw(`id="youPhone"${why ? " disabled" : ""}`, "On This Device", why || (notHere(ctx) ? "Tap to turn on here" : "Today’s morning and the apps below"), on, "Notifications on this device", ` id="youPhoneRow"`, ic("bell", "red")));
    const here = Array.isArray(Y.devices?.here) ? Y.devices.here : [], every = !!ctx.everyKept?.();
    if (ctx.hub && ctx.view.hubPush === true && Y.devices !== false) {
      // (chosen on the account, ctx.everyKept: shown as on wherever this phone has them, and sent again by drawYou if
      // the account's lost it here)
      if (on && (here.includes("pg_push") || (every && !Y.everyLost))) foot = "Every app notifies here: Chats, Weather and Markets as well as Today.";
      else if (on || !every) rows.push(go(`id="youEvery"`, "Notifications From Every App", "Receive Chats, Weather and Markets on this device", "", ic("every", "blue")));
    }
    const t = (n && n.today) || ctx.morning || {};
    rows.push(go(`id="youMorning"`, "Today’s Morning", "One notification, from all your apps", t.on ? clock(Number.isInteger(t.at) ? t.at : 420) : "Off", ic("sun", "orange")));
    if (n) {
      const q = { on: false, from: 22, to: 7, ...(n.quiet || {}) };
      const hours = Array.from({ length: 24 }, (_, h) => [String(h), hh(h)]);
      rows.push(sw(`id="youQuiet"`, "Quiet Hours", "Everything waits, except warnings", q.on, "Quiet hours", "", ic("moon", "indigo")));
      if (q.on) rows.push(pick(`id="youQfrom"`, "From", "", hours, String(q.from), "Quiet hours from", ` data-k="qfrom"`).replace('class="row pick"', 'class="row pick sub"'),
        pick(`id="youQto"`, "To", "", hours, String(q.to), "Quiet hours to", ` data-k="qto"`).replace('class="row pick"', 'class="row pick sub"'));
    }
    sections.youNotify = sec("youNotify", "Delivery", rows.join(""), foot, true);
  }
  // From each app: its own icon, a switch where it's one, else a tap to its own sheet
  if (n !== false) {
    let body;
    if (!n) body = row("notify", "From Each App", "Getting them…");
    else {
      const chatOn = !!n.chat?.kinds?.messages;
      const places = Array.isArray(n.weather?.places) ? n.weather.places : [];
      const rainOn = places.length > 0 && places.every((p) => p.rain);
      const mktOn = !(n.markets?.off === true), wrapOn = n.markets?.wrap !== false;
      body = [
        sw(`data-k="chat"`, "Chats", "Who wrote, never the words", chatOn, "Chats notifications", ` data-app="chat"`, appIc("chat")),
        go(`id="youWx" data-k="weather"`, "Weather", "Rain and warnings for your places", places.length ? (rainOn ? "On" : places.some((p) => p.rain) ? "Some" : "Off") : "", appIc("weather")),
        sw(`data-k="alerts"`, "Markets", "When a price you watch moves", mktOn, "Markets price alerts", ` data-app="markets"`, appIc("markets")),
        sw(`data-k="wrap"`, "Evening Wrap", "How your holdings did, each weekday", wrapOn, "Markets: the Evening Wrap", ` data-app="markets"`).replace('<label class="row"', '<label class="row sub"'),
        ctx.frame?.session?.apps?.fitness === true
          ? `<a class="row go" href="${esc("/#settings=fitness")}" data-k="fitness" data-app="fitness">${appIc("fitness")}${tx("Fitness", "In Today’s morning")}<span class="chev">${G.chev}</span></a>`
          : row("fitness", "Fitness", "In Today’s morning", "", appIc("fitness")),
        admin ? go(`id="youMail" data-k="mail" data-app="mail"`, "Mail", "Through InFlite, and which addresses", "", appIc("mail")) : "",
      ].join("");
    }
    sections.youApps2 = sec("youApps2", "From Each App", body, "", !!n);
  }
  // Rules: what Today may do for you, each Do, Suggest or Quiet (the ones still to come left out)
  if (Y.rules !== false) {
    const rules = (Y.rules?.rules || []).filter((r) => !r.soon);
    const body = !Y.rules ? row("rules", "Rules", "Getting them…") : rules.map((r) =>
      pick(`data-rulepick="${esc(r.rule)}"`, r.name, r.line || "", LEVELS, r.level, `${r.name}: Do, Suggest or Quiet`, ` data-rule="${esc(r.rule)}"`)).join("");
    FOLDERS.rules = sec("youRules", "What Today Does for You", body, "Do: it acts and tells you. Suggest: it asks first. Quiet: it leaves it. Undo one and it drops a level; ten kept and it climbs.");
  } else FOLDERS.rules = "";
  // Connected Apps
  {
    const body = CONNECTED.filter(([app]) => app !== "mail" || admin).map(([app, name]) => {
      const src = typeof ctx.icon === "function" ? ctx.icon(app === "chats" ? "chat" : app) : "";
      const words = Y.shares && Y.sharesRoof === roofOf(ctx) ? Y.shares[app] : null;
      return `<button class="row go conn" type="button" data-app="${app}" aria-label="${esc(`${name}’s connector${words ? `: ${words}` : ""}`)}"><span class="ic app">${src ? `<img src="${esc(src)}" alt="" width="28" height="28">` : ""}</span><span class="tx"><b>${esc(name)}</b><small>${esc(words ?? "")}</small></span><span class="chev">${G.chev}</span></button>`;
    }).join("");
    FOLDERS.apps = sec("youApps", "Connected Apps", body, "Each app keeps its own server and data. This is all it shares with InFlite.");
  }
  // Other devices
  const list = Array.isArray(Y.devices?.devices) ? Y.devices.devices : [];
  if (ctx.hub && Y.devices && list.length) sections.youDevices = sec("youDevices", "Other Devices", list.map(deviceRow).join(""));
  // About: each app's version as it is now (asked of each app as About opens), else as it last said it here
  const ver = [...APPS, ...NATIVE_VERSIONS].filter(([k]) => k !== "mail" || admin).map(([k, name]) => {
    let b = k === "today" ? ctx.BUILD : LIVE[k] || null;
    try { b ||= localStorage.getItem(`ifl-build:${k}`); } catch {}
    return row(`v-${k}`, name, null, `<span class="val">${b ? `V${esc(b)}` : "—"}</span>`);
  }).join("");
  const aboutLinks = [
    ["/about/", "About the apps"],
    ["/about/#contact", "Contact InFlite"],
    ["/privacy/", "Privacy notice"],
    ["/storage/", "Cookies and device storage"],
    ["/terms/", "Terms of use"],
  ].map(([href, title]) => `<a class="row go" href="${href}">${tx(title, "")}<span class="chev">${G.chev}</span></a>`).join("");
  FOLDERS.versions = sec("youVersions", "About InFlite", aboutLinks + ver);
  const link = (action, title, description, lead = "") => go(`data-setting="${action}"`, title, description, "", lead);
  const options = ctx.frame?.session?.apps || {};
  const appSettings = [
    ["weather", "Weather", "Units, forecasts, commute and solar"],
    ["fitness", "Fitness", "Training zones, units, devices and providers"],
    ["markets", "Markets", "Live prices and portfolio notifications"],
    ["chats", "Chats", "Delivery, location and privacy"],
    ["mail", "Mail", "Addresses, signature and incoming mail"],
  ].filter(([app]) => app !== "mail" || admin)
   .map(([app, name, description]) => link(app, name, description, appIc(app === "chats" ? "chat" : app))).join("");
  const shortcuts = [
    ["weather","forecast","Forecast detail"], ["weather","solar","Solar panels"], ["weather","commute","Commute"],
    ["weather","best","Best times for activities"], ["weather","arrange","Weather card order"],
    ["fitness","numbers","Training zones and personal numbers"], ["fitness","units","Fitness units and maps"],
    ["fitness","nights","Sleep and daily check-in"], ["fitness","devices","Fitness devices, Garmin and Strava"],
    ["chats","location","Chat location sharing"], ["mail","signature","Email signature"],
    ["mail","unknown","Unknown email addresses"]
  ].filter(([app]) => options[app] && (app !== "mail" || admin)).map(([app,page,title]) =>
    go(`data-editor="${app}" data-page="${page}"`,title,({chats:"Chats",mail:"Mail",weather:"Weather",fitness:"Fitness"})[app])
  ).join("");
  const groups = [
    ["account", "Account & security", "Profile, sign-in and personal data", "shield", sec("youIdentity", "", [
      link("profile","Edit profile","Name, photo and handle"),
      link("security","Security","Password, passkeys, sessions, app access and activity"),
      link("data","Your data","Export your information or manage your account"),
      go('id="youOut"', "Sign out", "On this device")
    ].join(""))],
    ["personalise", "Appearance & Today", "Colours, Liquid Glass and your daily view", "sun",
      sec("youPersonal", "", [link("appearance","Appearance","Theme, palette, Bubbles wallpaper and Liquid Glass"),
        link("units","Weather units","Temperature, wind, rain, pressure and clock"),
        ctx.life ? link("customise","Customise Today","Sections and card order") : ""].join("")) + FOLDERS.rules],
    ["notifications", "Notifications", "Quiet hours, morning briefing and alerts", "bell",
      (sections.youNotify || "") + (sections.youApps2 || "") + sec("youEmail", "", link("emails","Email preferences","Account and app email notifications"))],
    ["apps", "Apps & connections", "App preferences, sharing and calendars", "apps",
      sec("youPreferences","App preferences",appSettings + shortcuts) + sec("youConnections","Connections",
        (ctx.life ? link("calendars","Connected calendars","Subscriptions and imports") : "") +
        link("sharing","Connected apps","What each app shares with InFlite"))],
    ["devices", "Devices", "Saved devices and notification delivery", "devices",
      (ctx.remembered ? sec("youRemembered","",link("remembered","Remembered devices","Continuation and encrypted drafts")) : "") +
      (sections.youDevices || sec("youDeviceInfo","",row("devices","Other notification devices",Y.devices === null ? "Checking your devices…" : "None listed")))],
    ["about", "About InFlite", "App versions, privacy and support", "info", FOLDERS.versions]
  ];
  const selected = account ? "account" : categoryFor(ctx.section);
  const previous = root.querySelector('.settings-search input');
  const sameVisit = root.dataset.settingsOwner === String(u.id) && root.dataset.settingsSection === (ctx.section || "");
  const query = sameVisit ? previous?.value || "" : "";
  const focused = sameVisit && root.contains(document.activeElement) ? document.activeElement : null;
  root.dataset.settingsOwner = u.id;
  root.dataset.settingsSection = ctx.section || "";
  const currentCategory = selected || (matchMedia("(min-width: 900px)").matches ? "account" : null);
  const nav = groups.map(([key,title,sub,icon]) =>
    `<a class="row go settings-category" href="/#settings=${key}" data-category="${key}" ${currentCategory === key ? 'aria-current="page"' : ""}>${ic(icon,"grey")}${tx(title,sub)}<span class="chev">${G.chev}</span></a>`).join("");
  const details = groups.map(([key,title,, ,html]) =>
    `<section class="settings-detail" data-group="${key}" aria-label="${esc(title)}"><h2>${esc(title)}</h2>${html}</section>`).join("");
  const detailNav = account ? `<header class="settings-account-bar">
    <a class="settings-back" href="/#settings" aria-label="Back to all settings">${sv('<path d="m15 5-7 7 7 7"/>')}</a>
    <h1>Account &amp; security</h1>
    <button type="button" aria-label="Search">${sv('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>')}</button>
  </header>` : `<a class="settings-back" href="/#settings"><span aria-hidden="true">‹</span> All settings</a>`;
  root.innerHTML = `<div class="settings-sidebar">
    ${sections.youAccount}<label class="settings-search">${sv('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>')}<input type="search" aria-label="Search settings" placeholder="Search settings" autocomplete="off"></label>
    <nav class="group glass icons" aria-label="Settings categories">${nav}</nav></div>
    <div class="settings-content">${detailNav}${details}<p class="settings-empty" role="status" hidden>No matching settings</p></div>`;
  if (account) {
    root.querySelector(".settings-account-bar button").addEventListener("click", () => ctx.frame.search.open());
    const detail = root.querySelector('[data-group="account"]');
    const pane = document.createElement("inflite-settings-account");
    pane.setAttribute("aria-label","Account");
    pane.addEventListener("inflite-profile-updated", async () => {
      const user = await ctx.refreshProfile?.();
      if (!user || !pane.isConnected) return;
      const card = root.querySelector("#youAcct");
      card.querySelector(".tx b").textContent = user.name || user.handle;
      card.querySelector(".you-ph").innerHTML = ctx.photo(user);
    });
    detail.append(pane);
    import("/settings-account.js").then(() => {
      if (pane.isConnected) pane.mount({
        owner:String(u.id), part:account[1] === "security" && ctx.security ? undefined : account[1],
        sheets:ctx.frame.sheet, onSecurity:ctx.security
      });
    }).catch(() => {
      if (!pane.isConnected) return;
      const retry = document.createElement("button");
      retry.textContent = "Reload Account";
      retry.onclick = () => location.reload();
      pane.replaceChildren(retry);
    });
  }
  const input = root.querySelector('.settings-search input');
  input.value = query;
  function filter() {
    const words = input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    root.toggleAttribute("data-filtering", !!words.length);
    const frame = root.querySelector("inflite-settings-account");
    if (frame) frame.hidden = !!words.length;
    let count = 0;
    for (const section of root.querySelectorAll('[data-group]')) {
      const key = section.dataset.group, title = section.getAttribute('aria-label');
      let any = false;
      for (const block of section.querySelectorAll('.you-sec')) {
        let hits = 0;
        for (const item of block.querySelectorAll('.row')) {
          const line = [title,block.querySelector('.you-h')?.textContent,item.textContent].join(' ').toLocaleLowerCase();
          item.hidden = (!words.length && !!item.dataset.editor) || !words.every(word => line.includes(word));
          if (!item.hidden) hits++;
        }
        block.hidden = !hits || !!frame && !words.length && key === "account";
        any ||= !!hits;
      }
      section.hidden = words.length ? !any : key !== (selected || 'account');
      if (!section.hidden) count++;
    }
    root.dataset.detail = selected ? "true" : "false";
    root.querySelector('.settings-empty').hidden = count > 0;
  }
  filter();
  input.addEventListener("input", filter);
  if (focused === previous && previous) {
    input.focus({preventScroll:true});
  } else if (focused?.id) root.querySelector('#'+CSS.escape(focused.id))?.focus({preventScroll:true});
  else if (focused?.dataset.category) root.querySelector(`[data-category="${focused.dataset.category}"]`)?.focus({preventScroll:true});
  const yf = document.getElementById("sh-youfolder");
  if (yf?.open && yf.dataset.folder) fillFolder(yf, root, ctx);
  wire(root, ctx);
  for (const entry of root.querySelectorAll("[data-editor]")) entry.addEventListener("click", () => {
    ctx.editApp(entry.dataset.editor,entry,entry.dataset.page);
  });
  for (const b of root.querySelectorAll('[data-setting]')) b.addEventListener('click', () => {
    const key = b.dataset.setting;
    if (key === 'sharing') return openFolder('apps',root,ctx);
    if (key === 'security' && ctx.security) return ctx.security();
    if (key === 'remembered') return ctx.remembered();
    if (key === 'calendars' || key === 'customise') return ctx.life(key);
    if (key === 'emails') return emailPreferences(root,ctx);
    if (key === 'appearance') return appearance(ctx);
    if (key === 'units' && options.weather) return ctx.editApp('weather',b,'units');
    if (["weather","fitness","markets","chats","mail"].includes(key)) return ctx.editApp(key,b);
    ctx.openAccount(key);
  });
}

function deviceRow(d) {
  const apps = (Array.isArray(d.apps) ? d.apps : []).map((a) => NAMES[a]).filter(Boolean);
  const sub = [apps.length ? and(apps) : "", d.home ? "on its Home Screen" : ""].filter(Boolean).join(", ");
  return `<div class="row dev" data-dev="${esc(d.id)}"><span class="tx"><b>${esc(d.label || "Another device")}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><button class="pill small" type="button" data-stop="${esc(d.id)}" aria-label="${esc(`Stop There: ${d.label || "another device"}`)}">Stop There</button></div>`;
}

const FOLDERS = { rules: "", apps: "", versions: "" };
function categoryFor(section) {
  const key = (section || "").replace(/^settings-/, "");
  if (["notifications","account","about","devices","apps","personalise"].includes(key)) return key;
  if (["quiet","phone","notify","notify-weather","notify-mail","markets-alerts","emails"].includes(key)) return "notifications";
  if (["weather","fitness","chats","mail","markets","calendars","sharing"].includes(key)) return "apps";
  if (["appearance","customise","rules","units"].includes(key)) return "personalise";
  if (key === "versions") return "about";
  if (key === "signout" || key === "module") return "account";
  return null;
}
const FOLDER_TITLE = { rules: "What Today Does for You", apps: "Connected Apps", versions: "About InFlite" };
function fillFolder(sheet, root, ctx) {
  const k = sheet.dataset.folder, body = sheet.querySelector("#yfBody");
  sheet.querySelector("#sh-youfolder-t").textContent = FOLDER_TITLE[k] || "";
  // (the section as it is on You, its heading left out: the sheet's title says it)
  body.innerHTML = FOLDERS[k] || "";
  body.querySelector(".you-h")?.remove();
  wire(body, ctx);
}
function openFolder(k, root, ctx) {
  if (!current(ctx)) return;
  const sheet = document.getElementById("sh-youfolder");
  if (!sheet || !FOLDER_TITLE[k]) return;
  if (k === "versions") liveVersions(root, ctx);
  sheet.dataset.folder = k;
  fillFolder(sheet, root, ctx);
  if (!sheet.open) ctx.openSheet("sh-youfolder");
}
async function accountPreference(ctx,path,method = "GET",patch, lifetime = ctx.frame.signal) {
  const headers = {"X-InFlite-Owner":ctx.view.user.id};
  if (patch) headers["Content-Type"] = "application/json";
  const deadline = AbortSignal.timeout(12000);
  const signal = AbortSignal.any([ctx.frame.signal, lifetime, deadline]);
  try {
    const response = await fetch("/account/api/account/" + path, {
      method, headers, credentials:"same-origin", cache:"no-store", mode:"same-origin", redirect:"error", signal,
      body: patch ? JSON.stringify(patch) : undefined
    });
    if (!response.ok) throw Object.assign(Error(response.status === 401 ? "Your account changed. Open Settings again." : "Couldn’t reach Account. Try again."),{status:response.status});
    return await response.json();
  } catch (error) {
    if (ctx.frame.signal.aborted || lifetime.aborted) throw error;
    if (method !== "GET" && (!error.status || error.status >= 500))
      throw Object.assign(Error("Couldn’t confirm the save. Reload your preferences to see their current values."),{uncertain:true});
    if (deadline.aborted) throw Error("Account took too long to respond. Try again.");
    throw error;
  }
}


function emailPreferences(root,ctx) {
  const ui = ctx.frame.ui, el = ui.el, body = el("div",{class:"settings-preferences"});
  const reads = new AbortController();
  const h = ctx.frame.sheet.open({sheet:"settings-emails",title:"Email preferences",body,onClose:()=>reads.abort()});
  const active = () => current(ctx) && !h.closed;
  async function load() {
    body.replaceChildren(ui.skeleton("rows",3));
    try {
      const prefs = await accountPreference(ctx,"notify","GET",undefined,reads.signal);
      if (active()) draw(prefs);
    } catch (error) {
      if (active()) body.replaceChildren(ui.error({title:"Email preferences unavailable",body:error.message,acts:[{label:"Try again",run:load}]}));
    }
  }
  function draw(prefs) {
    const list = el("fieldset"), status = el("p",{class:"you-foot",role:"status"});
    const toggle = (title,checked,patch) => ui.row({title,trail:ui.sw(checked,async value => {
      if (list.disabled || !active()) return;
      list.disabled = true;
      status.textContent = "Saving…";
      try {
        const next = await accountPreference(ctx,"notify","PATCH",patch(value));
        if (active()) {
          Y.notify = next;
          draw(next);
          paint(root,ctx);
        }
      } catch (error) {
        if (!active()) return;
        if (error.uncertain) body.replaceChildren(ui.error({title:"Email preferences",body:error.message,acts:[{label:"Reload preferences",run:load}]}));
        else { draw(prefs); body.querySelector('[role=status]').textContent = error.message; }
      }
    },{label:title})});
    const chat = [["messages","Unread messages"],["landed","Letters arriving"],["requests","Friend requests"]];
    if (prefs.chat.pigeons) chat.push(["weekly","Weekly flight summary"]);
    list.append(ui.list(chat.map(([key,label]) => toggle(label,!!prefs.chat.emails[key],on=>({chat:{emails:{[key]:on}}}))),{label:"Chats"}),
      ui.list([["warn","Official warnings"],["brief","Morning briefing"]].map(([key,label]) => toggle(label,!!prefs.weather.email[key],on=>({weather:{email:{[key]:on}}}))),{label:"Weather"}),
      ui.list([toggle("When a reported problem is fixed",prefs.account.fixed,on=>({account:{fixed:on}}))],{label:"Account"}));
    list.disabled = !prefs.emailOk;
    body.replaceChildren(list,status,el("p",{class:"you-foot",text:"Security emails about sign-ins and account changes are always sent."}));
    if (!prefs.emailOk) body.prepend(ui.row({title:"Verify your email to receive app updates",trail:"chevron",run:()=>ctx.security ? ctx.security({view:"sign-in"}) : ctx.openAccount("security")}));
  }
  load();
}

function appearance(ctx) {
  if (!current(ctx)) return;
  const theme = globalThis.InFliteAppearance, ui = ctx.frame.ui, el = ui.el;
  if (!theme) return ctx.openAccount("appearance");
  const owner = ctx.view.user.id, body = el("div", {class:"settings-appearance"});
  const listeners = new AbortController();
  const h = ctx.frame.sheet.open({sheet:"settings-appearance",title:"Appearance",body,onClose:()=>listeners.abort()});
  const sample = el("canvas");
  const favourites = document.querySelector(".ws-dock-apps");
  const apps = favourites ? Array.from(favourites.querySelectorAll("[data-launcher-app]"), b => b.dataset.launcherApp)
    : ["weather","fitness","markets","chat"];
  const dock = el("div",{class:"settings-preview-dock"},ui.icon("sun"),
    apps.map(app => app === "files" ? ui.icon("file") : ui.icon(null,{app,size:24})),ui.icon("grid"));
  const preview = el("div",{class:"settings-dock-preview","aria-hidden":"true"},sample,dock);
  previewWallpaper(sample,listeners.signal);
  let previewing = false;
  function cancelPreview() {
    if (previewing) theme.cancelGlassPreview();
    previewing = false;
  }
  listeners.signal.addEventListener("abort",cancelPreview,{once:true});
  let syncWallpaperControls;
  window.addEventListener("inflite:wallpaper-storage", () => syncWallpaperControls?.(), {signal:listeners.signal});
  const active = () => current(ctx) && !h.closed;
  async function load() {
    body.replaceChildren(ui.skeleton("rows",3));
    try {
      const pref = await accountPreference(ctx,"appearance","GET",undefined,listeners.signal);
      if (!active()) return;
      if (!pref.signedIn || pref.id !== owner) throw Error("Sign in to Account to edit your appearance.");
      theme.accept(pref);
      draw(pref);
    } catch (e) {
      if (active()) body.replaceChildren(ui.error({title:"Appearance unavailable",body:e.message,acts:[
        {label:"Try again",run:load},{label:"Open Account",run:()=>ctx.openAccount("appearance")}
      ]}));
    }
  }
  function draw(pref) {
    const form = el("fieldset"), status = el("p",{class:"you-foot",role:"status"});
    async function save(key,value) {
      if (!active() || form.disabled) return;
      form.disabled = true;
      status.textContent = "Saving…";
      try {
        const result = await accountPreference(ctx,"prefs","PUT",{[key]:value});
        if (!ctx.current() || result.id !== owner) return;
        previewing = false;
        theme.accept({...result.prefs,id:owner},{animate:true});
        if (active()) draw({...result.prefs,id:owner});
      } catch (error) {
        cancelPreview();
        if (!active()) return;
        if (error.uncertain) body.replaceChildren(ui.error({title:"Appearance",body:error.message,acts:[{label:"Reload preferences",run:load}]}));
        else { draw(pref); body.querySelector('[role=status]').textContent = error.message; }
      } finally { form.disabled = false; }
    }
    const select = (label,key,items) => {
      const input = el("select", {"aria-label":label},items.map(([value,text])=>el("option",{value,text})));
      input.value = pref[key];
      input.onchange = () => save(key,input.value);
      return ui.row({title:label,trail:input});
    };
    const wallpaper = el("select", {"aria-label":"Dark wallpaper on this device"},
      [["bubbles","Bubbles · drifting"],["still","Bubbles · still"],["plain","Plain"]].map(([value,text]) => el("option",{value,text})));
    const colours = el("fieldset", {class:"lava-colours"}, el("legend",{text:"Bubble colour"}));
    const swatches = el("div", {class:"lava-swatches"});
    for (const {value, name} of bubbleColours) {
      const radio = el("input", {type:"radio", name:"lava-colour", value});
      radio.onchange = () => { if (radio.checked) setWallpaperColour(value); };
      swatches.append(el("label", {data:{lava:value}}, radio,
        el("span",{class:"lava-swatch", "aria-hidden":"true"}), el("span",{text:name})));
    }
    colours.append(swatches);
    syncWallpaperControls = () => {
      wallpaper.value = wallpaperPreference();
      colours.hidden = wallpaper.value === "plain";
      for (const radio of swatches.querySelectorAll("input")) radio.checked = radio.value === wallpaperColour();
    };
    syncWallpaperControls();
    wallpaper.onchange = () => {
      setWallpaper(wallpaper.value);
      colours.hidden = wallpaper.value === "plain";
    };
    const strength = el("input",{type:"range",min:0,max:100,value:pref.glassStrength,"aria-label":"Glass intensity",disabled:!pref.glass});
    const amount = el("output",{text:pref.glassStrength+"%"});
    strength.oninput = () => {
      amount.textContent = strength.value+"%";
      previewing = theme.setGlass({glassStrength:Number(strength.value)},{preview:true});
    };
    strength.onpointercancel = () => {
      cancelPreview();
      strength.value = pref.glassStrength;
      amount.textContent = strength.value+"%";
    };
    strength.onchange = () => save("glassStrength",Number(strength.value));
    form.append(ui.list([
      select("Mode","appearance",[["auto","System"],["light","Light"],["dark","Dark"]]),
      ui.row({title:"Dark wallpaper",sub:"On this device",trail:wallpaper}),
      colours,
      select("Colour palette","palette",Object.entries(theme.palettes).map(([id,p])=>[id,p.name])),
      ui.row({title:"Liquid Glass",trail:ui.sw(pref.glass,on=>save("glass",on),{label:"Liquid Glass"})}),
      preview,
      ui.row({title:"Glass intensity",trail:el("span",{class:"settings-range"},strength,amount)})
    ]));
    body.replaceChildren(form,status);
  }
  load();
}

function wire(root, ctx) {
  const $ = (s) => root.querySelector(s);

  for (const b of root.querySelectorAll("[data-folder]")) b.addEventListener("click", () => openFolder(b.dataset.folder, document.getElementById("you") || root, ctx));
  $("#youMorning")?.addEventListener("click", () => ctx.toMorning());
  $("#youOut")?.addEventListener("click", async e => {
    const button = e.currentTarget;
    button.disabled = true;
    try { await ctx.signOut(); } finally { button.disabled = false; }
  });
  // (a rule's level: Do, Suggest or Quiet, set by you)
  for (const sel of root.querySelectorAll("[data-rulepick]")) sel.addEventListener("change", async () => {
    const rule = sel.dataset.rulepick, level = sel.value, r = sel.closest("[data-rule]"), rec = Y.rules?.rules?.find((x) => x.rule === rule);
    if (!rec || rec.level === level) return;
    const was = rec.level, shown = r.querySelector(".val > span");
    const say = (v) => { shown.textContent = (LEVELS.find(([k]) => k === v) || LEVELS[0])[1]; sel.value = v; };
    rec.level = level; say(level);
    try {
      const a = await ctx.call("/api/rules", { method: "PUT", body: { rule, level } });
      if (!current(ctx)) return;
      Object.assign(rec, { level: a.level || level, setBy: "you", line: a.line ?? rec.line });
      const ln = r.querySelector("[data-line]"); if (ln) ln.textContent = rec.line || "";
    } catch (e) { if (!current(ctx)) return; rec.level = was; say(was); if (e.status !== 401) ctx.toast(e.message); }
  });
  // (notifications by app: each a part of the account's settings, as its own page sets them)
  // (a switch that's a part of the account's notify settings: PATCH it, drawn again from the answer)
  const flip = (sel, body) => root.querySelector(sel)?.addEventListener("change", async (e) => {
    const box = e.target, on = box.checked;
    box.disabled = true;
    try { const answer = await ctx.call("/api/notify", { method: "PATCH", body: body(on) }); if (!current(ctx)) return; Y.notify = answer; }
    catch (err) { if (!current(ctx)) return; box.checked = !on; box.disabled = false; if (err.status === 401) return; box.focus({ preventScroll: true }); ctx.toast(err.message); return; }
    if (root.isConnected) { paint(root, ctx); root.querySelector(sel)?.focus({ preventScroll: true }); }
  });
  flip('#youApps2 [data-k="chat"]', (on) => ({ chat: Object.fromEntries(Object.keys(Y.notify?.chat?.kinds || { messages: true }).map((k) => [k, on])) }));
  flip('#youApps2 [data-k="alerts"]', (on) => ({ markets: { alerts: on } }));
  flip('#youApps2 [data-k="wrap"]', (on) => ({ markets: { wrap: on } }));
  // (Weather's: its own sheet, every place's rain and warnings, the briefing and email)
  $("#youWx")?.addEventListener("click", () => openWxNotify(root, ctx));
  // (Mail's, for the site's admin: its own sheet, mailnotify.js)
  $("#youMail")?.addEventListener("click", () => openMailNotifyFrom(ctx));
  // (Connected Apps: each app's connector, as a sheet of the framework's)
  for (const b of root.querySelectorAll("#youApps [data-app]")) b.addEventListener("click", () => ctx.connector?.(b.dataset.app));
  // (quiet hours: on or off, from and to, for every app)
  const quiet = (q) => {
    const now = { on: false, from: 22, to: 7, ...(Y.notify?.quiet || {}), ...q };
    return ctx.call("/api/notify", { method: "PATCH", body: { quiet: { on: now.on, from: now.from, to: now.to, tz: now.tz || browserTz() } } })
      .then((a) => { if (!current(ctx)) return false; Y.notify = a; return true; }, (e) => { if (!current(ctx)) return false; if (e.status !== 401) ctx.toast(e.message); return e.status !== 401; })
      .then((draw) => draw && paint(root, ctx));
  };
  $("#youQuiet")?.addEventListener("change", (e) => quiet({ on: e.target.checked }));
  $("#youQfrom")?.addEventListener("change", (e) => quiet({ from: Number(e.target.value) }));
  $("#youQto")?.addEventListener("change", (e) => quiet({ to: Number(e.target.value) }));
  // (this phone: on, from a tap; off, taken out of every app's table. Done, what's known here says so at once (off: in
  // none of them; on: Today's morning), and the account's asked again)
  $("#youPhone")?.addEventListener("change", async (e) => {
    const sw = e.target, on = sw.checked || notHere(ctx);
    sw.checked = on;
    sw.disabled = true;
    const ok = await (on ? ctx.turnOn() : ctx.turnOff()).catch(() => false);
    if (!current(ctx)) return;
    sw.disabled = false;
    if (!ok) { sw.checked = phoneOn(ctx); return; }
    if (on) Y.notHere = false;
    if (Y.devices && Array.isArray(Y.devices.here)) Y.devices.here = on ? [...new Set([...Y.devices.here, "td_push"])] : [];
    drawYou(root, ctx);
  });
  // Get Every App's Notifications Here: a sheet saying what changes, the old icons still getting them (each with Stop
  // There), and the one button that sends this phone to every app's table. Nothing's sent until that tap
  $("#youEvery")?.addEventListener("click", () => every(root, ctx));
  for (const b of root.querySelectorAll("[data-stop]")) b.addEventListener("click", () => stop(b, root, ctx));
}

function pressed(box, k, v) {
  for (const b of box?.querySelectorAll(`[data-${k}]`) || []) b.setAttribute("aria-pressed", String(b.dataset[k] === v));
}

async function stop(b, root, ctx) {
  const id = b.dataset.stop;
  b.disabled = true;
  try {
    await ctx.call("/api/devices", { method: "DELETE", body: { id } });
    if (!current(ctx)) return;
    if (Y.devices?.devices) Y.devices.devices = Y.devices.devices.filter((d) => d.id !== id);
    ctx.toast("Stopped there");
  } catch (e) { if (!current(ctx)) return; b.disabled = false; if (e.status !== 401) ctx.toast(e.message); return; }
  paint(root, ctx);
  const sheet = document.getElementById("sh-every");
  if (sheet?.open) fillEvery(sheet, root, ctx);
}

function every(root, ctx) {
  const sheet = document.getElementById("sh-every");
  if (!sheet) return;
  fillEvery(sheet, root, ctx);
  ctx.openSheet("sh-every");
}
function fillEvery(sheet, root, ctx) {
  const list = Array.isArray(Y.devices?.devices) ? Y.devices.devices : [];
  sheet.querySelector("#evList").innerHTML = list.length ? list.map(deviceRow).join("") : `<div class="row"><span class="tx"><b>No other devices</b><small>Nothing else is getting InFlite’s notifications</small></span></div>`;
  sheet.querySelector("#evOld").hidden = !list.length;
  for (const b of sheet.querySelectorAll("[data-stop]")) b.addEventListener("click", () => stop(b, root, ctx));
  const go = sheet.querySelector("#evGo");
  go.disabled = false;
  go.onclick = async () => {
    go.disabled = true;
    try {
      const r = await ctx.fanOut();
      if (!current(ctx)) return;
      if (!r) { go.disabled = false; return; }
      // (the tables this phone's in now, as the account's answer names them)
      if (Y.devices) Object.assign(Y.devices, { here: [...new Set([...(Y.devices.asked ? Y.devices.here || [] : []), ...(r.tables || [])])], asked: true });
      const sub = await ctx.sub().catch(() => Y.sub);
      if (!current(ctx)) return;
      Y.sub = sub;
      Y.everyLost = false;
      ctx.closeSheet();
      ctx.toast(r.tables?.includes("pg_push") ? "Every app’s notifications come here now" : "Today’s come here; the others aren’t ready to yet");
      paint(root, ctx);
    } catch (e) { if (!current(ctx)) return; go.disabled = false; if (e.status !== 401) ctx.toast(e.message || "Couldn’t turn it on just now. Try again in a moment."); }
  };
}

// ---------------------------------------------------------------- /#you=<id>: a section of You, or its sheet
export async function goTo(root, ctx, id, drawn) {
  if (!current(ctx)) return;
  const key = id.replace(/^settings-/, "");
  if (key === "notify-weather") return openWxNotify(root, ctx);
  if (key === "emails") return emailPreferences(root,ctx);
  if (["module","account-security"].includes(key)) return ctx.security?.();
  if (key === "notify-mail") return openMailNotifyFrom(ctx);
  if (["weather","fitness","chats","markets","mail"].includes(key)) return ctx.editApp(key);
  if (key === "appearance") return appearance(ctx);
  if (key === "units") return ctx.frame.session.apps.weather ? ctx.editApp("weather",null,"units") : ctx.openAccount("units");
  if (id === "apps" || key === "sharing") return openFolder("apps",root,ctx);
  if (key === "about" || key === "versions") liveVersions(root,ctx);
  if (["quiet","phone","notify","signout"].includes(key)) {
    await drawn;
    if (!current(ctx)) return;
    const target = root.querySelector(({quiet:"#youQuiet",phone:"#youPhone",notify:"#youApps2 :is(input,button,a)",signout:"#youOut"})[key]);
    target?.scrollIntoView({block:"nearest"});
    target?.focus({preventScroll:true});
  }
}

// ---------------------------------------------------------------- Mail Notifications (#sh-mailnotify)
// mailnotify.js's, loaded as it's first wanted; for anyone but the admin it says so itself and asks nothing (S4-D21)
function openMailNotifyFrom(ctx) {
  if (!current(ctx)) return;
  return import("/mailnotify.js").then((m) => current(ctx) && m.openMailNotify(ctx.frame), () => { if (current(ctx)) ctx.toast?.("Couldn’t open Mail Notifications just now. Try again in a moment."); });
}

// ---------------------------------------------------------------- Weather Notifications (#sh-wxnotify)
// From GET /api/notify's weather ({ places: [{ name, lat, lon, rain, warn }], brief, briefAt, email: { warn, brief },
// solar }) and emailOk: a row per place with Rain and Warnings (PATCH { weather: { place: { lat, lon, name, rain, warn }
// } }); the Morning Briefing, Off or one of the places, and its time ({ weather: { brief, briefAt } }); Email for warnings
// and the briefing where the account has an address it can send to ({ weather: { email: { warn, brief } } }); and where
// the solar alert's set, where it lives. No places yet: what to do, and Weather a tap away
const BRIEF_TIMES = Array.from({ length: 21 }, (_, i) => clock(300 + i * 15));
const near = (a, b) => a && b && Math.abs(a.lat - b.lat) < 0.01 && Math.abs(a.lon - b.lon) < 0.01;
export async function openWxNotify(root, ctx) {
  const sheet = document.getElementById("sh-wxnotify");
  if (!sheet || !ctx?.view || !current(ctx)) return;
  const body = sheet.querySelector("#wxnBody");
  if (!Y.notify) body.innerHTML = `<p class="sh-sub">Getting them…</p>`;
  else fillWx(body, root, ctx);
  if (!sheet.open) ctx.openSheet("sh-wxnotify");
  if (!Y.notify) {
    const answer = await ctx.call("/api/notify").catch((e) => (ctx.missing(e) ? false : null));
    if (!current(ctx)) return;
    Y.notify = answer;
    if (sheet.open) fillWx(body, root, ctx);
  }
}
function fillWx(body, root, ctx) {
  const n = Y.notify, w = n?.weather;
  if (!w || typeof w !== "object") {
    body.innerHTML = `<p class="sh-sub">${n === false ? "Weather’s notifications are set in Weather on this account." : "Couldn’t get them just now. Try again in a moment."}</p>`;
    return;
  }
  const places = Array.isArray(w.places) ? w.places : [];
  const out = [];
  if (!places.length) {
    out.push(`<p class="sh-sub wxn-none">Add a place in Weather to choose its rain alerts. Warnings come for every place you add.</p>`,
      `<div class="sh-acts"><a class="ifl-btn primary" href="${esc(ctx.href?.("weather") || "/weather/")}" data-wxn-open>Open Weather</a></div>`);
  } else {
    out.push(`<h3 class="you-h">Places</h3><div class="group glass">${places.map((p, i) => `<div class="row wxn-place" data-wxn-place="${i}"><span class="tx"><b>${esc(p.name || "A place")}</b></span><span class="wxn-chips">${chip(i, "rain", "Rain", p.rain, p.name)}${chip(i, "warn", "Warnings", p.warn, p.name)}</span></div>`).join("")}</div>`);
    const at = places.findIndex((p) => near(p, w.brief)), briefAt = /^\d\d:\d\d$/.test(w.briefAt || "") ? w.briefAt : "07:00";
    const times = BRIEF_TIMES.includes(briefAt) ? BRIEF_TIMES : [...BRIEF_TIMES, briefAt].sort();
    const opt = (v, label, on) => `<option value="${v}" ${on ? "selected" : ""}>${esc(label)}</option>`;
    const said = at >= 0 ? places[at].name || "A place" : "Off";
    out.push(`<h3 class="you-h">Morning Briefing</h3><div class="group glass">
      <label class="row pick"><span class="tx"><b>Morning Briefing</b><small>The day’s weather, once each morning</small></span><span class="val"><span>${esc(said)}</span>${G.down}</span><select id="wxnBrief" aria-label="Morning briefing: off, or a place">${opt("", "Off", at < 0)}${places.map((p, i) => opt(String(i), p.name || "A place", i === at)).join("")}</select></label>
      ${at >= 0 ? `<label class="row pick"><span class="tx"><b>Time</b></span><span class="val"><span>${esc(briefAt)}</span>${G.down}</span><select id="wxnAt" aria-label="Time of the morning briefing">${times.map((t) => opt(t, t, t === briefAt)).join("")}</select></label>` : ""}
    </div>`);
    if (n.emailOk) {
      const em = w.email || {};
      out.push(`<h3 class="you-h">Email</h3><div class="group glass">
        <label class="row"><span class="tx"><b>Email Warnings</b><small>As well as the notification</small></span><input type="checkbox" class="switch" role="switch" id="wxnMailWarn" ${em.warn ? "checked" : ""} aria-label="Email warnings"></label>
        <label class="row"><span class="tx"><b>Email the Briefing</b><small>Each morning, at its time</small></span><input type="checkbox" class="switch" role="switch" id="wxnMailBrief" ${em.brief ? "checked" : ""} aria-label="Email the morning briefing"></label>
      </div>`);
    }
  }
  if (w.solar) out.push(`<p class="sh-sub wxn-solar">Sunshine for your panels: in Weather Settings, Solar</p>`);
  body.innerHTML = out.join("");
  wireWx(body, root, ctx);
}
const chip = (i, k, label, on, name) => `<button type="button" class="ifl-chip action wxn-chip" data-wxn="${k}" data-i="${i}" aria-pressed="${!!on}" aria-label="${esc(`${label} for ${name || "this place"}`)}">${esc(label)}</button>`;
function wireWx(body, root, ctx) {
  const w = Y.notify?.weather || {}, places = Array.isArray(w.places) ? w.places : [];
  const send = async (weather, el) => {
    if (el) el.disabled = true;
    try { const answer = await ctx.call("/api/notify", { method: "PATCH", body: { weather } }); if (!current(ctx)) return; Y.notify = answer; }
    catch (e) { if (!current(ctx)) return; if (e.status !== 401) ctx.toast(e.message); }
    const sheet = document.getElementById("sh-wxnotify");
    if (sheet?.open) {
      const k = el?.dataset?.wxn, i = el?.dataset?.i, id = el?.id;
      fillWx(body, root, ctx);
      // (the focus kept on the same control, drawn again)
      (id ? body.querySelector(`#${id}`) : k ? body.querySelector(`[data-wxn="${k}"][data-i="${i}"]`) : null)?.focus({ preventScroll: true });
    }
    if (root?.isConnected && Y.notify) paint(root, ctx);
  };
  for (const b of body.querySelectorAll("[data-wxn]")) b.addEventListener("click", () => {
    const p = places[Number(b.dataset.i)];
    if (!p) return;
    const now = { rain: !!p.rain, warn: !!p.warn };
    now[b.dataset.wxn] = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(now[b.dataset.wxn]));
    send({ place: { lat: p.lat, lon: p.lon, name: p.name, rain: now.rain, warn: now.warn } }, b);
  });
  const brief = body.querySelector("#wxnBrief"), at = body.querySelector("#wxnAt");
  const briefOf = (v) => { const p = v === "" ? null : places[Number(v)]; return p ? { lat: p.lat, lon: p.lon, name: p.name } : null; };
  brief?.addEventListener("change", () => send({ brief: briefOf(brief.value), briefAt: at?.value || w.briefAt || "07:00" }, brief));
  at?.addEventListener("change", () => send({ brief: briefOf(brief.value), briefAt: at.value }, at));
  const mw = body.querySelector("#wxnMailWarn"), mb = body.querySelector("#wxnMailBrief");
  const mail = (el) => send({ email: { warn: !!mw?.checked, brief: !!mb?.checked } }, el);
  mw?.addEventListener("change", () => mail(mw));
  mb?.addEventListener("change", () => mail(mb));
}
