// InFlite's You (spec §10, §11.3, §11.5): a view of the one page at inflite.ai (/#you). Your account; the rules Today
// acts by, each at Do, Suggest or Quiet, with its record (GET/PUT /api/rules); notifications, by app (GET/PATCH
// /api/notify); this phone (its one subscription: Today's morning, and, from a tap of its own, every app's: POST
// /api/device { sub, fan: true }); other devices still getting notifications, each with Stop There (GET/DELETE
// /api/devices); quiet hours; Chat's own settings; each app's version; and Sign Out.
// An account side from before (a route answering 404 or 501): Rules, Notifications by App, Quiet Hours and Other Devices
// left out, and This Phone as Today's morning alone. Where the hub can't serve the apps yet (degraded): no Get Every
// App's Notifications Here and no Other Devices, which only the hub has.
//   drawYou(root, ctx) → a promise, once it's drawn: ctx is the page's (app.js youCtx): view, hub, call(path, o),
//   missing(e), toast(text), morning (the morning's view as the page has it now), sub() → this phone's subscription,
//   device() → its name for the account, kept() → the endpoint this browser last handed the account (today:push),
//   photo(user) → the account's picture (its initial under it), turnOn(), turnOff(), fanOut(), toMorning(),
//   openAccount(open), signOut(), chatSettings(), canPush(), pushWhy(), openSheet(id), closeSheet(), BUILD
//   forgetYou() → nothing: what You last asked forgotten (signed out, or another account)
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
const Y = { rules: null, notify: null, devices: null, sub: null };
let drawing = null;
export function forgetYou() { Y.rules = Y.notify = Y.devices = Y.sub = null; drawing = null; }

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
  const run = (drawing = Promise.all([ask("/api/rules"), ask("/api/notify"), ctx.hub ? ask(`/api/devices${dev}`) : Promise.resolve(false)]));
  const [rules, notify, devices] = await run;
  if (drawing !== run) return;
  Y.rules = rules; Y.notify = notify; Y.devices = devices && typeof devices === "object" ? { ...devices, asked: !!dev } : devices;
  paint(root, ctx);
}

