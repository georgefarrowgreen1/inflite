// Today's bell: the notifications this phone's been shown, in a sheet from the header's pill (beside Search and Edit).
// The list is the root worker's (sw.js: its log, with those still in Notification Centre merged in), asked for by
// message ({ ifl: "notes" }, answered on a port) and told again by the worker as one comes or goes. The bell's count and
// the Home Screen badge are one number: the unseen ones. Opening the sheet marks every one seen; a row stays until it's
// cleared (swiped either way, its Clear button, Delete, or Clear All), or tapped: then it's cleared and opens where it
// came from, through the frame's own navigation, as a tap in Notification Centre does.
//   createBell(F, { count(n), go(url) }) → { open(), refresh(), destroy() }
//   when(at, now) → "11:02" | "Yesterday" | "Mon" | "7 Nov";  draw(box, list, { ui, now, open(n), clear(n, row) })
// Nothing here but builders through F.ui (data as text only) and --dx set by setProperty; no storage of its own.

const DAY = 864e5;
const fmt = (o) => new Intl.DateTimeFormat(undefined, o);
const startOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export function when(at, now = Date.now()) {
  const days = Math.round((startOf(now) - startOf(at)) / DAY);
  if (days <= 0) return fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  if (days === 1) return "Yesterday";
  if (days < 7) return fmt({ weekday: "short" }).format(at);
  return fmt({ day: "numeric", month: "short" }).format(at);
}

// the list into box: a row per notification, newest first, or "No notifications"
export function draw(box, list, { ui, now = Date.now(), open, clear }) {
  if (!list.length) return box.replaceChildren(ui.el("p", { class: "ifl-nt-none", role: "status", text: "No notifications" }));
  box.replaceChildren(ui.el("ul", { class: "ifl-nt", role: "list" }, list.map((n) => {
    const main = ui.el("button", { class: "ifl-nt-main", type: "button" },
      ui.icon(null, { app: n.app === "chats" ? "chat" : n.app, size: 40 }),
      ui.el("span", { class: "ifl-nt-tx" },
        ui.el("span", { class: "ifl-nt-top" }, ui.el("b", { class: "ifl-nt-t", text: n.title || "" }), ui.el("time", { class: "ifl-nt-when", datetime: new Date(n.at).toISOString(), text: when(n.at, now) })),
        n.body ? ui.el("span", { class: "ifl-nt-b", text: n.body }) : null));
    const x = ui.el("button", { class: "ifl-nt-x", type: "button", "aria-label": "Clear", title: "Clear" }, ui.icon("x"));
    const card = ui.el("div", { class: "ifl-nt-card" }, main, x);
    const row = ui.el("li", { class: "ifl-nt-row", data: { id: n.id, seen: n.seen ? "1" : null } }, ui.el("div", { class: "ifl-nt-back", "aria-hidden": "true" }, ui.el("span", { text: "Clear" }), ui.el("span", { text: "Clear" })), card);
    main.addEventListener("click", () => { if (!row.dataset.dragged) open(n, row); });
    main.addEventListener("keydown", (e) => { if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); clear(n, row); } });
    x.addEventListener("click", () => clear(n, row));
    swipe(row, card, () => clear(n, row, row.dataset.dir));
    return row;
  })));
}

// a row slid away either way: past a third of its width, or flicked, it's gone; short of that it comes back
function swipe(row, card, done) {
  card.addEventListener("pointerdown", (e) => {
    if (e.button || row.classList.contains("gone")) return;
    const x0 = e.clientX, y0 = e.clientY, t0 = performance.now(), w = card.offsetWidth || 1, id = e.pointerId;
    let dx = 0, axis = null;
    delete row.dataset.dragged;
    const ac = new AbortController(), o = { signal: ac.signal };
    const move = (m) => {
      if (m.pointerId !== id) return;
      dx = m.clientX - x0;
      if (!axis) {
        const dy = m.clientY - y0;
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) { axis = "x"; try { card.setPointerCapture(id); } catch (_) {} row.classList.add("dragging"); }
        else if (Math.abs(dy) > 8) return ac.abort();
        else return;
      }
      m.preventDefault?.();
      row.dataset.dragged = "1";
      row.dataset.dir = dx < 0 ? "left" : "right";
      card.style.setProperty("--dx", `${dx}px`);
      row.classList.toggle("far", Math.abs(dx) > w / 3);
    };
    const up = (u) => {
      if (u.pointerId !== id) return;
      ac.abort();
      row.classList.remove("dragging", "far");
      if (axis !== "x") return;
      const fast = Math.abs(dx) > 40 && Math.abs(dx) / Math.max(1, performance.now() - t0) > 0.6;
      if (Math.abs(dx) > w / 3 || fast) done();
      else card.style.setProperty("--dx", "0px");
      // (the click that follows a drag isn't a tap)
      setTimeout(() => delete row.dataset.dragged, 0);
    };
    addEventListener("pointermove", move, o);
    addEventListener("pointerup", up, o);
    addEventListener("pointercancel", up, o);
  });
}

