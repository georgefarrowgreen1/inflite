// Mail Notifications in You (One roof stage 4, s4/spec S4-D11, §6.5, §2.6): the sheet dialog#sh-mailnotify in index.html
// (stage 1 §3.8's frozen markup, body #mlnBody), opened at /#you=notify-mail by You's Mail row (the integrator's one
// line in you.js), Mail Settings and search. For the site's admin alone (Mail is theirs).
//   openMailNotify(F) → a promise, once the sheet's drawn with its answers. F: InFlite's frame (F.sheet.openEl, F.ui's
//   builders, F.toast, F.session: view.apps.mail (the admin), hub and apps.mail, lost(); F.nav.go, F.hubAgain).
//   Anyone but the admin (view.apps.mail not true, S4-D21): said so, and nothing asked of Mail, nor of Today.
//   notifyTest.fetch: the tests' stand-in for fetch (null: the browser's own).
//   - Through InFlite: the account's preference (off unless chosen), through Today's own /api/notify (GET answers
//     mail: { inflite } for the admin; PATCH { mail: { inflite } }). On, Mail's new mail and what's back from Later come
//     as InFlite's notifications, "Mail" and fixed words, with who it's from and the subject asked of Mail by the phone
//     itself (never through InFlite's servers); and Mail's own stop, so each comes once.
//   - A switch for each of Mail's addresses: Mail's own /api/notify, asked by this page straight from Mail's address
//     (credentialed CORS: GET plain, PATCH { email, notify } with X-Inflite), only while Mail's switch here is on
//     (F.session.apps.mail). Off, or Mail not answering: "Choose which addresses notify you in Mail Settings" and Open
//     Mail (at /mail/#settings here, or Mail's own address where the hub isn't serving the apps).
// Every word from an answer goes in through the builders' textContent; nothing of it is kept.
const MAIL_PATH = "/mail/#settings";
// (Mail's address, from this page's: email. beside inflite.ai, and beside next.inflite.ai too, as modules.js has it)
export const mailOrigin = (loc = globalThis.location) => `${loc.protocol}//email.${String(loc.host).replace(/^next\./, "")}`;
const EMAIL = /^[^\s@<>()",;]{1,64}@[^\s@<>()",;]{1,190}$/;
export const WORDS = {
  title: "Through InFlite",
  on: "Who it’s from and the subject, asked of Mail by this phone. Mail stops sending its own, so each comes once.",
  off: "Off: Mail notifies you itself, as it always has.",
  noDevice: "Turn on Notifications Here in You to get them on this phone.",
  elsewhere: "Choose which addresses notify you in Mail Settings.",
  notAdmin: "Mail’s notifications are for the site’s admin.",
  couldnt: "Couldn’t get them just now. Try again in a moment.",
  getting: "Getting them…",
};

// (one request: JSON back, or an Error with its status and the server's words)
async function ask(f, url, { method = "GET", body, cors = false } = {}) {
  const headers = { Accept: "application/json" };
  if (method !== "GET") headers["X-Inflite"] = "1";
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let r;
  try {
    r = await f(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: cors ? "include" : "same-origin", cache: "no-store", ...(cors ? { mode: "cors" } : {}) });
  } catch (_) {
    throw Object.assign(new Error("Couldn’t reach it just now. Try again in a moment."), { status: 0 });
  }
  let data = null;
  try { data = await r.json(); } catch (_) {}
  if (!r.ok) throw Object.assign(new Error(typeof data?.error === "string" ? data.error : "Something went wrong. Try again."), { status: r.status });
  return data;
}
// (Mail's addresses as this sheet shows them: each { email, name, notify }, checked; anything else, none)
export function addressesOf(a) {
  const list = Array.isArray(a?.addresses) ? a.addresses : null;
  if (!list) return null;
  return list.filter((x) => x && typeof x.email === "string" && EMAIL.test(x.email)).slice(0, 50)
    .map((x) => ({ email: x.email, name: typeof x.name === "string" ? x.name.slice(0, 80) : "", notify: x.notify !== false }));
}
// (the account's answer, as this sheet reads it: inflite true/false for the admin, null for anyone else; devices: how
// many of InFlite's devices Today's morning (and so Mail through InFlite) goes to)
export function mineOf(n) {
  const m = n && typeof n.mail === "object" && n.mail ? n.mail : null;
  return { inflite: m ? m.inflite === true : null, devices: Number.isInteger(n?.today?.devices) ? n.today.devices : null };
}