function paint(root, ctx) {
  const u = ctx.view.user || {}, admin = ctx.view.apps?.mail === true;
  const sec = (id, title, body, foot = "") => `<section class="you-sec" id="${id}"><h2 class="you-h">${esc(title)}</h2><div class="group glass">${body}</div>${foot ? `<p class="you-foot">${foot}</p>` : ""}</section>`;
  const row = (k, b, small, end = "") => `<div class="row" data-k="${k}"><span class="tx"><b>${esc(b)}</b>${small ? `<small>${esc(small)}</small>` : ""}</span>${end}</div>`;
  const seg = (k, opts, on, label) => `<div class="seg" role="group" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button type="button" data-${k}="${v}" aria-pressed="${v === on}">${esc(l)}</button>`).join("")}</div>`;
  const out = [];
  // Account
  const photo = typeof ctx.photo === "function" ? ctx.photo(u) : esc([...String(u.first || u.name || "?")][0] || "?");
  out.push(sec("youAccount", "Account", `<button class="row go" type="button" id="youAcct"><span class="you-ph" aria-hidden="true">${photo}</span><span class="tx"><b>${esc(u.name || u.handle || "Your account")}</b><small>Password, Passkeys and Devices</small></span><span class="chev">${G.chev}</span></button>`));
  // Rules
  if (Y.rules !== false) {
    const rules = Y.rules?.rules || [];
    const body = !Y.rules ? row("rules", "Rules", "Getting them…") : rules.map((r) => r.soon
      ? row(`rule-${r.rule}`, r.name, r.line || "Coming in a later version", `<span class="val soon">Coming</span>`)
      : `<div class="row rule" data-rule="${esc(r.rule)}"><span class="tx"><b>${esc(r.name)}</b><small data-line>${esc(r.line || "")}</small></span>${seg("level", LEVELS, r.level, `${r.name}: Do, Suggest or Quiet`)}</div>`).join("");
    out.push(sec("youRules", "Rules", body, "A rule drops a level when you undo it, and climbs after ten kept actions."));
  }
  // Notifications, by app
  const n = Y.notify;
  if (n !== false) {
    let body;
    if (!n) body = row("notify", "Notifications", "Getting them…");
    else {
      const chatOn = !!n.chat?.kinds?.messages;
      const places = Array.isArray(n.weather?.places) ? n.weather.places : [];
      const rainOn = places.length > 0 && places.every((p) => p.rain);
      const mktOn = !(n.markets?.off === true);
      const t = n.today || ctx.morning || {};
      body = [
        row("chat", "Friends and Groups", "Never the words", seg("chat", [["all", "All"], ["off", "Off"]], chatOn ? "all" : "off", "Friends and Groups: All or Off")),
        places.length ? row("weather", "Weather", "Rain · Warnings always", seg("rain", [["all", "All"], ["off", "Off"]], rainOn ? "all" : "off", "Weather’s rain: All or Off")) : row("weather", "Weather", "Warnings always · Rain for the places you choose in Weather"),
        row("markets", "Markets", "Your alerts and the evening’s wrap", seg("alerts", [["on", "Alerts"], ["off", "Off"]], mktOn ? "on" : "off", "Markets: Alerts or Off")),
        row("fitness", "Fitness", "In Today’s morning"),
        `<button class="row go" type="button" id="youMorning"><span class="tx"><b>Today’s Morning</b><small>One notification, from all your apps</small></span><span class="val">${t.on ? clock(Number.isInteger(t.at) ? t.at : 420) : "Off"}</span><span class="chev">${G.chev}</span></button>`,
        admin ? row("mail", "Mail", "From Mail’s own app for now") : "",
      ].join("");
    }
    out.push(sec("youNotify", "Notifications, by App", body));
  }
  // This Phone
  {
    const why = ctx.pushWhy?.();
    const rows = [`<label class="row" id="youPhoneRow"><span class="tx"><b>Notifications Here</b><small>${esc(why || "InFlite on this phone: Today’s morning, and what you choose")}</small></span><input type="checkbox" class="switch" role="switch" id="youPhone" ${phoneOn(ctx) ? "checked" : ""} ${why ? "disabled" : ""} aria-label="Notifications on this phone"></label>`];
    const here = Array.isArray(Y.devices?.here) ? Y.devices.here : [];
    if (ctx.hub && ctx.view.hubPush === true && Y.devices !== false) {
      const all = here.includes("pg_push");
      rows.push(all ? row("every", "Every App’s Notifications", "Chats, Weather and Markets notify you here")
        : `<button class="row go" type="button" id="youEvery"><span class="tx"><b>Get Every App’s Notifications Here</b><small>Chats, Weather and Markets as well as Today</small></span><span class="chev">${G.chev}</span></button>`);
    }
    out.push(sec("youPhone", "This Phone", rows.join("")));
  }
  // Other Devices Getting Notifications
  const list = Array.isArray(Y.devices?.devices) ? Y.devices.devices : [];
  if (ctx.hub && Y.devices) {
    const body = list.length ? list.map(deviceRow).join("") : row("none", "None", "Only this phone gets InFlite’s notifications");
    out.push(sec("youDevices", "Other Devices Getting Notifications", body));
  }
  // Quiet Hours
  if (n) {
    const q = { on: false, from: 22, to: 7, ...(n.quiet || {}) };
    const pick = (k, v, label) => `<label class="row pick" data-k="q${k}"><span class="tx"><b>${label}</b></span><span class="val"><span>${esc(hh(Number(v)))}</span>${G.down}</span><select id="youQ${k}" aria-label="Quiet hours ${label.toLowerCase()}">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === v ? "selected" : ""}>${hh(h)}</option>`).join("")}</select></label>`;
    const body = `<label class="row"><span class="tx"><b>Quiet Hours</b><small>Every app, but warnings</small></span><input type="checkbox" class="switch" role="switch" id="youQuiet" ${q.on ? "checked" : ""} aria-label="Quiet hours"></label>` + (q.on ? pick("from", q.from, "From") + pick("to", q.to, "To") : "");
    out.push(sec("youQuietSec", "Quiet Hours", body));
  }
  // Chat
  out.push(sec("youChat", "Chat", `<button class="row go" type="button" id="youChatGo"><span class="tx"><b>Chat Settings</b><small>Show When I’m Typing, Pigeons, Names on the Lock Screen</small></span><span class="chev">${G.chev}</span></button>`));
  // InFlite: each app's version, as each last said it here
  const ver = APPS.map(([k, name]) => {
    let b = k === "today" ? ctx.BUILD : null;
    try { b ||= localStorage.getItem(`ifl-build:${k}`); } catch {}
    return row(`v-${k}`, name, null, `<span class="val">${b ? `V${esc(b)}` : "Not opened here yet"}</span>`);
  }).join("");
  out.push(sec("youVersions", "InFlite", ver));
  out.push(`<div class="you-out"><button class="pill you-signout" type="button" id="youOut">Sign Out</button></div>`);
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
  for (const b of root.querySelectorAll("[data-level]")) b.addEventListener("click", async () => {
    const r = b.closest("[data-rule]"), rule = r.dataset.rule, level = b.dataset.level, rec = Y.rules?.rules?.find((x) => x.rule === rule);
    if (!rec || rec.level === level) return;
    const was = rec.level;
    rec.level = level; pressed(r, "level", level);
    try {
      const a = await ctx.call("/api/rules", { method: "PUT", body: { rule, level } });
      Object.assign(rec, { level: a.level || level, setBy: "you", line: a.line ?? rec.line });
      r.querySelector("[data-line]").textContent = rec.line || "";
    } catch (e) { rec.level = was; pressed(r, "level", was); if (e.status !== 401) ctx.toast(e.message); }
  });
  // (notifications by app: each a part of the account's settings, as its own page sets them)
  const patch = async (body, k, v, back) => {
    pressed(root.querySelector(`[data-k="${k}"]`), k === "chat" ? "chat" : k === "weather" ? "rain" : "alerts", v);
    try { Y.notify = await ctx.call("/api/notify", { method: "PATCH", body }); }
    catch (e) { back(); if (e.status !== 401) ctx.toast(e.message); }
    paint(root, ctx);
  };
  for (const b of root.querySelectorAll("[data-chat]")) b.addEventListener("click", () => {
    const on = b.dataset.chat === "all", kinds = Y.notify?.chat?.kinds || { messages: true };
    patch({ chat: Object.fromEntries(Object.keys(kinds).map((k) => [k, on])) }, "chat", b.dataset.chat, () => {});
  });
  for (const b of root.querySelectorAll("[data-rain]")) b.addEventListener("click", async () => {
    const on = b.dataset.rain === "all", places = Y.notify?.weather?.places || [];
    pressed(root.querySelector('[data-k="weather"]'), "rain", b.dataset.rain);
    try { for (const p of places) Y.notify = await ctx.call("/api/notify", { method: "PATCH", body: { weather: { place: { lat: p.lat, lon: p.lon, name: p.name, rain: on } } } }); }
    catch (e) { if (e.status !== 401) ctx.toast(e.message); }
    paint(root, ctx);
  });
  for (const b of root.querySelectorAll("[data-alerts]")) b.addEventListener("click", () => patch({ markets: { alerts: b.dataset.alerts === "on" } }, "markets", b.dataset.alerts, () => {}));
  // (quiet hours: on or off, from and to, for every app)
  const quiet = (q) => {
    const now = { on: false, from: 22, to: 7, ...(Y.notify?.quiet || {}), ...q };
    return ctx.call("/api/notify", { method: "PATCH", body: { quiet: { on: now.on, from: now.from, to: now.to, tz: now.tz || browserTz() } } })
      .then((a) => { Y.notify = a; }, (e) => { if (e.status !== 401) ctx.toast(e.message); })
      .then(() => paint(root, ctx));
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
  if (sheet?.classList.contains("on")) fillEvery(sheet, root, ctx);
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
