// Today's bell: the notifications this phone's been shown, in a sheet from the header's pill (beside Search and Edit).
// The list is the root worker's (sw.js: its log, with those still in Notification Centre merged in), asked for by
// message ({ ifl: "notes" }, answered on a port) and told again by the worker as one comes or goes. The bell's count and
// the Home Screen badge are one number: the unseen ones. Opening the sheet marks every one seen (those that weren't
// keep a dot while it's open); a row stays until it's cleared (swiped either way, its Clear button, Delete, or Clear
// All: the toast's Undo puts it back), or tapped: then it's cleared and opens where it came from, through the frame's
// own navigation, as a tap in Notification Centre does.
// The rows by day (Today, Yesterday, Earlier); several from one app that open in the same place (a conversation, a
// share, a place's weather) on the same day are one row, the newest, with "+2" to show the rest; cleared or tapped, a
// stack goes as one.
//   createBell(F, { count(n), go(url), settings(), actions(note) → [{ id, label, icon?, run() }] }) → { open(), refresh(), destroy() }
//   when(at, now, spoken) → "Now" | "5m" | "11:02" | "Yesterday" | "Mon" | "7 Nov"
//   group(list, now) → [{ key: "today" | "yesterday" | "earlier", label, stacks: [{ key, head, rest }] }]
//   draw(box, list, { ui, now, fresh, shown, open(ns), clear(ns, row, dir), more(key) })
// Nothing here but builders through F.ui (data as text only) and custom properties set by setProperty; no storage of
// its own.

const DAY = 864e5;
const fmt = (o) => new Intl.DateTimeFormat(undefined, o);
const startOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const daysAgo = (at, now) => Math.round((startOf(now) - startOf(at)) / DAY);
const NAME = { chat: "Chat", chats: "Chat", weather: "Weather", markets: "Markets", fitness: "Fitness", mail: "Mail", today: "Today", account: "Account" };
// (as it's shown, or as VoiceOver says it: "5 minutes ago", "Monday", "7 November")
export function when(at, now = Date.now(), spoken = false) {
  const s = (now - at) / 1000, days = daysAgo(at, now);
  if (s < 60) return spoken ? "Just now" : "Now";
  if (s < 3600) { const m = Math.floor(s / 60); return spoken ? `${m} minute${m === 1 ? "" : "s"} ago` : `${m}m`; }
  if (days <= 0) return fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  if (days === 1) return "Yesterday";
  if (days < 7) return fmt({ weekday: spoken ? "long" : "short" }).format(at);
  return fmt({ day: "numeric", month: spoken ? "long" : "short" }).format(at);
}

// the list (newest first) by day, and in each day those of one app that open in the same place as one stack
const LABEL = { today: "Today", yesterday: "Yesterday", earlier: "Earlier" };
export function group(list, now = Date.now()) {
  const secs = [];
  for (const n of list) {
    const d = daysAgo(n.at, now), k = d <= 0 ? "today" : d === 1 ? "yesterday" : "earlier";
    let s = secs.find((x) => x.key === k);
    if (!s) secs.push(s = { key: k, label: LABEL[k], stacks: [] });
    const by = n.url ? `${n.app}|${n.url}|${startOf(n.at)}` : "";
    const st = by && s.stacks.find((x) => x.key === by);
    if (st) st.rest.push(n);
    else s.stacks.push({ key: by || `id|${n.id}`, head: n, rest: [] });
  }
  return secs;
}

