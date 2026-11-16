# InFlite framework contract

The runtime remains contract version 1. Lifetime signals are additive: old modules continue to work; current modules capture `fw.signal` for account-owned work and a visible-episode token for delayed UI. Hiding a module preserves its store; unmount aborts its lifetime before cleanup. A new account gets a new frame.

These API notes live with the architecture documentation instead of being downloaded on every framework load. Update this file when changing a public interface.

## Frame and module API

```text
InFlite's frame (One roof, spec §3.2, §3.4, §3.7, §3.15, D2–D3, D6, D14, D19–D22): the one page every screen of the
framework lives in. Statically imported by Today's app.js, which makes it once it knows you're signed in.

createFrame(opts) → F. opts (from app.js):
  { root: #in, header: #hd, views: #views, tabs: #tabs, retired: Promise (stage 3: old workers let go of, awaited
    before a service starts), serviceState: (app, state) => void (stage 3: each state patch of a service),
    session: () => ({ view, hub, roof, apps, links }),   // hub, roof: booleans (D14: roof = j.roof === true); apps:
                                                    // { [app]: boolean } (/api/hub's, s24 §2; none = { weather: roof })
    lost: signedOutNow, checkSession: () => Promise<boolean signedIn>, hubAgain: () => Promise<void> (D14 re-ask),
    save: () => ({ y, … }) (D21's reload writes ifl-here:today from it), onMe: (button) => openMenu (D24),
    changed: () => void (a module said its data changed: fw.changed(), Today's cards asked again on their next show),
    me: () => Node (your photo), today: ScreenSpec, apps: ScreenSpec, you: ScreenSpec,
    workspace?: ScreenSpec, workspacePreview?: boolean } // trusted host opt-in; preview preserves ?os=1 locally
  ScreenSpec = { el, title(), crumb(), line(), acts: [{ icon, label, run }] (or a function giving them),
                 onShow(route), onHide(), focus?() → Element }

F (§3.2):
  F.screen(id, spec)                     a built-in screen "today" | "apps" | "you" | "workspace" (again: replaced, header redrawn)
  F.nav.go(path, { replace, zoomFrom, from, kind, resume })   in-page if router.owns(path) (not while F.stale into an app:
                                         then location.assign, D21), else IFL.hub.go(path) (the crumb) + location.assign
  F.nav.back()                           the Back rule, §3.4
  F.nav.section(app, id, { arg })        replaceState to router.format({ app, section: id, arg }); header follows
  F.nav.prev() → Route | null            the route of the entry before this one, as this page pushed it (§3.6)
  F.route                                the current Route
  F.signal                               aborted synchronously when this signed-in frame is destroyed
  F.header, F.tabs, F.sheet, F.toast, F.search, F.send, F.ui
  F.session                              { view, hub, roof, apps, links, lost() → Promise<boolean> } (D3); apps: each
                                         app's flag ANDed with hub ({} with the hub off)
  F.setRoof(roof, apps)                  D14 per app, from app.js when /api/hub answers differently (s24 §2, §7)
  F.flush({ timeoutMs? }) → Promise<{ lost }> mounted modules plus registered system tasks; modules keep their
                                         2 s limit, system tasks receive a bounded 1–2000 ms timeout
  F.systemTasks.register(task, { signal? }) → dispose
                                         account-owned busy()/flush({timeoutMs}) work that survives navigation;
                                         captures the signed-in owner and retires on owner/frame/signal release
  F.restamp()                            re-writes a missing history.state.ifl (RI1)
  F.stale                                boolean, D21 (set by modules.js watchVersion)
  F.fill(on)                             D20 (html.ifl-fill)
  F.on(evt, fn) → off                    "route", "visible", "hidden", "theme", "signedout", "apps", "changed"
  F.busy() → boolean                     an open sheet, mounted busy module, or active/pending/failed system task;
                                         a failed task flush remains busy until a successful flush or disposal
  F.refresh()                            the shown tab screen's header asked for again (its title, crumb, line, acts)
  F.hubAgain() → Promise                 opts.hubAgain (modules.js asks before loading a module)
  F.forModule(app) → fw                  §5.2, below
  F.service(app) → Promise<Facade>       stage 3 (S3-C3; B0's stub, HOST's to fill): the app's service (REGISTRY[app]
                                         .service), one per app in this page, made by modules.js loadService after
                                         opts.retired; its facade (Chats: IFLChat's seven keys). Refused while off
  F.releaseService(app, { terminate })   let go of it (terminate: the Worker ended; the next F.service makes a new one)
  F.destroy()                            sign-out: unmount modules, close sheets, hide the frame, let go of listeners

fw = F.forModule(app) (§5.2), what a module gets in mount(root, fw):
  fw.contract = 1; fw.app; fw.screenEl (stable #m-<app> container; role=main when full-screen)
  fw.signal                              module lifetime; aborted at unmount, stays live while its screen is hidden
  fw.ui                                  ui.js's builders
  fw.header.set({ title, compactTitle, pick, line, acts, badges })   merged into what it set before; shown only while
    its screen shows (the frame fills back, crumb, sections and the section). pick: { label, run } | null;
    acts: [{ icon, label, run }] (data-act = icon); badges: { [sectionId]: n }
    sections: false hides the switcher; back: { label } says where Back goes (the action is always F.nav.back)
  fw.nav.go(path, { replace, kind }), fw.nav.back(), fw.nav.section(id, { arg }), fw.nav.href(key, arg) →
    router.format({ app, key, arg }), fw.nav.depth() → number (0: a cold screen); kind: "push" | "tab" | "zoom" |
    "section" (anything else, "pop" too, is ignored: a Back is only ever the frame's own)
  fw.sheet.open(spec) → Handle           sheet.js, accent = the app
  fw.toast(text, opts)
  fw.send({ words, packed, what }), fw.sendButton({ words, packed, what }) → Element
  fw.search.provide(provider) → off      replaces this app's own connector provider while mounted (s24 §6)
  fw.changed()                           this app's data changed (Today's cards asked again)
  fw.session = { user: { id, name }, lost() → Promise<boolean>, hubAgain() → Promise }   lost: true signed out
    (confirmed), false still in; hubAgain: the module's API refused it, /api/hub asked again (s24 §2)
  fw.visible() → boolean; fw.on("visible" | "hidden" | "theme", fn) → off (let go of at unmount)
  fw.theme() → "light" | "dark"; fw.motion() → "full" | "reduced"
  fw.zoomTarget(el)                      the module's hero is in: the frame drops the card's clone
  fw.fill(on)                            D20
  fw.service() → Promise<Service>        stage 3: this app's full service (Chats only; never the facade's host)
  fw.tabs.away(on), fw.tabs.badge(n)     stage 3 (S3-C4): the tab bar out of the way; this app's tab's count
  fw.on("push", fn)                      stage 3 (S3-C5): the root worker's { inflight: "sync", tag } as { app, tag }
  fw.lazy((q) => import("./x.js" + q)) → Promise; fw.stale() → boolean   every dynamic import in a module goes here;
    q is "" until an import of this app's failed, then "?retry=<n>"; /<app>/version asked beside it (≤ once a minute),
    and at once on a failure: a new build reloads at the route once nothing is unsaved (s24 §7)

History state the frame writes: { ifl: { d: depth, k: key, b: the entry before's name or null } }, kept with whatever
else the entry holds. Scroll is kept per entry and per app section in memory; sessionStorage["ifl-roof-y"] = { p: formatted route, y } on pagehide.
```