export const notifyTest = { fetch: null };
let drawn = 0;
export async function openMailNotify(F) {
  const doc = globalThis.document, sheet = doc?.getElementById?.("sh-mailnotify"), body = sheet?.querySelector?.("#mlnBody");
  if (!sheet || !body || !F?.ui || !F?.sheet) return null;
  const f = typeof notifyTest.fetch === "function" ? notifyTest.fetch : globalThis.fetch, ui = F.ui, n = ++drawn;
  // (Mail asked only for the site's admin, and only while Mail's switch is on here and the hub's serving the apps)
  const s = F.session || {}, admin = s.view?.apps?.mail === true, on = admin && s.hub === true && s.apps?.mail === true, MAIL = mailOrigin();
  // (the sheet's handle, whoever opened it: the one it has where it's open already, so Open Mail can put it away)
  const handle = F.sheet.openEl(sheet, {});
  if (s.view && !admin) {
    const st = { mine: { inflite: null, devices: null }, mail: null, on: false };
    fill(body, F, st, { f, MAIL, handle, sheet });
    return st;
  }
  body.replaceChildren(ui.el("p", { class: "sh-sub", text: WORDS.getting }));
  const [mine, mail] = await Promise.all([
    ask(f, "/api/notify").then(mineOf, () => null),
    on ? ask(f, `${MAIL}/api/notify`, { cors: true }).then(addressesOf, (e) => { mailRefused(F, e); return null; }) : Promise.resolve(null),
  ]);
  if (n !== drawn || !sheet.open) return null;
  const st = { mine, mail, on };
  fill(body, F, st, { f, MAIL, handle, sheet });
  return st;
}

// (Mail refusing this page while it should answer, and the phone online: the hub asked again, as a module would, C1)
function mailRefused(F, e) {
  if (e?.status === 0 && globalThis.navigator?.onLine !== false) Promise.resolve(F.hubAgain?.()).catch(() => {});
}

function fill(body, F, st, ctx) {
  const ui = F.ui, out = [];
  // Through InFlite
  if (!st.mine) out.push(ui.el("p", { class: "sh-sub", text: WORDS.couldnt }));
  else if (st.mine.inflite === null) return body.replaceChildren(ui.el("p", { class: "sh-sub", text: WORDS.notAdmin }));
  else {
    const said = ui.el("p", { class: "sh-sub mln-said", text: st.mine.inflite ? WORDS.on : WORDS.off });
    const hint = ui.el("p", { class: "sh-sub mln-hint", text: WORDS.noDevice });
    hint.hidden = !(st.mine.inflite && st.mine.devices === 0);
    const r = ui.row({
      title: WORDS.title, trail: "switch", checked: st.mine.inflite,
      onChange: async (v) => {
        const box = r.querySelector("input");
        if (box) box.disabled = true;
        try {
          const now = mineOf(await ask(ctx.f, "/api/notify", { method: "PATCH", body: { mail: { inflite: v } } }));
          if (now.inflite !== null) st.mine = now;
        } catch (e) {
          // (signed out meanwhile: the page's own signed-out path, D3; else what went wrong)
          if (e.status === 401) Promise.resolve(F.session?.lost?.()).catch(() => {});
          else F.toast?.(e.message);
        }
        if (box) { box.disabled = false; box.checked = !!st.mine.inflite; }
        said.textContent = st.mine.inflite ? WORDS.on : WORDS.off;
        hint.hidden = !(st.mine.inflite && st.mine.devices === 0);
      },
    });
    out.push(ui.list([r], { label: "Mail" }), said, hint);
  }
  // Each address
  if (st.mail && st.mail.length) {
    const rows = st.mail.map((a) => {
      const r = ui.row({
        title: a.name || a.email, sub: a.name ? a.email : "", trail: "switch", checked: a.notify,
        onChange: async (v) => {
          const box = r.querySelector("input");
          if (box) box.disabled = true;
          try {
            const now = addressesOf(await ask(ctx.f, `${ctx.MAIL}/api/notify`, { method: "PATCH", body: { email: a.email, notify: v }, cors: true }));
            const me = now?.find((x) => x.email === a.email);
            a.notify = me ? me.notify : v;
          } catch (e) { mailRefused(F, e); F.toast?.(e.status === 0 ? "Couldn’t reach Mail just now. Try again in a moment." : e.message); }
          if (box) { box.disabled = false; box.checked = a.notify; }
        },
      });
      r.dataset.address = a.email;
      return r;
    });
    out.push(ui.list(rows, { label: "Addresses" }));
  } else {
    out.push(ui.el("p", { class: "sh-sub mln-elsewhere", text: WORDS.elsewhere }), ui.el("div", { class: "sh-acts" }, ui.btn("Open Mail", { primary: true, run: () => openMail(F, st, ctx) })));
  }
  body.replaceChildren(...out);
}

// Open Mail at its settings: here, in this page, where Mail's a module; at the hub's framed /mail/ (which passes
// #settings into Mail) where the hub serves the apps; else at Mail's own address
function openMail(F, st, ctx) {
  // (the sheet put away, however it was opened, before Mail's shown)
  try { ctx.handle?.close?.(); } catch (_) {}
  try { if (ctx.sheet?.open && !ctx.handle) ctx.sheet.close?.(); } catch (_) {}
  const s = F.session || {};
  if (st.on && typeof F.nav?.go === "function") return F.nav.go(MAIL_PATH);
  globalThis.location.assign(s.hub === true ? MAIL_PATH : `${ctx.MAIL}/#settings`);
}
