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
//   photo(user) → the account's picture (its initial under it), turnOn(), turnOff(), fanOut(), toMorning(),
//   openAccount(open), signOut(), chatSettings(), canPush(), pushWhy(), openSheet(id), closeSheet(), BUILD,
//   frame (F), connectors() → the framework's connectors.js, connector(app) → its sheet for that app, icon(app) → its icon's address,
//   go(path) → a screen of the framework's, href(app, section) → an app's address from here (IFL.hub.href)
//   forgetYou() → nothing: what You last asked forgotten (signed out, or another account)
//   goTo(root, ctx, id, drawn) → /#you=<id>: its section scrolled to (notify, apps, quiet, rules, phone, account,
//   signout), or its sheet (notify-weather, notify-mail), once drawn (drawYou's promise)
//   openWxNotify(root, ctx) → the Weather Notifications sheet
import { esc, G } from "/cards.js";

const LEVELS = [["do", "Do"], ["suggest", "Suggest"], ["quiet", "Quiet"]];
const APPS = [["today", "Today"], ["chat", "Chat"], ["weather", "Weather"], ["fitness", "Fitness"], ["markets", "Markets"]];
const NAMES = { chat: "Chat", weather: "Weather", fitness: "Fitness", markets: "Markets", today: "Today", mail: "Mail" };
const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hh = (h) => `${String(h).padStart(2, "0")}:00`;
const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London"; } catch { return "Europe/London"; } };
const and = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

// what You shows, as last asked (each null until asked; false where this account side hasn't it; sub: this phone's
// subscription, as the browser has it)
const Y = { rules: null, notify: null, devices: null, sub: null, shares: null, sharesRoof: null };
let drawing = null;
export function forgetYou() { Y.rules = Y.notify = Y.devices = Y.sub = Y.shares = null; drawing = null; }
// (Connected Apps: each app, and the words of InFlite's connector contract its descriptor fills, and only those)
const CONNECTED = [["weather", "Weather"], ["chats", "Chats"], ["fitness", "Fitness"], ["markets", "Markets"], ["mail", "Mail"]];
const WORDS = [["cards", "Cards"], ["search", "Search"], ["notifications", "Notifications"], ["actions", "Actions"], ["screens", "Screens"]];
// (kept for the roof as it was when they were worked out: Weather's words aren't the same with it off)
const roofOf = (ctx) => !!(ctx.hub && ctx.roof);
async function sharesOf(ctx) {
  const roof = roofOf(ctx);
  if ((Y.shares && Y.sharesRoof === roof) || typeof ctx.connectors !== "function") return;
  const m = await ctx.connectors().catch(() => null);
  if (!m) return;
  const out = {};
  for (const [app] of CONNECTED) {
    const c = await Promise.resolve(m.connectorOf(app, ctx.frame)).catch(() => null);
    const s = c?.shares && typeof c.shares === "object" ? c.shares : null;
    out[app] = s ? WORDS.filter(([k]) => typeof s[k] === "string" && s[k]).map(([, w]) => w).join(" · ") : "";
  }
  Y.shares = out; Y.sharesRoof = roof;
}

// This Phone's switch: on where the account has this phone for Today's morning (td_push), as the account says: GET
// /api/devices' here (asked with this phone's name), else the morning's thisDevice; only where neither says, this
// browser's own word (the endpoint it last handed the account). Never the subscription alone: turned off, it's kept,
// so turning on again is one tap
function phoneOn(ctx) {
  const sub = Y.sub;
  if (!sub || (typeof Notification !== "undefined" && Notification.permission !== "granted")) return false;
  if (Array.isArray(Y.devices?.here) && Y.devices.asked) return Y.devices.here.includes("td_push");
  const t = ctx.morning?.thisDevice;
  if (typeof t === "boolean") return t;
  return !!sub.endpoint && ctx.kept?.() === sub.endpoint;
}