// the list into box: a section a day, a row a stack (or, with the stack shown, a row each), or the bell and "No
// notifications"; fresh: the ids unseen as the sheet opened (a dot); shown: the stacks opened out
export function draw(box, list, { ui, now = Date.now(), fresh = new Set(), shown = new Set(), open, clear, more = () => {}, actions = () => [], act = (_n, action) => action.run() }) {
  if (!list.length) return box.replaceChildren(ui.el("div", { class: "ifl-nt-none", role: "status" }, ui.icon("bell"), ui.el("p", { text: "No notifications" })));
  const row = (n, ns, st, sub) => {
    const k = ns.length - 1, isNew = ns.some((x) => fresh.has(x.id)), app = NAME[n.app] || "";
    const say = [isNew ? "New" : "", n.title, n.body, [app, when(n.at, now, true)].filter(Boolean).join(", "), k ? `${k} more` : ""].filter(Boolean).join(". ");
    const main = ui.el("button", { class: "ifl-nt-main", type: "button", "aria-label": say },
      ui.icon(null, { app: n.app === "chats" ? "chat" : n.app, size: 40 }),
      ui.el("span", { class: "ifl-nt-tx" },
        ui.el("span", { class: "ifl-nt-top" }, ui.el("b", { class: "ifl-nt-t", text: n.title || "" }),
          ui.el("span", { class: "ifl-nt-meta" }, app ? ui.el("span", { class: "ifl-nt-app", text: app }) : null, ui.el("time", { class: "ifl-nt-when", datetime: new Date(n.at).toISOString(), text: when(n.at, now) }))),
        n.body ? ui.el("span", { class: "ifl-nt-b", text: n.body }) : null));
    const x = ui.el("button", { class: "ifl-nt-x", type: "button", "aria-label": "Clear", title: "Clear" }, ui.icon("x"));
    const plus = st && st.rest.length && !sub
      ? ui.el("button", { class: "ifl-nt-more", type: "button", "aria-expanded": String(shown.has(st.key)), "aria-label": `${st.rest.length} more`, title: `${st.rest.length} more` },
        shown.has(st.key) ? ui.icon("chev") : ui.el("span", { text: `+${st.rest.length}` }))
      : null;
    const card = ui.el("div", { class: "ifl-nt-card" }, main, plus, x);
    let offered = [];
    try { const value = actions(n); if (Array.isArray(value)) offered = value.filter(a => a && typeof a.id === "string" && /^[a-z][a-z0-9-]{0,47}$/.test(a.id) && typeof a.label === "string" && a.label.trim() && typeof a.run === "function").slice(0, 3); } catch (_) {}
    if (offered.length) {
      card.classList.add("has-actions");
      card.append(ui.el("div", { class: "ifl-nt-actions", role: "group", "aria-label": "Notification actions" }, ...offered.map(a => {
        const button = ui.el("button", { class: "ifl-nt-action", type: "button", "aria-label": `${a.label.slice(0, 80)} · ${String(n.title || app).slice(0, 120)}` }, a.icon ? ui.icon(a.icon) : null, ui.el("span", { text: a.label.slice(0, 80) }));
        button.addEventListener("click", () => { if (!li.dataset.dragged && !li.classList.contains("gone")) act(ns, a, li); });
        return button;
      })));
    }
    const side = () => ui.el("span", {}, ui.icon("trash"), ui.el("span", { text: "Clear" }));
    const li = ui.el("li", { class: `ifl-nt-row${k ? " stack" : ""}${sub ? " sub" : ""}`, data: { id: n.id, stack: st?.key || null, fresh: isNew ? "1" : null } },
      ui.el("div", { class: "ifl-nt-back", "aria-hidden": "true" }, side(), side()), card);
    main.addEventListener("click", () => { if (!li.dataset.dragged) open(ns, li); });
    main.addEventListener("keydown", (e) => { if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); clear(ns, li); } });
    x.addEventListener("click", () => clear(ns, li));
    plus?.addEventListener("click", () => more(st.key));
    swipe(li, card, () => clear(ns, li, li.dataset.dir));
    return li;
  };
  box.replaceChildren(...group(list, now).map((s) => {
    const id = `ifl-nt-h-${s.key}`;
    return ui.el("section", { class: "ifl-nt-sec", data: { day: s.key } },
      ui.el("h3", { class: "ifl-nt-h", id, text: s.label }),
      ui.el("ul", { class: "ifl-nt", role: "list", "aria-labelledby": id }, s.stacks.flatMap((st) => {
        // (a stack shown: a row each, each its own; else the newest, standing for them all)
        if (!shown.has(st.key) || !st.rest.length) return [row(st.head, [st.head, ...st.rest], st, false)];
        return [row(st.head, [st.head], st, false), ...st.rest.map((n) => row(n, [n], st, true))];
      })));
  }));
}