## Loading, recovery and offline files

```text
Loading the apps that are modules (One roof, spec §3.12, D2, D14, D15, D21). Loaded lazily by the frame (the first
app opened, or the idle preload).
loadModule(app, F) → Promise<{ m, instance }>: asks /api/hub again through app.js first (F.hubAgain, D14) and refuses
  unless F.session.apps[app] (each app's flag, ANDed with hub; s24 §2); import(REGISTRY[app].entry) within 12 s; m.CONTRACT === 1; each of
  REGISTRY[app].css linked and awaited (failure/5 s timeout reaches recovery; at once if already in); instance = await
  m.mount(root, F.forModule(app)); IFL.built(R.id || app, m.BUILD, m.NEWS) once it's in (Chats: "chat", its data id); then watchVersion and keepOffline. On a failure the screen shows ui.error: Try Again
  (data-act=retry: the entry asked for again, ?retry=<n>) and Open <App> on Its Own (data-act=own: the app's own
  address, links[R.link || app], same path, query and hash); after a second failure, Reload (data-act=reload), which is the real recovery
  (a failed dependency stays failed in the document's module map).
loadConnector(app) → Promise<Connector>: import(REGISTRY[app].connector) → its `connector` export.
preload(app): loadConnector(app), then a <link rel=modulepreload> per connector.preload entry (else connector.files)
  ending .js (stage 3, S3-C1: Chats preloads only its entry and connector, as its graph's asked for under stamped URLs).
watchVersion(app, build, F): asks /<app>/version as the page becomes visible (at most every 10 minutes); a build
  other than this one sets F.stale (D21).
loadService(app, F) → Promise<Service> (stage 3, S3-C3): import(REGISTRY[app].service), then its startService({ path,
  ui: F.forModule(app), onStale }) (onStale: F.stale = true). Only the frame calls it, once per app (F.service).
keepOffline(app, build, files): { ifl: "keep", app, build, files } (absolute same-origin paths) to the root worker
  (scope /, by its registration, whatever controls the page),
  once per build and list per page: connector.files after mount; files ∪ connector.lazy again only on the Home Screen,
  at idle, 10 s or more after the first show (C4, s24 §8). preload reads files only.
```

