# InFlite OS workspaces v2

`os.inflite.ai` uses Today's existing session, app services and domain engines through an optional workspace host. The apex retains its ordinary Today surface. An explicit `?os=1` flag is available only on localhost and test hosts. It does not enable OS on the production apex or another production subdomain.

The default Ride workspace combines real Fitness and Weather views. Saved workspaces support one to five unique panes from Fitness, Weather, Markets, Chats and Mail. Desktop supports tiled or floating windows with move, resize, snap, minimize and restore controls; a narrow viewport presents one foreground pane with an app switcher. Expanding an app and returning reparents the same app instance, so stores, drafts and chart owners remain attached to their original module lifetime. A workspace never creates a second instance of the same app.

## Ownership

| Layer | Owns |
| --- | --- |
| `workspace.js` | Workspace navigation, active panes, providers, global actions and explicit cross-app intents |
| `workspace-view.js` / `workspace.css` | Stable DOM slots, dock, workspace list and responsive presentation |
| `workspace-state.js` | Validated, account-scoped workspace metadata and legacy migration |
| `workspace-windows.js` | Pure viewport-bounded geometry and window ordering |
| `workspace-commands.js` / `workspace-commands.css` | Existing global search integration and validated notification actions |
| `workspace-files.js` / `workspace-files.css` | Federated, account-owned file metadata and explicit native file actions |
| `workspace-context.js` | Ephemeral location/time selection and subscriptions for one workspace |
| `workspace-catalog.js` | Versioned first-party manifests and allowlisted persisted routes |
| `frame.js` | The single module instance, account lifetime, scoped framework handles, loading and flush |
| App `roof/workspace.js` adapters | Domain snapshots and explicit actions using that app's existing engine |

Every app module remains a singleton within its signed-in frame. `F.view(app)` reuses its normal module record, import, store and service. Moving a view does not unmount it; signing out aborts frame and module ownership before cleanup. Late imports, snapshots, intents and old cleanup callbacks cannot adopt a replacement account or remove a newer owner's attachment.

The manifests describe trusted first-party modules sharing this origin, DOM and JavaScript realm. They are **not a security sandbox**, permission grant or extension boundary. Untrusted apps would need an isolated origin, message schema, explicit capability mediation and separate storage; they cannot use this API as an isolation mechanism. Existing server session, CSRF, origin and app-specific authorization checks remain authoritative.

## Controlled view contract

`F.view(app)` returns a stable handle while that frame lives:

```text
{ el, root, fw, signal,
  build, header, route,                         // read-only current values
  attach({ container, navigate, back, section, header, fill, workspace, depth }),
  load() → Promise<instance | null>,
  show(route, { container?, visible? }) → Promise<boolean>,
  hide({ detach? }), busy(), flush() }
```

`attach` returns an ownership-checked detach callback. The host supplies a real DOM container and the navigation/header callbacks. `show` validates the route against the same app and its current hub switch. A newer show/hide supersedes an older pending import. The host may reparent the root but must not create a second app instance.

While attached, framework navigation, sections, Back, header and fill are pane-scoped. A hidden pane cannot navigate or open a modal. `fw.visible()` requires both document and pane visibility in this mode. Hidden panes receive no document-visible redraw event. Ordinary module navigation retains its existing semantics after expansion; services keep their separate account lifetime. All mounted modules still participate in frame `busy()` and `flush()`, including an editor currently hidden in another pane.

A module gets the account-owned `fw.workspace` capability only under the OS host. The optional `instance.workspace()` method activates an adapter for a module already opened by a cold full-app deep link; it must be idempotent and inert after module abort.

```text
workspace = {
  enabled: true,
  active() → boolean,
  provide({ snapshot(), run(intent, objectId?, { current }), files?({ query?, current }) }) → owned cleanup,
  changed(),
  context: { get(), capture() → currentContextPredicate, subscribe(fn) → cleanup, update(patch, { source }) → boolean }
}
```