// a row slid away either way: it follows the finger, a little stiffly for the first few pixels; past a third of its
// width, or flicked, it's gone; short of that it comes back. The bin behind grows as it nears the point of going.
const give = (d) => { const a = Math.abs(d); return Math.sign(d) * (a <= 40 ? a * 0.6 : a - 16); };
function swipe(row, card, done) {
  let dragging = false;
  card.addEventListener("pointerdown", (e) => {
    if (dragging || e.isPrimary === false || e.button || row.classList.contains("gone") || e.target.closest?.(".ifl-nt-more, .ifl-nt-x, .ifl-nt-action")) return;
    dragging = true;
    const x0 = e.clientX, y0 = e.clientY, t0 = performance.now(), w = card.offsetWidth || 1, id = e.pointerId;
    let dx = 0, axis = null;
    delete row.dataset.dragged;
    const ac = new AbortController(), o = { signal: ac.signal };
    const reset = () => { ac.abort(); dragging = false; row.classList.remove("dragging", "far"); card.style.setProperty("--dx", "0px"); row.style.setProperty("--p", "0"); setTimeout(() => delete row.dataset.dragged, 0); };
    const move = (m) => {
      if (m.pointerId !== id) return;
      dx = m.clientX - x0;
      if (!axis) {
        const dy = m.clientY - y0;
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { axis = "x"; try { card.setPointerCapture(id); } catch (_) {} row.classList.add("dragging"); }
        else if (Math.abs(dy) > 8) return reset();
        else return;
      }
      m.preventDefault?.();
      row.dataset.dragged = "1";
      row.dataset.dir = dx < 0 ? "left" : "right";
      card.style.setProperty("--dx", `${give(dx)}px`);
      row.style.setProperty("--p", Math.min(1, Math.abs(dx) / (w / 3)).toFixed(3));
      row.classList.toggle("far", Math.abs(dx) > w / 3);
    };
    const up = (u) => {
      if (u.pointerId !== id) return;
      ac.abort(); dragging = false;
      row.classList.remove("dragging", "far");
      if (axis !== "x") return;
      const fast = Math.abs(dx) > 40 && Math.abs(dx) / Math.max(1, performance.now() - t0) > 0.6;
      if (u.type !== "pointercancel" && row.isConnected && (Math.abs(dx) > w / 3 || fast)) { row.style.setProperty("--p", "1"); done(); }
      else { card.style.setProperty("--dx", "0px"); row.style.setProperty("--p", "0"); }
      // (the click that follows a drag isn't a tap)
      setTimeout(() => delete row.dataset.dragged, 0);
    };
    addEventListener("pointermove", move, o);
    addEventListener("pointerup", up, o);
    addEventListener("pointercancel", up, o);
    addEventListener("blur", reset, o);
    row.closest("dialog")?.addEventListener("close", reset, o);
    document.addEventListener("visibilitychange", () => { if (document.hidden) reset(); }, o);
  });
}