## Routes and module descriptors

```text
InFlite's router: which screen an address is, and the address of a screen (One roof, spec §3.3; stages 2–4's joint
contracts, roof/s24-contracts.md §3). Pure: no DOM, no storage, no history; the frame (frame.js) does all of that with
what this returns. Written in full by B0 and frozen: every batch builds on these names and shapes (MAIN
.tools/tests/unit/roofrouter.test.mjs pins them).

Route = { kind: "tab", tab: "today" | "apps" | "you" | "workspace", arg: string | null }
      | { kind: "tab", tab: "workspace", tool: "files", folder: string | null }
      | { kind: "app", app: <a REGISTRY key>, section: <one of its section ids>, key: string, arg: string | null, query: string }
  workspace: only with parse(href, { workspace: true }); /#workspace or /#workspace=<bounded id>.
    Without that opt-in the ordinary Today routing remains unchanged.
  files: the same workspace screen and chrome at /#files or /#files=<32-character base64url folder id>.
    Virtual app/recent locations stay in account-owned history state. Filenames, queries and content never go
    into routes or history; an explicit search prefill remains in the Files host's account-owned memory.
  tab arg: You's, from /#you=<arg> (notify, quiet, rules, phone, apps, account, notify-weather, …).
  app key: the hash's key as written, a section id or one of the app's aliases, else the app's first section;
  app hash: only where key is one of the app's raw keys (REGISTRY[app].raw: Chats' share), the address's whole hash
  after #, as written (≤ 7000 characters; such an address may be up to 2048 + 7000 long); absent otherwise.
  app arg: what follows the first = after key, once decodeURIComponent'd (a day YYYY-MM-DD, a settings page, a symbol
  such as TSCO.L, ^GSPC or GBPUSD=X, a thread's id); query: the address's search, raw ("" past 400).
  An app's arg is only ever [A-Za-z0-9_.^=-]{1,40} after that one decoding; You's and Weather's [A-Za-z0-9_-]{1,40} as
  written, never decoded (stage 1's rule, kept); anything else (or a bad %) is dropped (null).

History state the frame writes: { ifl: { d: depth, k: key, b } } only (§3.3); nothing here reads it.

The apps that are modules. sections = the module's SECTIONS = its connector's sections (roofcontract.test); css = the
module's stylesheets, linked and awaited before mount (D2). Optional fields (s24-contracts §3):
  link   the F.session.links key of the app's own address, where it isn't the app's name (links[R.link || app])
  stay   hash keys the frame's tidy (D6) leaves in the address once shown (Mail's reader: #thread=<id>)
  idb    the one IndexedDB database the module may open, only from <app>/roof/idb.js (C5)
Stage 3 (Chats; roof/s3/spec.md §5.1, S3-C1), optional too:
  tab      the tab-bar key whose screen this app's root route is (Chats: "chats"; the frame draws it as a tab screen)
  id       the app's data id where it isn't the app's name (Chats: "chat": versions, IFL.built, push app, storage)
  raw      hash keys whose whole hash the route carries raw, as route.hash (≤ 7000 characters; Send's #share=…)
  service  the one file that may make the app's Worker (Chats: service.js, loaded only by the frame, never a module)
  skip     { paths, query }: addresses under the app's path that aren't the framework's (null: a normal navigation):
           a path starting with one of paths (Chat's own page at /chats/in/), or a query with one of query's names
           (/chats/?engine=1, the milestone-1 engine)
```

## App continuity and loading

`resume: true` is for app-switching controls, including the dock and rail. It resumes that account frame's last safe route and window scroll position; an already-active destination is a no-op. Explicit links and app actions omit `resume`, so notifications and deep links still open their requested destination. Each return has a new route object: an old asynchronous action cannot become current again. One-use share payloads and action/settings aliases are excluded from remembered destinations. Back/Forward continue to use entry-specific scroll positions. The route-scroll map is bounded to 96 entries, stays in memory and is cleared with the frame. App instances, internal scrollers and drafts remain owned by their modules; switching never serializes or discards them.

