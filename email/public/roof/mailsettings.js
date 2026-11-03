// Mail Settings under the roof (One roof stage 4, s4/spec S4-D11, §2.2; app.js openSettings 2288–2772, ported without
// New Address, Delete Address and Send From). Lazy, network only. One framework sheet, data-sheet=mail-settings, its
// pages pushed onto it.
// Frozen: openSettings(ctx, page) → sheet Handle. page: null (the first page), "signature", "unknown" (Unknown
//   Addresses), or one of your addresses (its own page, [data-page=address]).
// The first page: Addresses (each row → its page: Name, Signature, Sort Into, Colour), Unknown Addresses (Keep / Turn
//   Away), Signature, Remote Images on this device (localStorage mail:remote-images, off by default), a row that opens
//   Mail Settings at Mail's own address in a new tab for New Address, Delete or Send From (MAIL + "/#settings": Mail's
//   server refuses those from InFlite, §3.5), and Notifications → You's Mail Notifications (/#you=notify-mail).
// Saves: ctx.api.saveSettings(patch) with only { signature } or { catchall }; ctx.api.updateAddress(email, patch) with
//   only one of SAVES.address (never isDefault). Nothing else is written (roofmailviews.test).
import { MAIL } from "./api.js";

export const REMOTE = "mail:remote-images";
export const SAVES = Object.freeze({ settings: ["signature", "catchall"], address: ["name", "signature", "category", "color"] });
export const COLOURS = Object.freeze(["blue", "green", "orange", "pink", "purple", "teal", "grey"]);
const SORT = [["auto", "Auto"], ["people", "People"], ["updates", "Updates"]];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
export const remoteImages = () => { try { return localStorage.getItem(REMOTE) === "1"; } catch (_) { return false; } };
export function setRemoteImages(on) { try { if (on) localStorage.setItem(REMOTE, "1"); else localStorage.removeItem(REMOTE); } catch (_) {} }
// (only the keys a page may save, each a string or null where the server takes one)
export function patchOf(kind, key, value) {
  if (!SAVES[kind]?.includes(key)) return null;
  if (key === "category") return { category: value === "people" || value === "updates" ? value : null };
  if (key === "catchall") return { catchall: value === "reject" ? "reject" : "keep" };
  if (key === "color") return COLOURS.includes(value) ? { color: value } : null;
  return { [key]: String(value ?? "") };
}