Provider callbacks and context writes are bound to the registering app and account. Context sources use the registering app's prefix. Providers expose current domain values and opaque file references; the host does not reimplement training calculations, forecasts, encryption or financial arithmetic.

Asynchronous intents check the host's `current()` predicate after awaited reads and before navigation, context writes or downloads. Leaving and returning does not revive an abandoned intent. A context capture instead follows workspace identity across section changes, so a confirmed ride time can update its own linked forecast without changing another workspace's selection. Nested context updates supersede older subscriber deliveries.

## Metadata, context and explicit actions

Only account ID, workspace ID/name, known app/route references, active pane, normalized window layout and update time are persisted under `ifl:workspace:v2:<account-id>`. Layout contains tile/float mode, app ordering, normalized x/y/width/height and a minimized flag; unknown fields are removed, numeric bounds are finite and clamped, and windows for removed apps are dropped. Eight workspaces and five unique eligible panes are the limits. Stored input is bounded and sanitized on restore. Storage failure falls back to in-memory metadata. Other accounts' records are neither adopted nor cleared by an old owner.

When no v2 record exists, the store reads `ifl:workspace:v1:<account-id>` and migrates valid metadata in memory. Opening does not write; the first user edit saves v2. A present malformed v2 record starts fresh rather than importing an older v1 layout. Retired tabs write a separate key and cannot overwrite or merge current v2 state. Reset writes a default v2 snapshot so retained legacy metadata cannot reappear on reload; it leaves the v1 record intact.

Persisted routes reject queries, encoded values, external URLs, auth/settings flows and share payloads. Live query-based place navigation remains ephemeral. Location, forecast data, ride content, GPX contents and auth material are absent from saved metadata. The live history owner is checked before restoring a workspace; context and live query memory are cleared on account teardown.

Each workspace's location/time context stays in memory. Coordinates are validated and rounded; a time interval is UTC, bounded to 48 hours and a usable forecast horizon. A route's wall-clock schedule and timezone remain distinct from actual UTC instants. Missing location or forecast coverage is reported explicitly.

Changing Weather's place or choosing “Weather for ride” is an explicit context action. Routine forecast refreshes do not silently write a ride location. Scheduling opens Fitness's existing editor and writes only on its confirmed action. Ride sharing uses the existing supported workout card. GPX references resolve against the current account's saved route and export a real escaped GPX file; the host does not fabricate a Chat route-card schema or place GPX contents into a URL.

## Commands, Files and notification actions

InFlite Files lives in the singleton OS screen, with a private My Drive and read-only app collections. Folder navigation uses only validated opaque IDs in `#files=<id>`; virtual locations are account-owned history metadata. Names, search terms and file contents stay out of URLs and persisted workspace state. Transfers are owned by the account service and may continue while the Explorer is hidden; reads and previews abort on navigation. The Frame system-task registry delays automatic reload while a transfer is busy.

Global search uses the existing search UI for apps, saved workspaces, currently available provider actions and Files metadata already loaded into RAM. Search does not silently query Mail or download Chat media. Opening the Files app collection explicitly asks eligible app providers for bounded metadata; unavailable, locked or signed-out sources are reported and their cached metadata is removed. Background metadata loading uses the same singleton module in a hidden, inert slot, without giving it foreground navigation or modal authority.

Fitness resolves existing saved routes and planned workouts to actual GPX, FIT or ZWO exports. Mail lists attachment metadata through its existing authenticated API and opens the native viewer or download action. Chat’s transient source reconciles its complete eligible metadata snapshot immediately on conversation changes and recalls, without fetching content. Chat lists ordinary media only from the currently open decrypted conversation; view-once, disappearing, recalled, sealed or in-flight media are excluded. Providers revalidate account, availability, resource and `current()` after asynchronous reads. File bytes, message bodies, decrypted media and the Files index are not written to workspace storage or the service worker cache.