Files' ordinary launcher retains the current location, search, filters and selection in its existing account-owned Explorer. An explicit search or location still overrides that view. Only opaque folder IDs and allowed source/view metadata enter history; searches and filenames remain private memory.

Code and styles load concurrently after the app's availability check; mounting waits for both and retains cancellation, stylesheet failure recovery and version guards. The account-owned speculative preloader queues one app at a time, allows two idle app preparations, and fetches at most four public JavaScript hints per app. Hover, touch and focus may prioritise another app; they never mount it, start its service or request its account data. Save Data, 2G/3G, low reported bandwidth, offline and hidden pages defer speculation. Account teardown cancels timers and invalidates late imports. The existing Chats service still owns message delivery and unread updates.

Today retains its content and focused controls while refreshing. Its small status line reserves its height, so pending and failed-update text do not move cards. Initial failures retain the existing explicit recovery action; failed background updates keep the last successful day.

## Performance measurements

`roof/performance.js` reports startup-to-usable and ready app views (first open versus return), plus a binary unsuccessful-opening flag, through the existing `/api/vitals` endpoint. Timings finish after paint; superseded routes, aborted account frames and background episodes are excluded. Each app summary keeps the slowest observed foreground timing before page hide. At most two summaries per app and twelve per page may be sent, with no retry loop. Only an allowlisted app ID, phone/computer class and bounded numbers leave the browser; routes, account IDs, queries, filenames, content and drafts are never reported.

The existing server origin checks, body cap, rate limit, daily histogram cap and 60-day retention apply. Admin Insights shows timing percentiles and the fraction of summaries containing a failed open. These are sampled observations, not a promise of a fixed speed or an exact per-navigation failure rate. The framework's executable gzip budget is capped at 39 KiB (the earlier 2 KiB continuity allowance plus a reviewed 2 KiB ceiling for curated reopen references and account guards); optional OS layers retain their separate budgets.


## Reopening and explicit app handoffs (3.11)

After `/api/session` verifies the account, the unified shell may restore its last curated app section, opaque Mail/Chat conversation reference, or Files folder/source, plus bounded window scroll. The account-specific `ifl:resume:v1:<owner>` record expires after seven days. Only the bare root is eligible; explicit routes, callback queries and app availability win. An optional native `resumeRoute()` may return its visible conversation reference when a desktop list address hides that pane; the host accepts only its own app and applies the same serializer allowlist. Names, search text, editor content, coordinates, authentication/share tokens and arbitrary aliases are excluded. Sign-out removes these records; a verified account change drops other owners' records. A restored reference never grants access: the app and Files API still enforce their ordinary account checks. A touch, wheel or key interrupts startup scroll restoration.

Drafts remain native app data. Mail keeps its existing bounded, sign-out-cleared local unsent copy immediately on page suspension, then offers Continue after Mail verifies access. Continue opens a reviewable draft without sending. Existing server attachment references must resolve before sending; file bytes are not serialized into the shell. Chats acknowledges draft RPC only after its encrypted IndexedDB write completes, reports failure from flush, and can retry the same text. Page suspension is best effort under browser lifecycle limits; it is not a guarantee against process termination before an asynchronous encrypted write finishes.

`fw.workspace.handoffs` exposes explicit `can(target, kind)`, `send(target, kind, value)` and one-use `take(token)` for two reviewed pairs: Fitness→Weather (`ride`: normalized start coordinates and optional time range) and Weather→Mail (`text`: bounded subject and forecast text). No recipient or send operation is accepted. Payloads live in account memory for at most 60 seconds; delivery is bounded to 20 seconds. Source/target lifetimes, active views and owner are rechecked. No payload enters a URL, browser storage, telemetry, workspace or automatic shared context. Fitness uses its saved route/time; Weather shows the explicit ride forecast. Weather's header opens a Mail draft on request.

Files adds Attach in Mail and Import into Fitness only for eligible, ready, nontrashed files with current versions and app access. These reuse the version-checked private Drive bytes and existing native attachment/import-review workflows via an expiring transfer token. They do not send, save a route, or replay writes. File picker code/styles now load only when a picker/drop action needs them. Weather's normal forecast no longer waits for its optional integration bridge.

The controlled browser profile held Weather's optional bridge response for two seconds. Forecast readiness changed from 2,517 ms to 529 ms, and the file picker left the boot module graph. This is a repeatable local transport comparison, not production network performance. Authenticated Admin Insights remains the source of field timing percentiles; no admin session was available during this release.