export async function drawYou(root, ctx) {
  if (!root || !ctx?.view) return;
  // (drawn at once with what's known, then again as each answer comes)
  paint(root, ctx);
  const ask = (path) => ctx.call(path).catch((e) => (ctx.missing(e) ? false : null));
  const sub = (Y.sub = await ctx.sub().catch(() => null));
  const dev = sub && ctx.device?.() ? `?device=${encodeURIComponent(ctx.device())}` : "";
  const run = (drawing = Promise.all([ask("/api/rules"), ask("/api/notify"), ctx.hub ? ask(`/api/devices${dev}`) : Promise.resolve(false), sharesOf(ctx).catch(() => {})]));
  const [rules, notify, devices] = await run;
  if (drawing !== run) return;
  Y.rules = rules; Y.notify = notify; Y.devices = devices && typeof devices === "object" ? { ...devices, asked: !!dev } : devices;
  paint(root, ctx);
}

function paint(root, ctx) {
  const u = ctx.view.user || {}, admin = ctx.view.apps?.mail === true;
  const sec = (id, title, body, foot = "") => body ? `<section class="you-sec" id="${id}"><h2 class="you-h">${esc(title)}</h2><div class="group glass">${body}</div>${foot ? `<p class="you-foot">${foot}</p>` : ""}</section>` : "";
  const row = (k, b, small, end = "") => `<div class="row" data-k="${k}"><span class="tx"><b>${esc(b)}</b>${small ? `<small>${esc(small)}</small>` : ""}</span>${end}</div>`;
  const go = (attrs, b, small, val = "") => `<button class="row go" type="button" ${attrs}><span class="tx"><b>${esc(b)}</b>${small ? `<small>${esc(small)}</small>` : ""}</span>${val ? `<span class="val">${esc(val)}</span>` : ""}<span class="chev">${G.chev}</span></button>`;
  const sw = (attrs, b, small, on, aria, extra = "") => `<label class="row"${extra}><span class="tx"><b>${esc(b)}</b>${small ? `<small>${esc(small)}</small>` : ""}</span><input type="checkbox" class="switch" role="switch" ${attrs} ${on ? "checked" : ""} aria-label="${esc(aria)}"></label>`;
  const pick = (attrs, b, small, opts, on, aria, extra = "") => `<label class="row pick"${extra}><span class="tx"><b>${esc(b)}</b>${small ? `<small data-line>${esc(small)}</small>` : ""}</span><span class="val"><span>${esc((opts.find(([v]) => v === on) || opts[0])[1])}</span>${G.down}</span><select ${attrs} aria-label="${esc(aria)}">${opts.map(([v, l]) => `<option value="${v}" ${v === on ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const out = [];
  // Account
  const photo = typeof ctx.photo === "function" ? ctx.photo(u) : esc([...String(u.first || u.name || "?")][0] || "?");
  out.push(sec("youAccount", "Account", `<button class="row go" type="button" id="youAcct"><span class="you-ph" aria-hidden="true">${photo}</span><span class="tx"><b>${esc(u.name || u.handle || "Your account")}</b><small>Password, Passkeys and Devices</small></span><span class="chev">${G.chev}</span></button>`));
  // Notifications: this phone, Today's morning, quiet hours
  const n = Y.notify;
  {
    const why = ctx.pushWhy?.(), rows = [];
    rows.push(sw(`id="youPhone"${why ? " disabled" : ""}`, "On This Phone", why || "Today’s morning, and what you choose below", phoneOn(ctx), "Notifications on this phone", ` id="youPhoneRow"`));
    const here = Array.isArray(Y.devices?.here) ? Y.devices.here : [];
    if (ctx.hub && ctx.view.hubPush === true && Y.devices !== false) {
      rows.push(here.includes("pg_push") ? row("every", "Every App Notifies Here", "Chats, Weather and Markets as well as Today")
        : go(`id="youEvery"`, "Get Every App’s Here", "Chats, Weather and Markets as well as Today"));
    }
    const t = (n && n.today) || ctx.morning || {};
    rows.push(go(`id="youMorning"`, "Today’s Morning", "One notification, from all your apps", t.on ? clock(Number.isInteger(t.at) ? t.at : 420) : "Off"));
    if (n) {
      const q = { on: false, from: 22, to: 7, ...(n.quiet || {}) };
      const hours = Array.from({ length: 24 }, (_, h) => [String(h), hh(h)]);
      rows.push(sw(`id="youQuiet"`, "Quiet Hours", "Every app, but warnings", q.on, "Quiet hours"));
      if (q.on) rows.push(pick(`id="youQfrom"`, "From", "", hours, String(q.from), "Quiet hours from", ` data-k="qfrom"`), pick(`id="youQto"`, "To", "", hours, String(q.to), "Quiet hours to", ` data-k="qto"`));
    }
    out.push(sec("youNotify", "Notifications", rows.join("")));
  }
  // From each app
  if (n !== false) {
    let body;
    if (!n) body = row("notify", "From Each App", "Getting them…");
    else {
      const chatOn = !!n.chat?.kinds?.messages;
      const places = Array.isArray(n.weather?.places) ? n.weather.places : [];
      const rainOn = places.length > 0 && places.every((p) => p.rain);
      const mktOn = !(n.markets?.off === true), wrapOn = n.markets?.wrap !== false;
      body = [
        sw(`data-k="chat"`, "Chats", "Who wrote, never the words", chatOn, "Chats notifications", ` data-app="chat"`),
        go(`id="youWx" data-k="weather"`, "Weather", "Rain and warnings for your places", places.length ? (rainOn ? "On" : places.some((p) => p.rain) ? "Some" : "Off") : ""),
        sw(`data-k="alerts"`, "Markets Alerts", "When a price you watch moves", mktOn, "Markets price alerts", ` data-app="markets"`),
        sw(`data-k="wrap"`, "Evening Wrap", "How your holdings did, each weekday", wrapOn, "Markets: the Evening Wrap", ` data-app="markets"`),
        ctx.frame?.session?.apps?.fitness === true
          ? `<a class="row go" href="${esc(ctx.href?.("fitness", "settings") || "/fitness/#settings")}" data-k="fitness" data-app="fitness"><span class="tx"><b>Fitness</b><small>In Today’s morning</small></span><span class="chev">${G.chev}</span></a>`
          : row("fitness", "Fitness", "In Today’s morning"),
        admin ? go(`id="youMail" data-k="mail" data-app="mail"`, "Mail", "Through InFlite, and which addresses") : "",
      ].join("");
    }
    out.push(sec("youApps2", "From Each App", body));
  }
  // Rules: what Today may do for you, each Do, Suggest or Quiet (the ones still to come left out)
  if (Y.rules !== false) {
    const rules = (Y.rules?.rules || []).filter((r) => !r.soon);
    const body = !Y.rules ? row("rules", "Rules", "Getting them…") : rules.map((r) =>
      pick(`data-rulepick="${esc(r.rule)}"`, r.name, r.line || "", LEVELS, r.level, `${r.name}: Do, Suggest or Quiet`, ` data-rule="${esc(r.rule)}"`)).join("");
    out.push(sec("youRules", "What Today Does for You", body, "Do: it acts and tells you. Suggest: it asks first. Quiet: it leaves it. Undo one and it drops a level; ten kept and it climbs."));
  }
  // Connected Apps
  {
    const body = CONNECTED.filter(([app]) => app !== "mail" || admin).map(([app, name]) => {
      const src = typeof ctx.icon === "function" ? ctx.icon(app === "chats" ? "chat" : app) : "";
      const words = Y.shares && Y.sharesRoof === roofOf(ctx) ? Y.shares[app] : null;
      return `<button class="row go conn" type="button" data-app="${app}" aria-label="${esc(`${name}’s connector${words ? `: ${words}` : ""}`)}"><span class="ic app">${src ? `<img src="${esc(src)}" alt="" width="28" height="28">` : ""}</span><span class="tx"><b>${esc(name)}</b><small>${esc(words ?? "")}</small></span><span class="chev">${G.chev}</span></button>`;
    }).join("");
    out.push(sec("youApps", "Connected Apps", body, "Each app keeps its own server and data. This is all it shares with InFlite."));
  }
  // Other devices
  const list = Array.isArray(Y.devices?.devices) ? Y.devices.devices : [];
  if (ctx.hub && Y.devices && list.length) out.push(sec("youDevices", "Other Devices", list.map(deviceRow).join("")));
  // Chat
  out.push(sec("youChat", "Chat", go(`id="youChatGo"`, "Chat Settings", "Typing, Pigeons, Names on the Lock Screen")));
  // About: each app's version, as each last said it here
  const ver = APPS.map(([k, name]) => {
    let b = k === "today" ? ctx.BUILD : null;
    try { b ||= localStorage.getItem(`ifl-build:${k}`); } catch {}
    return row(`v-${k}`, name, null, `<span class="val">${b ? `V${esc(b)}` : "—"}</span>`);
  }).join("");
  out.push(sec("youVersions", "About InFlite", ver));
  out.push(`<section class="you-sec you-out"><div class="group glass"><button class="row you-signout" type="button" id="youOut">Sign Out</button></div></section>`);
  root.innerHTML = out.join("");
  wire(root, ctx);
}

function deviceRow(d) {
  const apps = (Array.isArray(d.apps) ? d.apps : []).map((a) => NAMES[a]).filter(Boolean);
  const sub = [apps.length ? and(apps) : "", d.home ? "on its Home Screen" : ""].filter(Boolean).join(", ");
  return `<div class="row dev" data-dev="${esc(d.id)}"><span class="tx"><b>${esc(d.label || "Another device")}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><button class="pill small" type="button" data-stop="${esc(d.id)}" aria-label="${esc(`Stop There: ${d.label || "another device"}`)}">Stop There</button></div>`;
}

function wire(root, ctx) {
  const $ = (s) => root.querySelector(s);
  $("#youAcct")?.addEventListener("click", () => ctx.openAccount());
  $("#youMorning")?.addEventListener("click", () => ctx.toMorning());
  $("#youChatGo")?.addEventListener("click", () => ctx.chatSettings());
  $("#youOut")?.addEventListener("click", (e) => { e.currentTarget.disabled = true; ctx.signOut(); });
  // (a rule's level: Do, Suggest or Quiet, set by you)
  for (const sel of root.querySelectorAll("[data-rulepick]")) sel.addEventListener("change", async () => {
    const rule = sel.dataset.rulepick, level = sel.value, r = sel.closest("[data-rule]"), rec = Y.rules?.rules?.find((x) => x.rule === rule);
    if (!rec || rec.level === level) return;
    const was = rec.level, shown = r.querySelector(".val > span");
    const say = (v) => { shown.textContent = (LEVELS.find(([k]) => k === v) || LEVELS[0])[1]; sel.value = v; };
    rec.level = level; say(level);
    try {
      const a = await ctx.call("/api/rules", { method: "PUT", body: { rule, level } });
      Object.assign(rec, { level: a.level || level, setBy: "you", line: a.line ?? rec.line });
      const ln = r.querySelector("[data-line]"); if (ln) ln.textContent = rec.line || "";
    } catch (e) { rec.level = was; say(was); if (e.status !== 401) ctx.toast(e.message); }
  });
  // (notifications by app: each a part of the account's settings, as its own page sets them)
  // (a switch that's a part of the account's notify settings: PATCH it, drawn again from the answer)
  const flip = (sel, body) => root.querySelector(sel)?.addEventListener("change", async (e) => {
    const box = e.target, on = box.checked;
    box.disabled = true;
    try { Y.notify = await ctx.call("/api/notify", { method: "PATCH", body: body(on) }); }
    catch (err) { box.checked = !on; box.disabled = false; if (err.status === 401) return; ctx.toast(err.message); return; }
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
      .then((a) => { Y.notify = a; return true; }, (e) => { if (e.status !== 401) ctx.toast(e.message); return e.status !== 401; })
      .then((draw) => draw && paint(root, ctx));
  };
  $("#youQuiet")?.addEventListener("change", (e) => quiet({ on: e.target.checked }));
  $("#youQfrom")?.addEventListener("change", (e) => quiet({ from: Number(e.target.value) }));
  $("#youQto")?.addEventListener("change", (e) => quiet({ to: Number(e.target.value) }));
  // (this phone: on, from a tap; off, taken out of every app's table. Done, what's known here says so at once (off: in
  // none of them; on: Today's morning), and the account's asked again)
  $("#youPhone")?.addEventListener("change", async (e) => {
    const sw = e.target, on = sw.checked;
    sw.disabled = true;
    const ok = await (on ? ctx.turnOn() : ctx.turnOff()).catch(() => false);
    sw.disabled = false;
    if (!ok) { sw.checked = !on; return; }
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
    if (Y.devices?.devices) Y.devices.devices = Y.devices.devices.filter((d) => d.id !== id);
    ctx.toast("Stopped there");
  } catch (e) { b.disabled = false; if (e.status !== 401) ctx.toast(e.message); return; }
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
      if (!r) { go.disabled = false; return; }
      // (the tables this phone's in now, as the account's answer names them)
      if (Y.devices) Object.assign(Y.devices, { here: [...new Set([...(Y.devices.asked ? Y.devices.here || [] : []), ...(r.tables || [])])], asked: true });
      Y.sub = await ctx.sub().catch(() => Y.sub);
      ctx.closeSheet();
      ctx.toast(r.tables?.includes("pg_push") ? "Every app’s notifications come here now" : "Today’s come here; the others aren’t ready to yet");
      paint(root, ctx);
    } catch (e) { go.disabled = false; if (e.status !== 401) ctx.toast(e.message || "Couldn’t turn it on just now. Try again in a moment."); }
  };
}

// ---------------------------------------------------------------- /#you=<id>: a section of You, or its sheet
const SECTIONS = { notify: "youApps2", apps: "youApps", quiet: "youNotify", rules: "youRules", phone: "youNotify", account: "youAccount", versions: "youVersions" };
export async function goTo(root, ctx, id, drawn) {
  if (!root || !id) return;
  if (id === "notify-weather") return openWxNotify(root, ctx);
  if (id === "notify-mail") return openMailNotifyFrom(ctx);
  const at = () => (id === "signout" ? root.querySelector(".you-out") : SECTIONS[id] ? root.querySelector(`#${SECTIONS[id]}`) : null);
  // (a section drawn only once its answer's in, Quiet Hours: waited for)
  if (!at()) await Promise.resolve(drawn).catch(() => {});
  const el = at();
  if (!el) return;
  el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const h = el.querySelector(".you-h, button");
  if (h) { if (!h.matches("button")) h.tabIndex = -1; h.focus({ preventScroll: true }); }
}

// ---------------------------------------------------------------- Mail Notifications (#sh-mailnotify)
// mailnotify.js's, loaded as it's first wanted; for anyone but the admin it says so itself and asks nothing (S4-D21)
function openMailNotifyFrom(ctx) {
  return import("/mailnotify.js").then((m) => m.openMailNotify(ctx.frame), () => ctx.toast?.("Couldn’t open Mail Notifications just now. Try again in a moment."));
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
  if (!sheet || !ctx?.view) return;
  const body = sheet.querySelector("#wxnBody");
  if (!Y.notify) body.innerHTML = `<p class="sh-sub">Getting them…</p>`;
  else fillWx(body, root, ctx);
  if (!sheet.open) ctx.openSheet("sh-wxnotify");
  if (!Y.notify) {
    Y.notify = await ctx.call("/api/notify").catch((e) => (ctx.missing(e) ? false : null));
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
    try { Y.notify = await ctx.call("/api/notify", { method: "PATCH", body: { weather } }); }
    catch (e) { if (e.status !== 401) ctx.toast(e.message); }
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