export function openSettings(ctx, page = null) {
  const { fw, api } = ctx, ui = fw.ui, el = ui.el;
  let data = null, failed = null, h = null;
  const root = el("div", { class: "ms" });
  const say = (e) => fw.toast(e?.message || "Couldn’t save that. Try again.");
  const note = (t) => el("p", { class: "ms-note", text: t });
  const group = (label, ...rows) => ui.list(rows.flat().filter(Boolean), { label });
  const refreshMe = () => { try { ctx.store?.get?.().me && api.me().then((me) => ctx.store.set({ me }, "settings"), () => {}); } catch (_) {} };

  async function saveSettings(key, value) {
    const patch = patchOf("settings", key, value);
    if (!patch) return;
    const was = data;
    data = { ...data, ...patch };
    try { data = { ...data, ...(await api.saveSettings(patch)) }; refreshMe(); }
    catch (e) { data = was; say(e); }
  }
  async function saveAddress(email, key, value) {
    const patch = patchOf("address", key, value), i = data?.addresses.findIndex((a) => a.email === email);
    if (!patch || i < 0) return;
    const was = data.addresses[i];
    data.addresses[i] = { ...was, ...patch };
    try { data.addresses[i] = { ...data.addresses[i], ...(await api.updateAddress(email, patch)) }; refreshMe(); }
    catch (e) { data.addresses[i] = was; say(e); }
  }
  const sortSaid = (a) => [a.name || null, a.category === "updates" ? "to Updates" : a.category === "people" ? "to People" : null].filter(Boolean).join(" · ") || "As Mail sorts it";

  // ---- the first page
  function main() {
    if (!data) {
      root.replaceChildren(failed
        ? ui.error({ title: "Couldn’t load Mail Settings", body: failed, acts: [{ label: "Try Again", act: "retry", primary: true, run: load }] })
        : ui.skeleton("rows", 4));
      return;
    }
    const remote = ui.row({ lead: { icon: "photo" }, title: "Remote Images", sub: "On this phone: pictures from the senders’ servers, shown without asking", trail: "switch", checked: remoteImages(), onChange: setRemoteImages });
    remote.dataset.key = "remote-images";
    root.replaceChildren(
      group("Addresses", data.addresses.map((a) => {
        const r = ui.row({ lead: el("span", { class: "ms-dot", data: { colour: a.color || "blue" } }), title: a.email, sub: sortSaid(a), value: a.isDefault ? "Default" : null, trail: "chevron", run: () => address(a.email) });
        r.dataset.address = a.email;
        return r;
      })),
      group("Receiving", ui.row({ lead: { icon: "shield" }, title: "Unknown Addresses", sub: `Anything else @${data.domain || "inflite.ai"}`, value: data.catchall === "reject" ? "Turn Away" : "Keep", trail: "chevron", act: "unknown", run: unknown })),
      group("Sending", ui.row({ lead: { icon: "edit" }, title: "Signature", sub: data.signature ? data.signature.split("\n")[0] : "None, for every address", trail: "chevron", act: "signature", run: signature })),
      group("This Phone", remote),
      group("More", ui.row({ lead: { app: "mail" }, title: "New Address, Delete or Send From", sub: "Open Mail Settings at Mail’s own address", trail: "chevron", act: "own", href: `${MAIL}/#settings` }),
        ui.row({ lead: { icon: "bell" }, title: "Notifications", sub: "In You, with InFlite’s own", trail: "chevron", act: "notify", href: "/#you=notify-mail" })),
    );
    const own = root.querySelector("[data-act=own]");
    if (own) { own.target = "_blank"; own.rel = "noopener"; }
  }

  // ---- an address's own page
  function address(email) {
    const a = data?.addresses.find((x) => x.email === email);
    if (!a) return;
    h.push({ page: "address", title: `${email.split("@")[0]}@`, body: (pg) => {
      const name = el("input", { type: "text", class: "ms-input", placeholder: "Name", autocomplete: "off", "aria-label": "Name", data: { key: "name" } });
      name.value = a.name || "";
      name.addEventListener("change", () => saveAddress(email, "name", name.value.trim()));
      const sig = el("textarea", { class: "ms-sig", rows: "4", "aria-label": `Signature for ${email}`, placeholder: data.signature ? `As every address’s: ${data.signature.split("\n")[0]}` : "None", data: { key: "signature" } });
      sig.value = a.signature || "";
      sig.addEventListener("change", () => saveAddress(email, "signature", sig.value));
      const sort = ui.seg(SORT, a.category || "auto", (v) => saveAddress(email, "category", v), { label: "Sort into" });
      sort.dataset.key = "category";
      const sw = el("div", { class: "ms-swatches", role: "radiogroup", "aria-label": "Colour", data: { key: "color" } }, COLOURS.map((c) => {
        const b = el("button", { type: "button", role: "radio", class: "ms-swatch", "aria-label": cap(c), "aria-checked": String((a.color || "blue") === c), data: { colour: c } });
        b.addEventListener("click", () => { for (const x of sw.children) x.setAttribute("aria-checked", String(x === b)); saveAddress(email, "color", c); });
        return b;
      }));
      pg.append(
        el("div", { class: "ms-head" }, el("b", { text: email }), el("span", { text: a.count ? `${a.count.toLocaleString("en-GB")} message${a.count === 1 ? "" : "s"}` : "No mail yet" })),
        el("label", { class: "ms-field" }, el("span", { text: "Name" }), name), note("The name people see on mail from this address."),
        el("label", { class: "ms-field" }, el("span", { text: "Signature" }), sig), note("Under new messages and replies from this address. Left empty, it has the signature for every address."),
        el("div", { class: "ms-field" }, el("span", { text: "Sort Into" }), sort),
        el("div", { class: "ms-field" }, el("span", { text: "Colour" }), sw),
        note(a.isDefault ? "New messages are sent from this address." : "To make it the default or delete it, open Mail Settings at Mail’s own address."),
      );
    } });
  }

  // ---- Unknown Addresses
  function unknown() {
    h.push({ page: "unknown", title: "Unknown Addresses", body: (pg) => {
      const s = ui.seg([["keep", "Keep"], ["reject", "Turn Away"]], data.catchall === "reject" ? "reject" : "keep", (v) => saveSettings("catchall", v).then(main), { label: "Mail to other addresses" });
      s.dataset.key = "catchall";
      pg.append(s, note(`Mail to any other address @${data.domain || "inflite.ai"}: kept, it arrives in Mail; turned away, its sender hears it doesn’t exist.`));
    } });
  }

  // ---- the signature for every address
  function signature() {
    h.push({ page: "signature", title: "Signature", body: (pg) => {
      const area = el("textarea", { class: "ms-sig", rows: "6", placeholder: "Your signature", "aria-label": "Signature", data: { key: "signature" } });
      area.value = data.signature || "";
      let t = 0;
      const save = () => { clearTimeout(t); if (area.value !== (data.signature || "")) saveSettings("signature", area.value).then(main); };
      area.addEventListener("input", () => { clearTimeout(t); t = setTimeout(save, 700); });
      area.addEventListener("blur", save);
      pg.append(area, note("Added under new messages and replies, from every address that hasn’t one of its own."));
    } });
  }

  async function load() {
    failed = null; data = null; main();
    try { data = await api.settings(); data.addresses ||= []; }
    catch (e) { failed = e?.message || "Try again in a moment."; }
    if (h.closed) return;
    main();
    if (data && page === "signature") signature();
    else if (data && page === "unknown") unknown();
    else if (data && page && data.addresses.some((a) => a.email === page)) address(page);
    page = null;
  }
  h = fw.sheet.open({ sheet: "mail-settings", title: "Mail Settings", hero: { app: "mail", name: "Mail", line: "Your addresses and how mail arrives" }, body: root });
  load();
  return h;
}
