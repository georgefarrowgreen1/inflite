// InFlite's frame (One roof, spec §3.2, §3.4, D2–D3, D6, D14, D20–D22): the one page every screen of the framework
// lives in. B0's stub (STUB = true): every member of F (§3.2) and of fw (§5.2) is present and does nothing, so other
// batches can build against the names; FW writes the real frame. Statically imported by Today's app.js.
//
// createFrame(opts) → F. opts (from app.js, TD):
//   { root: #in, header: #hd, views: #views, tabs: #tabs,
//     session: () => ({ view, hub, roof, links }),   // hub, roof: booleans (D14: roof = j.roof === true); links: IFL's
//     lost: signedOutNow, checkSession: () => Promise<boolean signedIn>, hubAgain: () => Promise<void> (D14 re-ask),
//     save: () => ({ y, … }) (D21's reload writes ifl-here:today from it), onMe: (button) => openMenu (D24),
//     me: () => Node (your photo), today: ScreenSpec, apps: ScreenSpec, you: ScreenSpec }
//   ScreenSpec = { el, title(), crumb(), line(), acts: [{ icon, label, run }], onShow(route), onHide() }
//
// F (§3.2):
//   F.screen(id, spec)                              built-in screens "today" | "apps" | "you"
//   F.nav.go(path, { replace, zoomFrom, from })     in-page if router.owns(path) (and not F.stale into an app, D21),
//                                                   else IFL.hub.go(path) + location.assign
//   F.nav.back()                                    the Back rule, §3.4
//   F.nav.section(app, id, { arg })                 replaceState to router.format({ app, section: id, arg }) (no key: a
//                                                   sheet key of the old route never carries over); header switcher and URL follow
//   F.route                                         the current Route (router.js), null before the first render
//   F.header, F.tabs, F.sheet, F.toast, F.search, F.send, F.ui   (header.js, tabs.js, sheet.js, toast.js, search.js,
//                                                   send.js, ui.js)
//   F.session                                       { view, hub, roof, links, lost() → Promise<boolean> } (D3)
//   F.setRoof(bool)                                 D14, from app.js when /api/hub answers differently
//   F.restamp()                                     re-writes a missing history.state.ifl (RI1)
//   F.stale                                         boolean, D21
//   F.fill(on)                                      D20 (html.ifl-fill)
//   F.on(evt, fn) → off                             "route", "visible", "hidden", "theme", "signedout"
//   F.busy() → boolean                              a sheet open, or the shown module's busy()
//   F.forModule(app) → fw                           §5.2, below
//   F.destroy()                                     sign-out: unmount modules, close sheets, hide the frame
//
// fw = F.forModule(app) (§5.2), what a module gets in mount(root, fw):
//   fw.contract = 1; fw.app; fw.screenEl (main#m-<app>)
//   fw.ui                                           ui.js's builders
//   fw.header.set({ title, compactTitle, pick, line, acts, badges })   only while its screen shows; header.js's spec:
//     title, compactTitle?: string; pick: { label, run } | null (the title's ▾: label its aria-label, run() on tap;
//     Weather: { label: "Places", run: () => open.places() }); line: string; acts: [{ icon, label, run }] (data-act = icon);
//     badges?: { [sectionId]: n }. (The frame fills back, crumb, sections and section itself.)
//   fw.nav.go(path), fw.nav.back(), fw.nav.section(id, { arg }) (= F.nav.section(app, id, { arg })),
//   fw.nav.href(key, arg) → path (router.format({ app, key, arg }); key a section id or an alias: href("day", "2026-11-03") → "/weather/#day=2026-11-03")
//   fw.sheet.open(spec) → Handle                    sheet.js, accent = the app
//   fw.toast(text, opts)
//   fw.send({ words, packed, what }), fw.sendButton({ words, packed, what }) → Element
//   fw.search.provide(provider) → off               replaces placesProvider while mounted
//   fw.session = { user: { id, name }, lost() → Promise<boolean> }   true: signed out (confirmed); false: still in
//   fw.visible() → boolean; fw.on("visible" | "hidden" | "theme", fn) → off
//   fw.theme() → "light" | "dark"; fw.motion() → "full" | "reduced"
//   fw.zoomTarget(el)                               the module's hero is in: the frame drops the card clone
//   fw.fill(on)                                     D20
//   fw.lazy(() => import(…)) → Promise; fw.stale() → boolean        D21: every dynamic import in a module goes here
import { format } from "./router.js";
import { createHeader } from "./header.js";
import { createTabs } from "./tabs.js";
import { createSheets } from "./sheet.js";
import { toast } from "./toast.js";
import * as ui from "./ui.js";
import { createSearch } from "./search.js";
import { createSend } from "./send.js";

export const CONTRACT = 1;
export const STUB = true;

export function createFrame(opts = {}) {
  const noop = () => {};
  const off = () => noop;
  const session = () => ({ view: null, hub: false, roof: false, links: {}, ...(typeof opts.session === "function" ? opts.session() : {}), lost: async () => false });
  const F = {
    screen(id, spec) {},
    nav: { go(path, o) {}, back() {}, section(app, id, o) {} },
    route: null,
    header: createHeader(opts.header || null, null),
    tabs: createTabs(opts.tabs || null, null),
    sheet: createSheets(null),
    toast,
    search: createSearch(null),
    send: createSend(null),
    ui,
    get session() { return session(); },
    setRoof(on) {},
    restamp() {},
    stale: false,
    fill(on) {},
    on: off,
    busy: () => false,
    forModule(app) {
      return {
        contract: CONTRACT,
        app,
        screenEl: null,
        ui,
        header: { set(spec) {} },
        nav: { go(path) {}, back() {}, section(id, o) {}, href: (key, arg = null) => format({ app, key, arg }) },
        sheet: { open: (spec) => F.sheet.open(spec) },
        toast: (text, o) => toast(text, { ...o, app }),
        send(spec) {},
        sendButton(spec) { return null; },
        search: { provide: (p) => noop },
        session: { user: { id: null, name: null }, lost: async () => false },
        visible: () => true,
        on: off,
        theme: () => "dark",
        motion: () => "full",
        zoomTarget(el) {},
        fill(on) {},
        lazy: (fn) => fn(),
        stale: () => false,
      };
    },
    destroy() {},
  };
  return F;
}