Notification buttons use validated same-app references and recheck the current account and app availability on activation. Reply and ride-time actions open the existing native composer or schedule editor; the user confirms sending or saving there. Opening a workspace restores the relevant pane when a saved workspace contains that app, with native full-app navigation as the fallback. Ordinary Today notifications retain their existing behavior.

## Optional assets and checks

The fifteen root workspace/Files scripts, four optional stylesheets and `os.webmanifest` form the exact OS-only shell closure. `files-service.js`, `files-apps.js`, `files-metadata.js`, `files-location.js`, `files-drive.js`, `files-explorer.js` and `files-view.js` are explicitly listed alongside the existing quick picker; unrelated scripts remain in the ordinary core budget. Host updater and service worker agree on the exact list. Ordinary HTML does not preload them. The service worker enables this closure only on the exact OS host or explicit local preview, and retains only static assets, never account/API responses.

All five app adapters are literal lazy imports. Their exact `roof/workspace.js` and `roof/workspace.css` paths belong to `connector.lazy`, not the app's ordinary first-open `connector.files`. Once used in OS, the host asks the root worker to retain the static graph plus these curated optional files. Existing installed-app idle caching and network-only exclusions continue to apply. The worker accepts only JS/CSS assets for module build caches and rejects API path segments, documents and data files; it also refuses to replay an old malformed API cache entry.

The core framework budget remains 35 KiB gzip with comments stripped; its request coordinator retains a separate 2 KiB + 128 byte ceiling. Ordinary Markets (40 KB), Fitness (86 KB) and Mail (55 KiB) budgets are unchanged. Files v3 adds a lazy private Drive, Explorer, upload/download lifecycle and account-owned folder history; its exact graph has a separate reviewed ceiling. The base allowance covers Files routing and transfer coordination as well as window scroll ownership. The optional Mail adapter owns its coalesced pane observer to keep responsive layout writes out of ResizeObserver delivery. Commands retains its bounded action ownership and account-scoped Cmd/Ctrl+K listener. The complete optional OS graph has a 74 KiB JS / 13 KiB CSS ceiling:

| Optional component | JS ceiling | CSS ceiling |
| --- | --- | --- |
| Base shell and window management | 26 KiB | 5.5 KiB |
| Commands | 3.5 KiB | 1 KiB |
| Files | 32 KiB | 4 KiB |
| Fitness adapter | 3.75 KiB | 1 KiB |
| Weather adapter | 2.75 KiB | 1 KiB |
| Markets adapter | 1.5 KiB | 1 KiB |
| Chats adapter | 2.75 KiB | 1 KiB |
| Mail adapter | 3.5 KiB | 1 KiB |

Served-size measurements use the same in-memory minifier and gzip settings as the app budget contracts, rather than source-file sizes. The final audit measured 25,765 bytes of base/window JS, 30,749 bytes of Files JS and 73,382 bytes across the complete optional JS graph; complete CSS measured 12,717 bytes. The unchanged ordinary core measured 35,828 bytes against 35,840. The contract prints component totals for each build. The exact optional file exclusion prevents future unrelated files from escaping the ordinary core budget; new assets must be reviewed and added to the closure explicitly. The closure follows both static and literal lazy imports, with a separate entry for the quick picker.


`roofworkspace.test.mjs` checks host selection, updater/worker closure, manifest, static versus lazy graphs, cache path rejection, route opt-in and served sizes. Workspace model tests exercise hostile storage, account replacement, immutable snapshots and context ownership. Real-frame fixtures cover interrupted imports and stale handles. The browser suites use actual module controls and lifecycle with synthetic API data, including native Mail compose/viewer flows, window behavior and account replacement; they do not write production accounts. Model coverage includes legacy migration and retired-writer isolation, three-to-five-app restoration, all-minimized windows, unknown-field stripping, hostile geometry and adversarial route mutations.