export function createBell(F, { count = () => {}, go = (u) => F.nav.go(u, { from: "notification" }) } = {}) {
  let list = [], unread = 0, h = null, box = null, all = null, gone = false;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sw = navigator.serviceWorker;
  // (the worker asked, answered on a port; null for no worker or no answer in 3 s)
  function ask(msg) {
    return new Promise((ok) => {
      const t = setTimeout(() => ok(null), 3000);
      const fin = (v) => { clearTimeout(t); ok(v); };
      Promise.resolve(sw?.getRegistration?.("/")).then((r) => {
        const w = r?.active;
        if (!w) return fin(null);
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => fin(e.data?.ifl === "notes" ? e.data : null);
        w.postMessage(msg, [ch.port2]);
      }, () => fin(null));
    });
  }
  function take(d) {
    if (gone || !d || !Array.isArray(d.list)) return;
    list = d.list.filter((n) => n && typeof n.id === "string").sort((a, b) => b.at - a.at);
    unread = Math.max(0, Number(d.unread) || 0);
    if (h && unread) ask({ ifl: "notes-seen" }).then(take);
    count(h ? 0 : unread);
    if (h) paint();
  }
  const refresh = () => ask({ ifl: "notes" }).then(take);
  function paint() {
    if (!box) return;
    draw(box, list, { ui: F.ui, open: tapped, clear });
    if (all) all.hidden = !list.length;
  }
  // (cleared: the row slides away, the list closes up, and the worker clears it, its notification too)
  function clear(n, row, dir = "left") {
    const out = () => {
      list = list.filter((x) => x.id !== n.id);
      paint();
      if (list.length) box?.querySelector(".ifl-nt-main")?.focus({ preventScroll: true });
      else h?.el.querySelector("h2")?.focus({ preventScroll: true });
    };
    ask({ ifl: "notes-clear", ids: [n.id] }).then(take);
    if (!row || reduced()) return out();
    row.classList.add("gone", dir === "right" ? "to-right" : "to-left");
    row.style.setProperty("--h", `${row.offsetHeight}px`);
    requestAnimationFrame(() => row.classList.add("shut"));
    setTimeout(out, 320);
  }
  function tapped(n) {
    ask({ ifl: "notes-clear", ids: [n.id] }).then(take);
    list = list.filter((x) => x.id !== n.id);
    h?.now();
    if (typeof n.url === "string" && n.url.startsWith("/") && !n.url.startsWith("//")) go(n.url);
  }
  function clearAll() {
    const ids = list.map((n) => n.id);
    if (!ids.length) return;
    list = [];
    paint();
    h?.el.querySelector("h2")?.focus({ preventScroll: true });
    ask({ ifl: "notes-clear", all: true, ids }).then(take);
  }
  function open() {
    if (h) return h;
    box = F.ui.el("div", { class: "ifl-nts" });
    h = F.sheet.open({ sheet: "notifications", title: "Notifications", body: box, onClose: () => { h = null; box = null; all = null; count(unread); } });
    all = F.ui.el("button", { class: "ifl-nt-all", type: "button", text: "Clear All" });
    all.addEventListener("click", clearAll);
    h.el.querySelector(".ifs-head [data-close]")?.before(all);
    paint();
    count(0);
    ask({ ifl: "notes-seen" }).then(take);
    return h;
  }
  const heard = (e) => { if (e.data?.ifl === "notes") take(e.data); };
  const seen = () => { if (document.visibilityState === "visible") refresh(); };
  sw?.addEventListener?.("message", heard);
  document.addEventListener("visibilitychange", seen);
  refresh();
  return {
    open, refresh,
    destroy() { gone = true; sw?.removeEventListener?.("message", heard); document.removeEventListener("visibilitychange", seen); h?.now(); count(0); },
  };
}