export function createBell(F, { count = () => {}, go = (u) => F.nav.go(u, { from: "notification" }), settings = () => go("/#you=phone"), actions = () => [] } = {}) {
  const owner = F.session?.view?.user?.id;
  let list = [], unread = 0, h = null, box = null, all = null, said = null, gone = false, busy = 0, tick = 0;
  // (for this sheet's showing only: those unseen as it opened, the stacks opened out, the rows just put back)
  let fresh = new Set(), shown = new Set(), back = new Set();
  // (the last clearing, for the toast's Undo: what's cleared within its few seconds joins it)
  let undo = null, toasted = null;
  const pending = new Set();
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sw = navigator.serviceWorker;
  const newest = (a, b) => b.at - a.at;
  const owned = () => !gone && !F.signal?.aborted && (!owner || F.session?.view?.user?.id === owner);
  // (the worker asked, answered on a port; null for no worker or no answer in 3 s)
  function ask(msg) {
    return new Promise((ok) => {
      let done = false, ch = null;
      const fin = (v) => { if (done) return; done = true; clearTimeout(t); pending.delete(fin); ch?.port1.close?.(); ch?.port2.close?.(); ok(v); };
      const t = setTimeout(() => fin(null), 3000);
      pending.add(fin);
      if (!owned()) return fin(null);
      Promise.resolve(sw?.getRegistration?.("/")).then((r) => {
        if (done || !owned()) return fin(null);
        const w = r?.active;
        if (!w) return fin(null);
        ch = new MessageChannel();
        ch.port1.onmessage = (e) => fin(e.data?.ifl === "notes" ? e.data : null);
        try { w.postMessage(msg, [ch.port2]); } catch (_) { fin(null); }
      }, () => fin(null));
    });
  }
  function take(d) {
    if (!owned() || !d || !Array.isArray(d.list)) return;
    list = d.list.filter((n) => n && typeof n.id === "string").sort(newest);
    unread = Math.max(0, Number(d.unread) || 0);
    if (h) {
      for (const n of list) if (!n.seen) fresh.add(n.id);
      if (Array.isArray(d.fresh)) for (const id of d.fresh) fresh.add(id);
    }
    if (h && unread) ask({ ifl: "notes-seen" }).then(take);
    count(h ? 0 : unread);
    // (not while a row's going: it's drawn again once it's gone)
    if (h && !busy) paint();
  }
  const refresh = () => ask({ ifl: "notes" }).then(take);
  // (drawn again; focus: what to put the focus on after, a selector or the first of several found; else, where it was
  // in the list, the same again)
  function paint(focus = null) {
    if (!box) return;
    const a = document.activeElement, r = box.contains(a) && a.closest(".ifl-nt-row");
    if (!focus && r) focus = [`.ifl-nt-row[data-id="${CSS.escape(r.dataset.id)}"] .${a.classList[0]}`, ".ifl-nt-main"];
    const sheet = h;
    const activeRow = (ns, row) => owned() && h === sheet && !!sheet && !sheet.closed && row?.isConnected && !row.classList.contains("gone") && sheet.el.contains(row) && list.some(n => n.id === ns[0]?.id);
    draw(box, list, { ui: F.ui, fresh, shown, open: (ns, row) => { if (activeRow(ns, row)) tapped(ns); }, clear: (ns, row, dir) => { if (activeRow(ns, row)) clear(ns, row, dir); }, more: key => { if (owned() && h === sheet && !sheet?.closed) more(key); }, actions: n => owned() ? actions(n) : [], act: (ns, action, row) => {
      if (!activeRow(ns, row)) return;
      const ids = ns.map(n => n.id);
      ask({ ifl: "notes-clear", ids }).then(take);
      list = list.filter(n => !ids.includes(n.id));
      unlift(); sheet.now();
      try { Promise.resolve(action.run()).catch(() => { if (owned()) F.toast("That action couldn’t open. Try again."); }); }
      catch (_) { if (owned()) F.toast("That action couldn’t open. Try again."); }
    } });
    for (const id of back) box.querySelector(`.ifl-nt-row[data-id="${CSS.escape(id)}"]`)?.classList.add("back");
    back = new Set();
    if (all) all.hidden = !list.length;
    if (focus) ([].concat(focus).map((q) => box.querySelector(q)).find(Boolean) || h?.el.querySelector("h2"))?.focus({ preventScroll: true });
  }
  // (the times kept true while it's open: "Now" becomes "1m")
  function retime() {
    for (const t of box?.querySelectorAll(".ifl-nt-when") || []) t.textContent = when(Date.parse(t.getAttribute("datetime")));
  }
  function more(key) {
    if (!owned()) return;
    if (shown.has(key)) shown.delete(key); else shown.add(key);
    paint(`.ifl-nt-row[data-stack="${CSS.escape(key)}"] .ifl-nt-more`);
  }
  // (cleared: the row slides away, the rows below close up into its place, and the worker clears them, their
  // notifications too; the toast offers them back)
  function clear(ns, row, dir = "left") {
    if (!owned()) return;
    const ids = ns.map((n) => n.id);
    const next = row?.nextElementSibling || row?.closest(".ifl-nt-sec")?.nextElementSibling?.querySelector(".ifl-nt-row");
    const to = next?.dataset.id ? `.ifl-nt-row[data-id="${CSS.escape(next.dataset.id)}"] .ifl-nt-main` : ".ifl-nt-main";
    const out = () => {
      if (!owned()) return;
      list = list.filter((x) => !ids.includes(x.id));
      paint(to);
    };
    offer(ns);
    ask({ ifl: "notes-clear", ids }).then(take);
    if (!row || reduced()) return out();
    busy++;
    row.classList.add("gone", dir === "right" ? "to-right" : "to-left");
    row.style.setProperty("--h", `${row.offsetHeight}px`);
    // (the last of its day: the day's heading closes up with it)
    const sec = row.closest(".ifl-nt-sec");
    const last = sec && ![...sec.querySelectorAll(".ifl-nt-row")].some((r) => r !== row && !r.classList.contains("gone"));
    if (last) { sec.style.setProperty("--h", `${sec.offsetHeight}px`); sec.classList.add("gone"); }
    requestAnimationFrame(() => requestAnimationFrame(() => { row.classList.add("shut"); if (last) sec.classList.add("shut"); }));
    setTimeout(() => { busy--; out(); }, 340);
  }
  // (the toast: "Cleared", with Undo; in the sheet while it's open, the page behind being inert)
  function offer(ns) {
    const t = Date.now(), had = undo && t - undo.t < 6000 ? undo.list : [];
    const b = undo = { list: [...had, ...ns], t };
    const n = b.list.length, text = n > 1 ? `${n} cleared` : "Cleared";
    F.toast(text, { action: { label: "Undo", run: () => putBack(b) } });
    toasted = [...document.querySelectorAll(".ifl-toast")].at(-1) || null;
    if (h && toasted) { h.el.append(toasted); if (said) { said.textContent = ""; requestAnimationFrame(() => { if (said) said.textContent = text; }); } }
  }
  function putBack(b) {
    if (!owned()) return;
    if (undo === b) undo = null;
    const have = new Set(list.map((n) => n.id)), add = b.list.filter((n) => !have.has(n.id));
    if (!add.length) return;
    list = [...list, ...add].sort(newest);
    for (const n of add) back.add(n.id);
    if (reduced()) back = new Set();
    paint(`.ifl-nt-row[data-id="${CSS.escape(add.sort(newest)[0].id)}"] .ifl-nt-main`);
    ask({ ifl: "notes-back", list: add.map(({ id, app, title, body, url, tag, at }) => ({ id, app, title, body, url, tag, at })) }).then(take);
  }
  // (the toast let go of the sheet as it shuts, so it's still there to Undo with, if it's still up)
  function unlift() { if (toasted?.classList.contains("on") && h?.el.contains(toasted)) document.body.append(toasted); }
  function tapped(ns) {
    if (!owned()) return;
    const n = ns[0], ids = ns.map((x) => x.id);
    ask({ ifl: "notes-clear", ids }).then(take);
    list = list.filter((x) => !ids.includes(x.id));
    unlift();
    h?.now();
    if (typeof n.url === "string" && n.url.startsWith("/") && !n.url.startsWith("//")) go(n.url);
  }
  function clearAll() {
    if (!owned()) return;
    const was = list.slice();
    if (!was.length) return;
    list = [];
    offer(was);
    ask({ ifl: "notes-clear", all: true, ids: was.map((n) => n.id) }).then(take);
    if (reduced() || !box) return paint("h2");
    busy++;
    box.classList.add("out");
    setTimeout(() => { busy--; box?.classList.remove("out"); paint("h2"); }, 200);
  }
  function open() {
    if (!owned()) return null;
    if (h) return h;
    fresh = new Set(list.filter((n) => !n.seen).map((n) => n.id));
    shown = new Set();
    box = F.ui.el("div", { class: "ifl-nts" });
    const set = F.ui.el("button", { class: "ifl-nt-set", type: "button", text: "Notification Settings" });
    said = F.ui.el("p", { class: "vh", role: "status" });
    const body = F.ui.el("div", { class: "ifl-nts-wrap" }, box, F.ui.el("div", { class: "ifl-nt-foot" }, set), said);
    h = F.sheet.open({ sheet: "notifications", title: "Notifications", body, onClose: () => {
      unlift();
      clearInterval(tick);
      h = null; box = null; all = null; said = null; fresh = new Set(); shown = new Set(); count(unread);
    } });
    const sheet = h;
    const active = () => owned() && h === sheet && !sheet.closed;
    set.addEventListener("click", () => { if (!active()) return; unlift(); sheet.now(); settings(); });
    all = F.ui.el("button", { class: "ifl-nt-all", type: "button", text: "Clear All" });
    all.addEventListener("click", () => { if (active()) clearAll(); });
    h.el.querySelector(".ifs-head [data-close]")?.before(all);
    paint();
    count(0);
    tick = setInterval(retime, 30e3);
    ask({ ifl: "notes-seen" }).then(take);
    return h;
  }
  const heard = (e) => { if (e.data?.ifl === "notes") take(e.data); };
  const seen = () => { if (document.visibilityState === "visible") refresh(); };
  sw?.addEventListener?.("message", heard);
  document.addEventListener("visibilitychange", seen);
  F.signal?.addEventListener?.("abort", destroy, { once: true });
  if (F.signal?.aborted) destroy(); else refresh();
  function destroy() {
    if (gone) return;
    gone = true; clearInterval(tick); for (const fin of [...pending]) fin(null); sw?.removeEventListener?.("message", heard); document.removeEventListener("visibilitychange", seen); F.signal?.removeEventListener?.("abort", destroy); h?.now(); count(0);
  }
  return {
    open, refresh,
    destroy,
  };
}
